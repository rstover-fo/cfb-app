/**
 * Chart image endpoint: signed URL in, PNG out.
 *
 *   /api/chart/team-playcalling.png?team=Oklahoma&season=2026&mode=light&sig=v1.<22ch>
 *   /api/chart/team-metric-trend.png?from=2015&metric=sp_defense&teams=Oklahoma,Clemson&to=2025&mode=light&sig=v1.<22ch>
 *   /api/chart/team-metric-bars.png?metric=sp_defense&season=2025&teams=Oklahoma,Texas&mode=light&sig=v1.<22ch>
 *   /api/chart/team-metric-scatter.png?x=sp_offense&y=sp_defense&season=2025&teams=Oklahoma,Texas&mode=light&sig=v1.<22ch>
 *
 * The caller sends a *spec* -- which metric, which teams, which seasons -- and
 * this route runs the query. Data series never travel in the URL: the URL has
 * to stay short, permanent and signable, because Discord's media proxy
 * re-fetches it on cache eviction and cannot send an auth header.
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
import type { TrendAnnotation } from '@/lib/charts/server/teamMetricTrend'
import { checkChartRateLimit, rateLimitKey } from '@/lib/charts/server/rateLimit'
import { verifyChartSignature } from '@/lib/charts/server/signing'
import type { ChartThemeName } from '@/lib/charts/tokens'
import { METRICS, METRIC_IDS, type MetricId } from '@/lib/charts/metrics'
import { CURRENT_SEASON } from '@/lib/queries/constants'
import { getPlaycallingProfile } from '@/lib/queries/playcalling'
import { getTeamLogoDataUris } from '@/lib/queries/teamLogos'
import {
  getTeamMetricField,
  getTeamMetricHistory,
  getTeamMetricSeason,
  MAX_METRIC_TEAMS,
  MAX_TREND_SPAN,
  METRIC_FIELD_SIZE,
  MIN_METRIC_SEASON,
} from '@/lib/queries/teamMetric'

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
  /**
   * The NEWEST season this render depends on -- it selects the Cache-Control
   * branch. A single-season chart passes its season; a range passes its end,
   * so a decade ending in a settled year is immutable like any other settled
   * render, and only a range touching the current season gets the short TTL.
   */
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

// ---------------------------------------------------------------------------
// team-metric-* -- the generative family
// ---------------------------------------------------------------------------
// Shape is a chart id (see the CHART_IDS comment in
// src/lib/charts/server/svg.tsx for why it is an id and not a parameter), but
// the data axes are one vocabulary: which metric, which teams, which season(s).
// Those params are declared once here and composed per shape, so a trend URL
// and a bars URL cannot disagree about what a `metric` or a `teams` is.
//
// Everything a renderer needs still fits in a signable query string because the
// ROUTE runs the query -- the caller sends a spec, never a data series. That is
// what keeps these URLs permanent, cacheable, and short enough for Discord.

/** A season inside the window `api.team_history` can plausibly answer for. */
const metricSeason = z.coerce.number().int().min(MIN_METRIC_SEASON).max(CURRENT_SEASON + 5)

const metricParam = z.enum(METRIC_IDS)

/**
 * `teams` is one comma-joined list rather than a repeated param: repeated keys
 * survive `URLSearchParams` but not `Object.fromEntries`, which the handler
 * uses to feed zod. No FBS school name contains a comma (asserted in the query
 * tests), so the split is unambiguous.
 *
 * Order is preserved, not sorted: it is the caller's job to normalize, and it
 * already has (see `renderChartTool`). Preserving it means series colors
 * follow the order the user named the teams in, and the same request always
 * mints the same URL.
 */
const metricTeamsParam = z
  .string()
  .min(1)
  .max(240)
  .transform(raw =>
    raw
      .split(',')
      .map(team => team.trim())
      .filter(Boolean),
  )
  .refine(teams => teams.length >= 1, 'teams must name at least one team')
  .refine(teams => teams.length <= MAX_METRIC_TEAMS, `teams accepts at most ${MAX_METRIC_TEAMS} teams`)
  .refine(teams => new Set(teams).size === teams.length, 'teams must be unique')

/**
 * The empty resolution every `team-metric-*` shape falls back to, so "nothing
 * on record" reads identically whichever shape was asked for.
 *
 * `season` is the newest season the render depended on -- see
 * `ChartResolution` -- which for a range is its end and for a single-season
 * shape is that season.
 */
function noMetricData(
  metric: MetricId,
  teams: string[],
  range: string,
  season: number,
  theme: ChartThemeName,
): ChartResolution {
  return {
    spec: {
      chart: 'empty',
      title: `No ${METRICS[metric].label.toLowerCase()} on record`,
      message: `Nothing charted for ${teams.join(', ')} in ${range}.`,
    },
    season,
    theme,
    hasData: false,
  }
}

/**
 * `annotations` is `<season>:<label>`, pipe-separated -- e.g.
 * `2022:Venables hired`. Deliberately a flat string: a nested structure would
 * need its own encoding inside a query param that also has to be signed, and
 * the whole point of the URL shape is that it stays greppable in a log.
 */
const MAX_ANNOTATIONS = 3
const MAX_ANNOTATION_LABEL = 40

const trendAnnotationsParam = z
  .string()
  .max(240)
  .transform(raw =>
    raw
      .split('|')
      .map(entry => entry.trim())
      .filter(Boolean)
      .map(entry => {
        const separator = entry.indexOf(':')
        if (separator <= 0) return null
        const season = Number(entry.slice(0, separator))
        const label = entry.slice(separator + 1).trim()
        if (!Number.isInteger(season) || !label) return null
        return { season, label } satisfies TrendAnnotation
      }),
  )
  .refine(entries => entries.every(entry => entry !== null), 'annotations look like "2022:Venables hired"')
  .transform(entries => entries as TrendAnnotation[])
  .refine(entries => entries.length <= MAX_ANNOTATIONS, `at most ${MAX_ANNOTATIONS} annotations`)
  .refine(
    entries => entries.every(entry => entry.label.length <= MAX_ANNOTATION_LABEL),
    `annotation labels are at most ${MAX_ANNOTATION_LABEL} characters`,
  )

const teamMetricTrendParams = z
  .object({
    metric: metricParam,
    teams: metricTeamsParam,
    from: metricSeason,
    to: metricSeason,
    annotations: trendAnnotationsParam.optional(),
    mode: modeParam,
    sig: sigParam,
  })
  .strict()
  .refine(input => input.to >= input.from, { message: 'to must be the same season as from or later', path: ['to'] })
  .refine(input => input.to - input.from < MAX_TREND_SPAN, {
    message: `season range is at most ${MAX_TREND_SPAN} seasons`,
    path: ['to'],
  })

// ---------------------------------------------------------------------------
// team-metric-bars
// ---------------------------------------------------------------------------
// Same metric, same teams, one `season` where the trend takes `from`/`to`. No
// `annotations`: a dated event is a mark on a time axis, and this chart has
// none. `.strict()` therefore rejects one rather than ignoring it -- a caller
// that sent annotations here has misunderstood the chart, and a silently
// dropped param would also break the "what was signed is what was rendered"
// identity.

const teamMetricBarsParams = z
  .object({
    metric: metricParam,
    teams: metricTeamsParam,
    season: metricSeason,
    mode: modeParam,
    sig: sigParam,
  })
  .strict()

// ---------------------------------------------------------------------------
// team-metric-scatter
// ---------------------------------------------------------------------------
// Two metrics instead of one, and `teams` becomes OPTIONAL -- this is the only
// shape in the family that draws something worth looking at with no team named
// at all, because its subject can be the season's field itself. When teams ARE
// named they are highlighted against that field rather than being the whole
// chart, which is what lets a #84 team appear on a top-25 card.
//
// `rankBy` chooses the field and defaults to `sp_rating`. Declared as a plain
// optional-with-default exactly like `mode`: absent from the URL, absent from
// the signed string, and filled in identically on both sides.

const teamMetricScatterParams = z
  .object({
    x: metricParam,
    y: metricParam,
    season: metricSeason,
    rankBy: metricParam.optional().default('sp_rating'),
    teams: metricTeamsParam.optional(),
    mode: modeParam,
    sig: sigParam,
  })
  .strict()
  .refine(input => input.x !== input.y, {
    // Not pedantry: a metric against itself is the line y = x, which tells the
    // reader nothing and would put every logo on one diagonal.
    message: 'x and y must be different metrics',
    path: ['y'],
  })

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

  'team-metric-trend': defineChart(teamMetricTrendParams, async input => {
    // Same reason as above: not wrapped in React `cache()` (see
    // src/lib/queries/mcp.ts:18-24 -- a Route Handler is not a render pass).
    const series = await getTeamMetricHistory(input.teams, input.metric, input.from, input.to)
    const range = input.from === input.to ? `${input.from}` : `${input.from}–${input.to}`
    const hasData = series.some(entry => entry.points.length > 0)

    // The range's end is the newest season this render depends on, so a decade
    // ending in a settled season can never change.
    if (!hasData) return noMetricData(input.metric, input.teams, range, input.to, input.mode)

    return {
      spec: {
        chart: 'team-metric-trend',
        trend: {
          metric: input.metric,
          from: input.from,
          to: input.to,
          series,
          annotations: input.annotations,
        },
      },
      season: input.to,
      theme: input.mode,
      hasData: true,
    }
  }),

  'team-metric-bars': defineChart(teamMetricBarsParams, async input => {
    // Same reason as above: not wrapped in React `cache()`.
    const series = await getTeamMetricSeason(input.teams, input.metric, input.season)
    const hasData = series.some(entry => entry.value !== null)

    // One season, so it is trivially the newest this render depends on -- a
    // settled season is immutable and the current one gets the short TTL, on
    // exactly the same rule as every other chart.
    if (!hasData) {
      return noMetricData(input.metric, input.teams, String(input.season), input.season, input.mode)
    }

    return {
      spec: {
        chart: 'team-metric-bars',
        bars: { metric: input.metric, season: input.season, series },
      },
      season: input.season,
      theme: input.mode,
      hasData: true,
    }
  }),

  'team-metric-scatter': defineChart(teamMetricScatterParams, async input => {
    // Same reason as above: not wrapped in React `cache()`.
    const highlight = input.teams ?? []
    const field = await getTeamMetricField(
      input.x,
      input.y,
      input.season,
      input.rankBy,
      highlight,
      METRIC_FIELD_SIZE,
    )

    if (field.points.length === 0) {
      return {
        spec: {
          chart: 'empty',
          title: `No ${METRICS[input.y].label.toLowerCase()} vs ${METRICS[input.x].label.toLowerCase()} on record`,
          message: `Nothing charted for ${input.season}.`,
        },
        season: input.season,
        theme: input.mode,
        hasData: false,
      }
    }

    // THE fetch. It happens here, in the route, and never in the renderer:
    // `renderChartSvg` is pure, and that purity is what makes the byte-hash
    // tests, the SVG snapshots and the `immutable` Cache-Control below sound.
    // The renderer receives already-inlined `data:` URIs as ordinary input.
    //
    // Unawaitable failure is not a failure: `getTeamLogoDataUris` never
    // rejects and never throws, and a team absent from the map draws a rough
    // fallback mark. A cold Lambda with a slow CDN renders a slightly plainer
    // chart, not an error card.
    const logos = await getTeamLogoDataUris(field.points.map(point => point.team))

    return {
      spec: {
        chart: 'team-metric-scatter',
        scatter: {
          x: input.x,
          y: input.y,
          season: input.season,
          rankBy: input.rankBy,
          fieldSize: METRIC_FIELD_SIZE,
          marks: field.points.map(point => ({ ...point, logo: logos.get(point.team) ?? null })),
          highlight,
        },
      },
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
