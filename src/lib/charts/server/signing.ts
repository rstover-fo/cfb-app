/**
 * Stable HMAC signing for chart image URLs.
 *
 * ---------------------------------------------------------------------------
 * Why this exists, and why it is shaped this way
 * ---------------------------------------------------------------------------
 * Chart PNGs are posted into Discord as embed images. Discord's media proxy
 * fetches those URLs itself, and it **cannot send an `Authorization` header**,
 * so the credential has to live in the URL. That rules out the two obvious
 * options:
 *
 * 1. Reusing `MCP_AUTH_TOKEN` as `?token=` (the claude.ai-connector escape
 *    hatch in `src/lib/mcp/auth.ts`) would publish a full-access MCP
 *    credential -- including `run_sql` -- into a channel read by ~100 people
 *    and retained indefinitely by Discord's CDN. Never do this.
 * 2. Expiring signatures break history. Discord re-fetches an image whenever
 *    its cache evicts, which can be weeks after the message was posted, so an
 *    expiry turns every historical chart in the channel into a broken image.
 *
 * What is left is a **stable** HMAC over the canonical request params, keyed
 * by a dedicated secret (`CHART_SIGNING_SECRET`) that grants exactly one
 * capability: rendering a chart someone already had the parameters for. The
 * signature is versioned (`sig=v1.<22 chars>`) so a future scheme can be
 * introduced without 403-ing the charts already sitting in the channel: a
 * verifier can accept `v1` and `v2` side by side during a migration.
 *
 * Producer (`signChartUrl`, used by the phase-2.3 `render_chart` MCP tool) and
 * consumer (`verifyChartSignature`, used by the route) live in this one module
 * on purpose. If the canonical-string construction ever drifts between them,
 * every chart 403s; keeping both on one code path with a round-trip test makes
 * that drift impossible.
 *
 * Fails closed, exactly like `src/lib/mcp/auth.ts`: with `CHART_SIGNING_SECRET`
 * unset, every request is refused. There is no "no secret configured -> allow".
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/** Current signature scheme. Encoded in the `sig` value and in the MAC input. */
export const CHART_SIG_VERSION = 'v1'

/** Query parameter carrying the signature. Excluded from the signed string. */
export const CHART_SIG_PARAM = 'sig'

/**
 * Bytes of HMAC output kept. 16 bytes -> exactly 22 base64url characters, and
 * 128 bits is far beyond brute-force for a value that is never enumerable
 * (an attacker has to guess the digest for a specific team/season/mode).
 */
const SIGNATURE_BYTES = 16

/** Values accepted for a chart param. Numbers are stringified canonically. */
export type ChartUrlParams = Record<string, string | number>

/**
 * The exact bytes that get MAC'd.
 *
 * Shape: `v1:<chart>?<params sorted by key, url-encoded>`, with `sig` removed.
 *
 * - The chart id is included so a signature for `team-playcalling` cannot be
 *   replayed against a future chart that happens to take the same params.
 * - The version prefix is inside the MAC input, not just alongside it, so a
 *   `v1` digest can never be presented as a `v2` one.
 * - Params are sorted, so a client (or Discord, or a proxy) reordering the
 *   query string still verifies. Encoding runs through `URLSearchParams` on
 *   both sides, which keeps `&`/`=` inside values from shifting the boundaries.
 */
export function canonicalChartString(chart: string, params: Iterable<[string, string]>): string {
  const canonical = new URLSearchParams()
  for (const [key, value] of params) {
    if (key === CHART_SIG_PARAM) continue
    canonical.append(key, value)
  }
  canonical.sort()
  return `${CHART_SIG_VERSION}:${chart}?${canonical.toString()}`
}

/** Raw digest for a canonical string. Not exported -- callers want sign/verify. */
function computeDigest(secret: string, canonical: string): string {
  return createHmac('sha256', secret)
    .update(canonical, 'utf8')
    .digest()
    .subarray(0, SIGNATURE_BYTES)
    .toString('base64url')
}

// SHA-256 both sides before comparing so timingSafeEqual always receives
// equal-length (32-byte) buffers -- avoids both a length-mismatch throw and
// timing leakage of the expected digest's length. Mirrors hashToken() in
// src/lib/mcp/auth.ts.
function hashDigest(digest: string): Buffer {
  return createHash('sha256').update(digest, 'utf8').digest()
}

/** Constant-time comparison of two signature digests. */
export function signaturesMatch(provided: string, expected: string): boolean {
  return timingSafeEqual(hashDigest(provided), hashDigest(expected))
}

function requireSecret(): string {
  const secret = process.env.CHART_SIGNING_SECRET
  if (!secret) {
    throw new Error(
      'CHART_SIGNING_SECRET is not set in this deployment. Chart URLs cannot be signed. ' +
        'Set it in the environment (and on Vercel) before rendering charts.',
    )
  }
  return secret
}

/**
 * Signs a chart request and returns the `sig` value (`v1.<22 chars>`).
 *
 * Throws when the secret is unset -- the producing side should fail loudly at
 * signing time rather than emit a URL that will 403 in a channel.
 */
export function signChartParams(chart: string, params: ChartUrlParams): string {
  const entries = Object.entries(params).map(([key, value]) => [key, String(value)] as [string, string])
  return `${CHART_SIG_VERSION}.${computeDigest(requireSecret(), canonicalChartString(chart, entries))}`
}

/**
 * Absolute base URL charts are served from.
 *
 * `CHART_BASE_URL` wins when set (preview deployments, local tunnels); the
 * fallback is the Vercel-injected production domain. Discord fetches these
 * URLs from its own infrastructure, so a relative or `localhost` URL is
 * useless -- better to throw here than to post a dead embed.
 */
export function chartBaseUrl(): string {
  const explicit = process.env.CHART_BASE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')

  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercelDomain) return `https://${vercelDomain}`

  throw new Error(
    'No chart base URL available: set CHART_BASE_URL (or run where VERCEL_PROJECT_PRODUCTION_URL is injected).',
  )
}

export interface SignChartUrlOptions {
  /** Override the base URL. Defaults to `chartBaseUrl()`. */
  baseUrl?: string
}

/**
 * Builds the full, signed, Discord-ready chart URL.
 *
 * The `.png` suffix on the path segment is required: Discord (and most embed
 * consumers) sniff the media type from the extension before they ever see a
 * `Content-Type` header. The suffix is *not* part of the signed string -- the
 * route strips it to recover the registry key and signs over that key.
 */
export function signChartUrl(chart: string, params: ChartUrlParams, options: SignChartUrlOptions = {}): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) query.append(key, String(value))
  query.sort()
  query.set(CHART_SIG_PARAM, signChartParams(chart, params))

  const base = options.baseUrl?.replace(/\/+$/, '') ?? chartBaseUrl()
  return `${base}/api/chart/${chart}.png?${query.toString()}`
}

export interface ChartSignatureResult {
  ok: boolean
  /** 403 on every failure -- see the route's error table. */
  status: number
  message?: string
}

const OK: ChartSignatureResult = { ok: true, status: 200 }

/**
 * Verifies the `sig` param on an incoming chart request.
 *
 * - `CHART_SIGNING_SECRET` unset -> fail closed (403, all requests refused).
 * - Missing / malformed / unknown-version `sig` -> 403.
 * - Digest mismatch (tampered team, season, mode, or an injected param) -> 403.
 *
 * `params` is the request's full search params; `sig` is skipped when building
 * the canonical string, so passing them through unfiltered is correct.
 */
export function verifyChartSignature(chart: string, params: URLSearchParams): ChartSignatureResult {
  const secret = process.env.CHART_SIGNING_SECRET
  if (!secret) {
    return {
      ok: false,
      status: 403,
      message:
        'Server misconfiguration: CHART_SIGNING_SECRET is not set in this deployment. ' +
        'The chart image endpoint refuses all requests (fails closed) until an operator sets it.',
    }
  }

  const provided = params.get(CHART_SIG_PARAM)?.trim()
  if (!provided) {
    return { ok: false, status: 403, message: 'Missing signature. Chart URLs must carry a ?sig= parameter.' }
  }

  const separator = provided.indexOf('.')
  if (separator <= 0) {
    return { ok: false, status: 403, message: 'Malformed signature. Expected "<version>.<digest>".' }
  }

  const version = provided.slice(0, separator)
  const digest = provided.slice(separator + 1)
  if (version !== CHART_SIG_VERSION) {
    // Deliberately specific: when a v2 scheme ships, this is the message that
    // tells an operator an old client is still minting v1 URLs.
    return { ok: false, status: 403, message: `Unsupported signature version "${version}".` }
  }
  if (!digest) {
    return { ok: false, status: 403, message: 'Malformed signature. Expected "<version>.<digest>".' }
  }

  const expected = computeDigest(secret, canonicalChartString(chart, params))
  if (!signaturesMatch(digest, expected)) {
    return { ok: false, status: 403, message: 'Invalid signature.' }
  }

  return OK
}
