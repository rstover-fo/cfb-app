/**
 * Coarse in-memory rate limiter for the chart image route.
 *
 * ---------------------------------------------------------------------------
 * READ THIS BEFORE TRUSTING IT
 * ---------------------------------------------------------------------------
 * This is a **speed bump, not a control.** Vercel runs each route in Lambda
 * instances that share no state: N concurrent instances means N independent
 * counters, and a cold start resets one to zero. A determined caller routes
 * around it without trying. The actual control on this endpoint is the HMAC
 * signature in `./signing.ts` -- an unsigned request is refused no matter how
 * slowly it arrives.
 *
 * What this does buy, per instance: a single client cannot spin one Lambda
 * into a rasterization loop, and signature-guessing gets throttled on whatever
 * instance the attempts land on. That is worth the ~20 lines. Anything
 * stronger needs shared state (Upstash/Redis or Vercel's WAF).
 *
 * Bounded by construction: buckets are pruned on read, so the map cannot grow
 * without limit across a long-lived instance.
 */

/** Requests allowed per window, per key. Generous -- Discord's proxy is bursty. */
export const CHART_RATE_LIMIT = 120

/** Window length in milliseconds. */
export const CHART_RATE_WINDOW_MS = 60_000

interface Bucket {
  count: number
  /** Epoch ms at which this bucket resets. */
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export interface RateLimitResult {
  ok: boolean
  /** Seconds until the caller may retry. Only meaningful when `ok` is false. */
  retryAfterSeconds: number
}

/**
 * Records a hit for `key` and reports whether it is allowed.
 *
 * Fixed-window, not sliding: a caller can technically land 2x the limit across
 * a window boundary. Fine for a speed bump; a sliding window would cost memory
 * proportional to request count for no real gain here.
 */
export function checkChartRateLimit(key: string, now: number = Date.now()): RateLimitResult {
  pruneExpired(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + CHART_RATE_WINDOW_MS })
    return { ok: true, retryAfterSeconds: 0 }
  }

  existing.count += 1
  if (existing.count > CHART_RATE_LIMIT) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) }
  }

  return { ok: true, retryAfterSeconds: 0 }
}

/** Test seam: drops all buckets. */
export function resetChartRateLimit(): void {
  buckets.clear()
}

function pruneExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

/**
 * Best-effort client identity. `x-forwarded-for`'s first entry is what Vercel
 * puts the real client IP in; everything else is a fallback so a missing
 * header collapses every caller into one shared bucket rather than skipping
 * the limit entirely.
 */
export function rateLimitKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  if (first) return first
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}
