/**
 * Team logos as inlined `data:` URIs, for the server-rendered charts.
 *
 * ---------------------------------------------------------------------------
 * Why this is in the query layer and not in the renderer
 * ---------------------------------------------------------------------------
 * `renderChartSvg` is pure: no I/O, no clock, no randomness past roughjs's
 * seed. That purity is not a style preference -- it is what makes the byte-hash
 * determinism tests meaningful, what makes the SVG snapshots reviewable, and
 * what makes `Cache-Control: immutable` on a settled season honest. A renderer
 * that fetched logos would be none of those things: the same spec would render
 * differently depending on whether a CDN was up.
 *
 * So logos are resolved HERE, by the route, and handed to the renderer as
 * ordinary input. The renderer never learns that a logo came from a network.
 *
 * ---------------------------------------------------------------------------
 * Why `data:` and not the URL
 * ---------------------------------------------------------------------------
 * resvg fetches nothing, ever. An `<image href="https://a.espncdn.com/...">`
 * does not fail loudly under it -- it renders as a hole in the chart, which is
 * exactly the failure mode that ships. The bytes have to be in the document.
 *
 * ---------------------------------------------------------------------------
 * Budget
 * ---------------------------------------------------------------------------
 * A scatter asks for ~25 logos inside a 30s Lambda (`maxDuration` on the chart
 * route). Sequentially, at a pessimistic 1s each, that is the whole budget spent
 * on decoration. So: fetched concurrently, each with its own short timeout, and
 * memoized at module scope by URL -- a school's logo file changes roughly never,
 * and the second chart rendered by a warm Lambda pays nothing at all.
 *
 * Nothing here throws and nothing here is required to succeed. A logo that does
 * not arrive is simply absent from the returned map, and the chart draws the
 * team as a rough mark instead. Degrade, do not fail.
 */
import { getTeamLookup } from './shared'

/** Per-request ceiling. Short: a logo is decoration, and the card has a deadline. */
export const LOGO_FETCH_TIMEOUT_MS = 2_500

/**
 * How many logo fetches are in flight at once. All 25 at once would be fine for
 * us and rude to a single origin; 8 keeps the whole set inside roughly three
 * timeouts even in the worst case.
 */
export const LOGO_FETCH_CONCURRENCY = 8

/**
 * Size ceiling per logo. ESPN's 500px team logos are ~15-30KB; anything an
 * order of magnitude past that is not a logo, and base64 inflates by a third
 * into a document we then rasterize.
 */
const MAX_LOGO_BYTES = 256 * 1024

/**
 * How long a FAILURE is remembered. Successes are cached forever (the file does
 * not change), but a failure is usually about the network rather than the URL,
 * and pinning it for the life of the Lambda would turn one bad minute into a
 * permanently logo-less chart on that instance.
 */
const FAILURE_TTL_MS = 60_000

interface CacheEntry {
  /** The `data:` URI, or null when the fetch failed. */
  uri: string | null
  /** `Infinity` for a success -- see FAILURE_TTL_MS. */
  expires: number
}

/**
 * Module scope, deliberately: it lives as long as the Lambda instance and is
 * shared by every request it serves, which is the entire point. Keyed by URL,
 * not by school, so two schools sharing an asset share the fetch.
 */
const LOGO_CACHE = new Map<string, CacheEntry>()

/** Empties the module-scope cache. For tests -- nothing in the app calls it. */
export function resetTeamLogoCache(): void {
  LOGO_CACHE.clear()
}

/** Only http(s) is fetchable; anything else in the column is data, not a URL. */
function isFetchableUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * One logo, as a `data:` URI, or null.
 *
 * The content type comes from the response rather than from the file
 * extension: resvg sniffs the payload anyway, but a `text/html` error page
 * served with a 200 (which CDNs do) would otherwise be inlined as an image and
 * render as nothing.
 */
async function fetchLogo(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(LOGO_FETCH_TIMEOUT_MS),
      // The renderer is cached hard downstream; no need for a second layer of
      // HTTP caching semantics we would then have to reason about.
      cache: 'no-store',
    })
    if (!response.ok) return null

    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!contentType.startsWith('image/')) return null

    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_LOGO_BYTES) return null

    return `data:${contentType};base64,${bytes.toString('base64')}`
  } catch {
    // Timeout, DNS, TLS, a truncated body: all the same outcome to the caller.
    return null
  }
}

/** `fetchLogo` with the module cache in front of it. */
async function cachedLogo(url: string): Promise<string | null> {
  const hit = LOGO_CACHE.get(url)
  if (hit && hit.expires > Date.now()) return hit.uri

  const uri = await fetchLogo(url)
  LOGO_CACHE.set(url, { uri, expires: uri === null ? Date.now() + FAILURE_TTL_MS : Infinity })
  return uri
}

/**
 * Runs `worker` over `items`, at most `limit` at a time.
 *
 * A pool rather than `Promise.all` over the lot: 25 simultaneous requests to
 * one origin is the kind of thing that gets an IP throttled, and the whole set
 * still finishes inside the route's budget at 8-wide.
 */
async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  async function run(): Promise<void> {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      results[index] = await worker(items[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

/**
 * Logos for `teams`, as `data:` URIs, keyed by school name.
 *
 * A team is absent from the returned map when it has no logo row, when its
 * logo URL is unusable, or when the fetch did not come back in time. All three
 * are the same thing to the caller: draw the fallback mark. There is no error
 * channel because there is no error the caller could act on.
 */
export async function getTeamLogoDataUris(teams: readonly string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>()
  if (teams.length === 0) return resolved

  let lookup: Awaited<ReturnType<typeof getTeamLookup>>
  try {
    lookup = await getTeamLookup()
  } catch (error) {
    // The logo table being unreachable is not a reason to fail a chart whose
    // actual data already arrived.
    console.error('[teamLogos] team lookup failed:', error)
    return resolved
  }

  const byUrl = new Map<string, string[]>()
  for (const team of new Set(teams)) {
    const url = lookup.get(team)?.logo
    if (!url || !isFetchableUrl(url)) continue
    const sharing = byUrl.get(url)
    if (sharing) sharing.push(team)
    else byUrl.set(url, [team])
  }

  const urls = [...byUrl.keys()]
  const uris = await mapPool(urls, LOGO_FETCH_CONCURRENCY, cachedLogo)

  urls.forEach((url, index) => {
    const uri = uris[index]
    if (!uri) return
    for (const team of byUrl.get(url) ?? []) resolved.set(team, uri)
  })

  return resolved
}
