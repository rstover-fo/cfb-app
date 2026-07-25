/**
 * Chart image endpoint: signed URL in, PNG out.
 *
 *   /api/chart/team-playcalling.png?team=Oklahoma&season=2026&mode=light&sig=v1.<22ch>
 *
 * Serves the server-rendered roughjs charts from `src/lib/charts/server` to
 * Discord, which embeds the URL and fetches it through its own media proxy.
 *
 * ---------------------------------------------------------------------------
 * The `.png` suffix
 * ---------------------------------------------------------------------------
 * Required, and stripped to recover the registry key. Discord (and most embed
 * consumers) decide "is this an image?" from the path extension before they
 * ever look at `Content-Type`; an extensionless URL renders as a link, not a
 * picture. The suffix is not part of the signed string -- see ./signing.
 *
 * ---------------------------------------------------------------------------
 * Auth
 * ---------------------------------------------------------------------------
 * A stable HMAC in `?sig=`, verified by `verifyChartSignature`. Discord's proxy
 * cannot send an `Authorization` header, and the URL ends up in a public
 * channel and in Discord's CDN, so neither a bearer token nor an expiring
 * signature works here. The full reasoning lives in
 * `src/lib/charts/server/signing.ts` -- read it before changing this.
 *
 * ---------------------------------------------------------------------------
 * Why a 4xx is worse than a rendered apology
 * ---------------------------------------------------------------------------
 * Anything other than a PNG shows up in Discord as a broken-image icon with no
 * explanation, so the failure modes split by fault:
 *
 * | Condition                             | Response                          |
 * |---------------------------------------|-----------------------------------|
 * | unknown chart / missing `.png`        | 404 JSON, no-store                |
 * | missing/invalid `sig`, or secret unset| 403 JSON, no-store                |
 * | rate limited                          | 429 JSON, no-store                |
 * | zod rejection (incl. unknown param)   | 400 JSON, no-store                |
 * | valid sig, no data                    | 200 PNG -- the empty card         |
 * | valid sig, render throws              | 200 PNG -- error card + console   |
 *
 * A valid signature means the URL came from our own tooling, so a message is
 * going to be posted either way and the reader deserves a legible card. An
 * invalid signature is forged or broken: fail loudly and cheaply. No exception
 * may escape to a 500 on the valid-signature path.
 */
import { z } from 'zod'
import { isChartId, renderChartPng, type ChartId, type ChartSpec } from '@/lib/charts/server'
import { checkChartRateLimit, rateLimitKey } from '@/lib/charts/server/rateLimit'
import { verifyChartSignature } from '@/lib/charts/server/signing'
import type { ChartThemeName } from '@/lib/charts/tokens'
import { CURRENT_SEASON } from '@/lib/queries/constants'
import { getPlaycallingProfile } from '@/lib/queries/playcalling'

// Node runtime, not edge: rasterization goes through the native
// `@resvg/resvg-js` binary and reads the vendored TTFs off disk, and
// ./signing uses node:crypto's timingSafeEqual for constant-time comparison.
export const runtime = 'nodejs'
// Generous relative to a ~200ms render. The ceiling that matters is a cold
// start that has to load the native resvg binary before the first rasterize.
export const maxDuration = 30

const PNG_SUFFIX = '.png'

// ---------------------------------------------------------------------------
// Cache-Control
// ---------------------------------------------------------------------------
// These headers are aimed at the Vercel CDN, not at Discord: Discord caches by
// URL on its own schedule and largely ignores what we say here. The point is
// that a repeat fetch (Discord re-fetching after a cache eviction, someone
// opening the image in a browser, a second channel embedding the same chart)
// is served from the edge instead of booting a Lambda to re-rasterize bytes
// that are deterministic anyway -- `renderChartSvg` is pure and roughjs is
// seeded, so a given signed URL always produces identical bytes.
//
// A settled season can never change, so it is immutable. The current season
// changes weekly, so it gets a short shared TTL plus a long
// stale-while-revalidate: a stale chart briefly is much better than a cold
// render in the request path.
const CACHE_SETTLED_SEASON = 'public, max-age=31536000, s-maxage=31536000, immutable'
const CACHE_CURRENT_SEASON = 'public, s-maxage=3600, stale-while-revalidate=86400'
// Empty card: the data may land at any moment (a game finishes, a build runs),
// so cache it only long enough to absorb a burst of retries.
const CACHE_EMPTY = 'public, s-maxage=300, stale-while-revalidate=600'
const CACHE_NONE = 'no-store'

// ---------------------------------------------------------------------------
// Chart registry
// ---------------------------------------------------------------------------

interface ChartResolution {
  /** What to draw. An `empty` spec when the query came back with nothing. */
  spec: ChartSpec
  /** Season requested -- selects the Cache-Control branch. */
  season: number
  theme: ChartThemeName
  /** False when the query returned no row, which shortens the cache TTL. */
  hasData: boolean
}

type ParseResult =
  | { ok: true; resolve: () => Promise<ChartResolution> }
  | { ok: false; message: string }

interface ChartRoute {
  parse(raw: Record<string, string>): ParseResult
}

/**
 * Pairs a param schema with its data loader so the two cannot drift, and so
 * the loader receives already-validated input.
 */
function defineChart<S extends z.ZodTypeAny>(
  schema: S,
  resolve: (input: z.output<S>) => Promise<ChartResolution>,
): ChartRoute {
  return {
    parse(raw) {
      const parsed = schema.safeParse(raw)
      if (!parsed.success) return { ok: false, message: describeIssues(parsed.error) }
      const input = parsed.data as z.output<S>
      return { ok: true, resolve: () => resolve(input) }
    },
  }
}

// `mode` mirrors the site's two palettes (src/lib/charts/tokens.ts).
const modeParam = z.enum(['light', 'dark']).optional().default('light')

// `sig` has to be declared even though ./signing consumes it: `.strict()`
// rejects any key the schema does not know about, and the signature param is
// legitimately present on every request.
const sigParam = z.string().min(1)

/**
 * `.strict()` is load-bearing, not tidiness. The signature covers exactly the
 * params present in the URL; if an unknown param were silently dropped here,
 * the request the route serves and the request that was signed would be
 * different objects. Rejecting the unknown key keeps "what was signed" and
 * "what was rendered" identical by construction.
 */
const teamPlaycallingParams = z
  .object({
    team: z.string().min(1).max(120),
    // Query values are strings; coerce, then constrain to a plausible season.
    season: z.coerce.number().int().min(1869).max(CURRENT_SEASON + 5),
    mode: modeParam,
    sig: sigParam,
  })
  .strict()

// Record<ChartId, ...> so adding an id to CHART_IDS without a route here is a
// compile error rather than a runtime 404.
const CHART_ROUTES: Record<ChartId, ChartRoute> = {
  'team-playcalling': defineChart(teamPlaycallingParams, async input => {
    // Not wrapped in React `cache()` here, for the reason documented at
    // src/lib/queries/mcp.ts:18-24: cache() de-duplicates within a single RSC
    // render pass, and a Route Handler is not a render pass. (The query fn's
    // own cache() wrapper is harmless -- it just has nothing to dedupe.)
    const profile = await getPlaycallingProfile(input.team, input.season)

    if (!profile) {
      return {
        spec: {
          chart: 'empty',
          title: 'No playcalling profile yet',
          message: `Nothing charted for ${input.team} in ${input.season}.`,
        },
        season: input.season,
        theme: input.mode,
        hasData: false,
      }
    }

    return {
      spec: { chart: 'team-playcalling', profile },
      season: input.season,
      theme: input.mode,
      hasData: true,
    }
  }),
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

interface ChartRouteContext {
  params: Promise<{ chart: string }>
}

async function handleRequest(request: Request, context: ChartRouteContext): Promise<Response> {
  const { chart: segment } = await context.params

  // 1. Registry key. The `.png` suffix is mandatory; without it the URL is not
  //    a chart URL as far as this route is concerned.
  const key = segment.endsWith(PNG_SUFFIX) ? segment.slice(0, -PNG_SUFFIX.length) : null
  if (!key || !isChartId(key)) {
    return jsonError(404, `Unknown chart "${segment}". Chart URLs look like /api/chart/<chart>.png.`)
  }

  const url = new URL(request.url)

  // 2. Signature. Fails closed when CHART_SIGNING_SECRET is unset.
  const signature = verifyChartSignature(key, url.searchParams)
  if (!signature.ok) return jsonError(signature.status, signature.message ?? 'Forbidden')

  // 3. Params.
  const parsed = CHART_ROUTES[key].parse(Object.fromEntries(url.searchParams))
  if (!parsed.ok) return jsonError(400, parsed.message)

  // 4. Rate limit, deliberately AFTER verification rather than before it.
  //
  //    Throttling signature-guessing sounds like the point, but the signature
  //    is 128 bits of HMAC -- guessing is not a threat any limiter meaningfully
  //    changes. Everything an unsigned request touches is microseconds of
  //    string work, and the limiter runs inside the Lambda, so the invocation
  //    (the part that actually costs money) has already happened by the time it
  //    is consulted. Placed first it therefore protects nothing measurable,
  //    while adding a way for a *legitimate* signed request to get a 429 --
  //    which in Discord is an invisible broken embed.
  //
  //    Placed here it guards the thing actually worth guarding: repeated
  //    rasterization from a leaked URL, which is the realistic abuse and the
  //    only expensive step. In-memory and per-Lambda-instance, so still a speed
  //    bump rather than a control -- the signature is the control. See
  //    ./rateLimit.
  const limit = checkChartRateLimit(rateLimitKey(request))
  if (!limit.ok) {
    return jsonError(429, 'Too many chart requests. Slow down.', {
      'retry-after': String(limit.retryAfterSeconds),
    })
  }

  // 5. Past this point the caller proved they hold the signing secret, so
  //    every outcome is a 200 PNG. Nothing below may throw out of the handler.
  try {
    const resolution = await parsed.resolve()
    const png = await renderChartPng(resolution.spec, { theme: resolution.theme })
    return pngResponse(png, cacheControlFor(resolution))
  } catch (error) {
    // Stack included deliberately: this is the only signal that a signed,
    // well-formed request produced an apology card instead of a chart.
    console.error(`[chart] ${key} failed for ${url.search}`, error)
    return await errorCardResponse(themeFromQuery(url))
  }
}

function cacheControlFor(resolution: ChartResolution): string {
  if (!resolution.hasData) return CACHE_EMPTY
  return resolution.season < CURRENT_SEASON ? CACHE_SETTLED_SEASON : CACHE_CURRENT_SEASON
}

/** `mode` has already passed zod by the time this runs; treat anything else as light. */
function themeFromQuery(url: URL): ChartThemeName {
  return url.searchParams.get('mode') === 'dark' ? 'dark' : 'light'
}

async function errorCardResponse(theme: ChartThemeName): Promise<Response> {
  try {
    const png = await renderChartPng(
      {
        chart: 'empty',
        title: 'Chart unavailable',
        message: 'Something went wrong rendering this chart -- try again in a moment.',
      },
      { theme },
    )
    // no-store: a transient failure must not get pinned in the CDN for an hour.
    return pngResponse(png, CACHE_NONE)
  } catch (fatal) {
    // Reaching here means the rasterizer itself is unusable -- missing fonts, a
    // broken native binary -- so even the apology card cannot be drawn. This is
    // the one place the "never 500 on a valid signature" rule is deliberately
    // NOT applied.
    //
    // The rule exists because a non-image response renders as a broken embed in
    // Discord. But a 1x1 transparent PNG is *invisible*, which is no better for
    // the reader and strictly worse for us: a 200 looks healthy to Vercel's
    // runtime error tracking and to any uptime check, so a totally dead
    // rasterizer would report as fine. Nothing here is recoverable by the
    // caller, and both outcomes are equally broken on screen -- so prefer the
    // one that is loud in the dashboard over the one that is silent.
    console.error('[chart] error card render failed -- rasterizer is unusable', fatal)
    return jsonError(500, 'Chart rendering is unavailable.')
  }
}

function pngResponse(png: Buffer, cacheControl: string): Response {
  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'content-length': String(png.byteLength),
      'cache-control': cacheControl,
      'x-content-type-options': 'nosniff',
    },
  })
}

function jsonError(status: number, message: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': CACHE_NONE,
      ...extra,
    },
  })
}

function describeIssues(error: z.ZodError): string {
  const detail = error.issues
    .map(issue => {
      const path = issue.path.join('.')
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join('; ')
  return `Invalid chart parameters. ${detail}`
}

// GET and HEAD share one handler. HEAD is exported explicitly rather than left
// to the framework because Discord's media proxy issues HEAD before GET, and a
// 405 there is an invisible failure -- the embed simply never appears, with
// nothing in the logs to explain it. The runtime drops the body for HEAD, so
// the Content-Length the client sees is the real one.
export { handleRequest as GET, handleRequest as HEAD }
