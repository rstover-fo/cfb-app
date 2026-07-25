/**
 * Tests for the chart URL signing scheme.
 *
 * The single most important property here is the round trip: `signChartUrl`
 * (producer, used by the phase-2.3 MCP tool) and `verifyChartSignature`
 * (consumer, used by the route) must agree about the canonical string forever.
 * If they ever drift, every chart already posted in Discord starts 403-ing.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CHART_SIG_VERSION,
  canonicalChartString,
  chartBaseUrl,
  signChartParams,
  signChartUrl,
  signaturesMatch,
  verifyChartSignature,
} from '../signing'

const ORIGINAL_SECRET = process.env.CHART_SIGNING_SECRET
const ORIGINAL_BASE = process.env.CHART_BASE_URL
const ORIGINAL_VERCEL = process.env.VERCEL_PROJECT_PRODUCTION_URL

const SECRET = 'chart-signing-secret-for-tests'

function paramsFrom(url: string): URLSearchParams {
  return new URL(url).searchParams
}

beforeEach(() => {
  process.env.CHART_SIGNING_SECRET = SECRET
  process.env.CHART_BASE_URL = 'https://charts.example.com'
})

afterEach(() => {
  restore('CHART_SIGNING_SECRET', ORIGINAL_SECRET)
  restore('CHART_BASE_URL', ORIGINAL_BASE)
  restore('VERCEL_PROJECT_PRODUCTION_URL', ORIGINAL_VERCEL)
})

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

describe('canonicalChartString', () => {
  it('sorts params and excludes sig', () => {
    const canonical = canonicalChartString('team-playcalling', [
      ['season', '2026'],
      ['sig', 'v1.whatever'],
      ['team', 'Oklahoma'],
      ['mode', 'dark'],
    ])
    expect(canonical).toBe('v1:team-playcalling?mode=dark&season=2026&team=Oklahoma')
  })

  it('is order-independent', () => {
    const a = canonicalChartString('team-playcalling', [
      ['team', 'Oklahoma'],
      ['season', '2026'],
    ])
    const b = canonicalChartString('team-playcalling', [
      ['season', '2026'],
      ['team', 'Oklahoma'],
    ])
    expect(a).toBe(b)
  })

  it('binds the chart id, so a digest cannot be replayed on another chart', () => {
    const params: [string, string][] = [['team', 'Oklahoma']]
    expect(canonicalChartString('team-playcalling', params)).not.toBe(
      canonicalChartString('team-tempo', params),
    )
  })

  it('encodes values so a & inside one cannot forge a param boundary', () => {
    const sneaky = canonicalChartString('team-playcalling', [['team', 'Texas A&M&season=1999']])
    expect(sneaky).toContain('%26season%3D1999')
  })
})

describe('signaturesMatch', () => {
  it('accepts identical digests', () => {
    expect(signaturesMatch('abc', 'abc')).toBe(true)
  })

  it('rejects different digests without throwing on a length mismatch', () => {
    expect(signaturesMatch('abc', 'abcdefghijklmnop')).toBe(false)
  })
})

describe('signChartParams', () => {
  it('emits a versioned 22-character digest', () => {
    const sig = signChartParams('team-playcalling', { team: 'Oklahoma', season: 2026, mode: 'light' })
    const [version, digest] = sig.split('.')
    expect(version).toBe(CHART_SIG_VERSION)
    expect(digest).toHaveLength(22)
    expect(digest).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  it('is stable across calls -- a URL posted today still verifies tomorrow', () => {
    const args = { team: 'Oklahoma', season: 2026 } as const
    expect(signChartParams('team-playcalling', args)).toBe(signChartParams('team-playcalling', args))
  })

  it('changes when any param changes', () => {
    const base = signChartParams('team-playcalling', { team: 'Oklahoma', season: 2026 })
    expect(signChartParams('team-playcalling', { team: 'Texas', season: 2026 })).not.toBe(base)
    expect(signChartParams('team-playcalling', { team: 'Oklahoma', season: 2025 })).not.toBe(base)
  })

  it('throws when the secret is unset rather than minting an unsignable URL', () => {
    delete process.env.CHART_SIGNING_SECRET
    expect(() => signChartParams('team-playcalling', { team: 'Oklahoma' })).toThrow(/CHART_SIGNING_SECRET/)
  })
})

describe('signChartUrl', () => {
  it('builds an absolute .png URL carrying every param plus sig', () => {
    const url = signChartUrl('team-playcalling', { team: 'Oklahoma', season: 2026, mode: 'light' })
    const parsed = new URL(url)
    expect(parsed.origin).toBe('https://charts.example.com')
    expect(parsed.pathname).toBe('/api/chart/team-playcalling.png')
    expect(parsed.searchParams.get('team')).toBe('Oklahoma')
    expect(parsed.searchParams.get('season')).toBe('2026')
    expect(parsed.searchParams.get('mode')).toBe('light')
    expect(parsed.searchParams.get('sig')).toMatch(/^v1\.[A-Za-z0-9_-]{22}$/)
  })

  it('honours an explicit baseUrl override and strips its trailing slash', () => {
    const url = signChartUrl('team-playcalling', { team: 'Oklahoma' }, { baseUrl: 'https://preview.example.com/' })
    expect(url.startsWith('https://preview.example.com/api/chart/')).toBe(true)
  })
})

describe('chartBaseUrl', () => {
  it('prefers CHART_BASE_URL', () => {
    process.env.CHART_BASE_URL = 'https://explicit.example.com/'
    expect(chartBaseUrl()).toBe('https://explicit.example.com')
  })

  it('falls back to the Vercel production domain', () => {
    delete process.env.CHART_BASE_URL
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'v0-production-data-application.vercel.app'
    expect(chartBaseUrl()).toBe('https://v0-production-data-application.vercel.app')
  })

  it('throws when neither is available', () => {
    delete process.env.CHART_BASE_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    expect(() => chartBaseUrl()).toThrow(/CHART_BASE_URL/)
  })
})

describe('verifyChartSignature (round trip)', () => {
  it('accepts a URL produced by signChartUrl', () => {
    const url = signChartUrl('team-playcalling', { team: 'Oklahoma', season: 2026, mode: 'dark' })
    expect(verifyChartSignature('team-playcalling', paramsFrom(url))).toEqual({ ok: true, status: 200 })
  })

  it('accepts the same params in a different order', () => {
    const sig = signChartParams('team-playcalling', { team: 'Oklahoma', season: 2026, mode: 'light' })
    const reordered = new URLSearchParams(`sig=${sig}&mode=light&team=Oklahoma&season=2026`)
    expect(verifyChartSignature('team-playcalling', reordered).ok).toBe(true)
  })

  it('rejects a tampered team', () => {
    const url = signChartUrl('team-playcalling', { team: 'Oklahoma', season: 2026 })
    const params = paramsFrom(url)
    params.set('team', 'Texas')
    const result = verifyChartSignature('team-playcalling', params)
    expect(result).toMatchObject({ ok: false, status: 403 })
    expect(result.message).toMatch(/Invalid signature/)
  })

  it('rejects a tampered season', () => {
    const url = signChartUrl('team-playcalling', { team: 'Oklahoma', season: 2026 })
    const params = paramsFrom(url)
    params.set('season', '2025')
    expect(verifyChartSignature('team-playcalling', params).ok).toBe(false)
  })

  it('rejects an injected extra param', () => {
    const url = signChartUrl('team-playcalling', { team: 'Oklahoma', season: 2026 })
    const params = paramsFrom(url)
    params.set('scale', '99')
    expect(verifyChartSignature('team-playcalling', params).ok).toBe(false)
  })

  it('rejects a signature minted for a different chart', () => {
    const url = signChartUrl('team-playcalling', { team: 'Oklahoma', season: 2026 })
    expect(verifyChartSignature('team-tempo', paramsFrom(url)).ok).toBe(false)
  })

  it('rejects a signature minted under a different secret', () => {
    const url = signChartUrl('team-playcalling', { team: 'Oklahoma', season: 2026 })
    process.env.CHART_SIGNING_SECRET = 'a-completely-different-secret'
    expect(verifyChartSignature('team-playcalling', paramsFrom(url)).ok).toBe(false)
  })

  it('rejects a missing sig', () => {
    const result = verifyChartSignature('team-playcalling', new URLSearchParams('team=Oklahoma&season=2026'))
    expect(result).toMatchObject({ ok: false, status: 403 })
    expect(result.message).toMatch(/Missing signature/)
  })

  it.each([['no-dot-at-all'], ['.abc'], ['v1.']])('rejects the malformed signature %s', value => {
    const params = new URLSearchParams({ team: 'Oklahoma', sig: value })
    expect(verifyChartSignature('team-playcalling', params).ok).toBe(false)
  })

  it('rejects an unknown signature version so v2 can be introduced safely', () => {
    const sig = signChartParams('team-playcalling', { team: 'Oklahoma' })
    const params = new URLSearchParams({ team: 'Oklahoma', sig: sig.replace('v1.', 'v9.') })
    const result = verifyChartSignature('team-playcalling', params)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/Unsupported signature version "v9"/)
  })

  it('fails closed when CHART_SIGNING_SECRET is unset, even for an otherwise valid URL', () => {
    const url = signChartUrl('team-playcalling', { team: 'Oklahoma', season: 2026 })
    delete process.env.CHART_SIGNING_SECRET
    const result = verifyChartSignature('team-playcalling', paramsFrom(url))
    expect(result).toMatchObject({ ok: false, status: 403 })
    expect(result.message).toMatch(/CHART_SIGNING_SECRET is not set/)
  })
})
