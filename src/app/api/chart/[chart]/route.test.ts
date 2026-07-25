// @vitest-environment node
/**
 * Route tests for the chart image endpoint.
 *
 * Follows src/lib/mcp/__tests__/auth.test.ts's precedent: construct real
 * `Request` objects and call the exported handler directly. The query layer is
 * mocked, so nothing here touches Supabase; rasterization is deliberately NOT
 * mocked, so a 200 in these tests means real PNG bytes came out of resvg.
 *
 * Node environment (not jsdom) because the handler goes through the native
 * `@resvg/resvg-js` binary, same as renderChartPng.test.ts.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/queries/playcalling', () => ({
  getPlaycallingProfile: vi.fn(),
}))

// Real renderer, wrapped in a spy so one test can force the "render throws"
// branch without giving up real bytes everywhere else.
vi.mock('@/lib/charts/server', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/charts/server')>()
  return { ...actual, renderChartPng: vi.fn(actual.renderChartPng) }
})

import { renderChartPng } from '@/lib/charts/server'
import { resetChartRateLimit, CHART_RATE_LIMIT } from '@/lib/charts/server/rateLimit'
import { signChartParams } from '@/lib/charts/server/signing'
import { createPlaycallingProfileRow } from '@/lib/queries/__tests__/fixtures/playcalling'
import { CURRENT_SEASON } from '@/lib/queries/constants'
import { getPlaycallingProfile } from '@/lib/queries/playcalling'
import * as route from './route'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const ORIGINAL_SECRET = process.env.CHART_SIGNING_SECRET
const SECRET = 'chart-signing-secret-for-tests'

const SETTLED_SEASON = CURRENT_SEASON - 1
const FUTURE_SEASON = CURRENT_SEASON + 1

/** Silences the intentional console.error on the failure paths. */
const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

beforeEach(async () => {
  vi.clearAllMocks()
  resetChartRateLimit()
  process.env.CHART_SIGNING_SECRET = SECRET
  vi.mocked(getPlaycallingProfile).mockResolvedValue(createPlaycallingProfileRow() as never)
  // clearAllMocks() resets call history but NOT an implementation installed by
  // mockResolvedValue, so a test that stubs the rasterizer would otherwise leak
  // that stub into every test after it. Re-point at the real one each time.
  const actual = await vi.importActual<typeof import('@/lib/charts/server')>('@/lib/charts/server')
  vi.mocked(renderChartPng).mockImplementation(actual.renderChartPng)
})

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CHART_SIGNING_SECRET
  else process.env.CHART_SIGNING_SECRET = ORIGINAL_SECRET
})

afterAll(() => {
  consoleError.mockRestore()
})

type Params = Record<string, string | number>

/** Builds a request whose `sig` is minted by the real signer (round trip). */
function signedRequest(chart: string, params: Params, init?: RequestInit): Request {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) query.append(key, String(value))
  query.set('sig', signChartParams(chart, params))
  return new Request(`https://charts.example.com/api/chart/${chart}.png?${query.toString()}`, init)
}

function call(segment: string, request: Request): Promise<Response> {
  return route.GET(request, { params: Promise.resolve({ chart: segment }) })
}

/** Signs, then calls -- the happy path in one line. `init` carries headers for
 * the rate-limit tests, which key on x-forwarded-for. */
function get(chart: string, params: Params, init?: RequestInit): Promise<Response> {
  return call(`${chart}.png`, signedRequest(chart, params, init))
}

async function expectPng(response: Response) {
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('image/png')
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')

  const bytes = Buffer.from(await response.arrayBuffer())
  expect(bytes.subarray(0, 8).equals(PNG_MAGIC), 'body is not a PNG').toBe(true)
  expect(Number(response.headers.get('content-length'))).toBe(bytes.byteLength)
  return bytes
}

describe('route exports', () => {
  it('exports GET and HEAD (Discord\'s media proxy issues HEAD first)', () => {
    const verbs = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']
    expect(verbs.filter(verb => verb in route)).toEqual(['GET', 'HEAD'])
  })

  it('serves HEAD through the same handler as GET', async () => {
    const request = signedRequest('team-playcalling', { team: 'Oklahoma', season: FUTURE_SEASON }, { method: 'HEAD' })
    const response = await route.HEAD(request, { params: Promise.resolve({ chart: 'team-playcalling.png' }) })
    await expectPng(response)
  })

  it('pins the Node runtime and a maxDuration', () => {
    expect(route.runtime).toBe('nodejs')
    expect(route.maxDuration).toBeGreaterThan(0)
  })
})

describe('404 -- unknown chart or missing .png', () => {
  it('rejects an unknown chart id', async () => {
    const response = await call('team-tempo.png', signedRequest('team-tempo', { team: 'Oklahoma' }))
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect((await response.json()).error).toMatch(/Unknown chart/)
  })

  it('rejects a known chart without the .png suffix -- clients sniff on extension', async () => {
    const response = await call('team-playcalling', signedRequest('team-playcalling', { team: 'Oklahoma' }))
    expect(response.status).toBe(404)
  })

  it('404s before touching the query layer', async () => {
    await call('nonsense.png', new Request('https://charts.example.com/api/chart/nonsense.png'))
    expect(getPlaycallingProfile).not.toHaveBeenCalled()
  })
})

describe('403 -- signature', () => {
  it('rejects a request with no sig at all', async () => {
    const request = new Request(
      `https://charts.example.com/api/chart/team-playcalling.png?team=Oklahoma&season=${FUTURE_SEASON}`,
    )
    const response = await call('team-playcalling.png', request)
    expect(response.status).toBe(403)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect((await response.json()).error).toMatch(/Missing signature/)
  })

  it('rejects a tampered team', async () => {
    const request = signedRequest('team-playcalling', { team: 'Oklahoma', season: FUTURE_SEASON })
    const tampered = new Request(request.url.replace('team=Oklahoma', 'team=Texas'))
    const response = await call('team-playcalling.png', tampered)
    expect(response.status).toBe(403)
    expect((await response.json()).error).toMatch(/Invalid signature/)
  })

  it('rejects a tampered season', async () => {
    const request = signedRequest('team-playcalling', { team: 'Oklahoma', season: FUTURE_SEASON })
    const tampered = new Request(request.url.replace(`season=${FUTURE_SEASON}`, `season=${SETTLED_SEASON}`))
    expect((await call('team-playcalling.png', tampered)).status).toBe(403)
  })

  it('accepts the same params in a different order', async () => {
    const sig = signChartParams('team-playcalling', { team: 'Oklahoma', season: FUTURE_SEASON, mode: 'dark' })
    const reordered = new Request(
      `https://charts.example.com/api/chart/team-playcalling.png?sig=${sig}&mode=dark&season=${FUTURE_SEASON}&team=Oklahoma`,
    )
    await expectPng(await call('team-playcalling.png', reordered))
  })

  it('fails closed with 403 when CHART_SIGNING_SECRET is unset', async () => {
    const request = signedRequest('team-playcalling', { team: 'Oklahoma', season: FUTURE_SEASON })
    delete process.env.CHART_SIGNING_SECRET

    const response = await call('team-playcalling.png', request)
    expect(response.status).toBe(403)
    expect((await response.json()).error).toMatch(/CHART_SIGNING_SECRET is not set/)
    expect(getPlaycallingProfile).not.toHaveBeenCalled()
  })
})

describe('400 -- parameter validation', () => {
  it('rejects a request missing a required param', async () => {
    const response = await get('team-playcalling', { team: 'Oklahoma' })
    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect((await response.json()).error).toMatch(/season/)
  })

  it('rejects a non-numeric season', async () => {
    const response = await get('team-playcalling', { team: 'Oklahoma', season: 'last-year' })
    expect(response.status).toBe(400)
  })

  it('rejects an unsupported mode', async () => {
    const response = await get('team-playcalling', { team: 'Oklahoma', season: FUTURE_SEASON, mode: 'sepia' })
    expect(response.status).toBe(400)
  })

  it('.strict() rejects an unknown param even when it is correctly signed', async () => {
    // The param is inside the signature, so this is not a tampering case -- it
    // is our own tooling drifting from the schema, and it must be loud.
    const response = await get('team-playcalling', { team: 'Oklahoma', season: FUTURE_SEASON, scale: 4 })
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/Unrecognized key/)
  })

  it('defaults mode to light when omitted', async () => {
    await expectPng(await get('team-playcalling', { team: 'Oklahoma', season: FUTURE_SEASON }))
  })
})

describe('429 -- rate limit', () => {
  it('throttles a single caller after the per-window limit', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.9' }
    // Signed requests, because the limiter sits AFTER signature verification.
    // It guards repeated rasterization from a leaked URL -- the only expensive
    // step and the realistic abuse -- rather than signature-guessing, which
    // 128 bits of HMAC already makes infeasible.
    //
    // Stub the rasterizer for this one test: the module mock wraps the REAL
    // renderChartPng, and filling the bucket would otherwise rasterize
    // CHART_RATE_LIMIT charts for real. We are asserting the limiter, not the
    // renderer.
    vi.mocked(renderChartPng).mockResolvedValue(Buffer.concat([PNG_MAGIC, Buffer.alloc(16)]))
    const signed = () => get('team-playcalling', { team: 'Oklahoma', season: FUTURE_SEASON }, { headers })

    for (let i = 0; i < CHART_RATE_LIMIT; i++) {
      expect((await signed()).status).toBe(200)
    }

    const limited = await signed()
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/)
    expect(limited.headers.get('cache-control')).toBe('no-store')
  })

  it('does not spend budget on unsigned requests -- they are rejected first', async () => {
    const headers = { 'x-forwarded-for': '198.51.100.7' }
    const unsigned = () =>
      call(
        'team-playcalling.png',
        new Request('https://charts.example.com/api/chart/team-playcalling.png', { headers }),
      )

    // Well past the limit: every one 403s, and none consumes the bucket.
    for (let i = 0; i < CHART_RATE_LIMIT + 5; i++) {
      expect((await unsigned()).status).toBe(403)
    }

    // A legitimate signed request from the same IP still renders -- an
    // unauthenticated flood must not be able to deny service to real charts.
    await expectPng(await get('team-playcalling', { team: 'Oklahoma', season: FUTURE_SEASON }, { headers }))
  })
})

describe('200 -- rendered chart', () => {
  it('renders a PNG for a team with data', async () => {
    const bytes = await expectPng(await get('team-playcalling', { team: 'Oklahoma', season: FUTURE_SEASON }))
    expect(bytes.byteLength).toBeGreaterThan(2000)
    expect(getPlaycallingProfile).toHaveBeenCalledWith('Oklahoma', FUTURE_SEASON)
  })

  it('renders the dark palette when mode=dark', async () => {
    const light = await expectPng(
      await get('team-playcalling', { team: 'Oklahoma', season: FUTURE_SEASON, mode: 'light' }),
    )
    const dark = await expectPng(
      await get('team-playcalling', { team: 'Oklahoma', season: FUTURE_SEASON, mode: 'dark' }),
    )
    expect(dark.equals(light)).toBe(false)
  })

  it('is byte-identical across repeat requests, which is what makes caching safe', async () => {
    const first = await expectPng(await get('team-playcalling', { team: 'Oklahoma', season: FUTURE_SEASON }))
    const second = await expectPng(await get('team-playcalling', { team: 'Oklahoma', season: FUTURE_SEASON }))
    expect(second.equals(first)).toBe(true)
  })
})

describe('200 -- empty card when the query returns nothing', () => {
  beforeEach(() => {
    vi.mocked(getPlaycallingProfile).mockResolvedValue(null)
  })

  it('serves a PNG rather than a 404', async () => {
    await expectPng(await get('team-playcalling', { team: 'Nobody State', season: FUTURE_SEASON }))
  })

  it('renders the empty spec naming the team and season', async () => {
    await get('team-playcalling', { team: 'Nobody State', season: FUTURE_SEASON })
    expect(renderChartPng).toHaveBeenCalledWith(
      expect.objectContaining({
        chart: 'empty',
        message: expect.stringContaining('Nobody State'),
      }),
      expect.anything(),
    )
  })

  it('caches the empty card only briefly -- the data may land any minute', async () => {
    const response = await get('team-playcalling', { team: 'Nobody State', season: SETTLED_SEASON })
    expect(response.headers.get('cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=600')
  })
})

describe('200 -- error card when something throws', () => {
  it('serves an error card when the query layer rejects', async () => {
    vi.mocked(getPlaycallingProfile).mockRejectedValue(new Error('supabase is down'))

    const response = await get('team-playcalling', { team: 'Oklahoma', season: FUTURE_SEASON })
    await expectPng(response)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(renderChartPng).toHaveBeenLastCalledWith(
      expect.objectContaining({ chart: 'empty', title: 'Chart unavailable' }),
      expect.anything(),
    )
  })

  it('serves an error card when rasterization itself throws', async () => {
    vi.mocked(renderChartPng).mockImplementationOnce(() => {
      throw new Error('resvg exploded')
    })

    await expectPng(await get('team-playcalling', { team: 'Oklahoma', season: FUTURE_SEASON }))
  })

  it('logs the failure with its stack -- the only signal an apology card shipped', async () => {
    vi.mocked(getPlaycallingProfile).mockRejectedValue(new Error('supabase is down'))

    await get('team-playcalling', { team: 'Oklahoma', season: FUTURE_SEASON })
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('[chart] team-playcalling'), expect.any(Error))
  })

  it('500s -- loudly -- when even the error card cannot be rendered', async () => {
    // Query rejects, so the single renderChartPng call is the error card, and
    // it throws too: the rasterizer itself is unusable.
    //
    // This is the deliberate exception to "never 500 on a valid signature".
    // The rule exists because a non-image response is a broken embed, but the
    // alternative here was a 1x1 transparent PNG -- invisible to the reader, so
    // no better on screen, and strictly worse for us: a 200 reads as healthy to
    // Vercel's error tracking and to uptime checks, so a completely dead
    // rasterizer would report fine. Prefer the loud failure.
    vi.mocked(getPlaycallingProfile).mockRejectedValue(new Error('supabase is down'))
    vi.mocked(renderChartPng).mockImplementationOnce(() => {
      throw new Error('resvg is completely dead')
    })

    const response = await get('team-playcalling', { team: 'Oklahoma', season: FUTURE_SEASON })
    expect(response.status).toBe(500)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('rasterizer is unusable'),
      expect.any(Error),
    )
  })
})

describe('Cache-Control branches', () => {
  it('marks a settled season immutable -- it can never change again', async () => {
    const response = await get('team-playcalling', { team: 'Oklahoma', season: SETTLED_SEASON })
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, s-maxage=31536000, immutable')
  })

  it('gives the current season a short TTL plus stale-while-revalidate', async () => {
    const response = await get('team-playcalling', { team: 'Oklahoma', season: CURRENT_SEASON })
    expect(response.headers.get('cache-control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400')
  })
})
