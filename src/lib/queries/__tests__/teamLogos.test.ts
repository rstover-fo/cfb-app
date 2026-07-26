/**
 * Tests for `getTeamLogoDataUris` (src/lib/queries/teamLogos.ts).
 *
 * `fetch` is stubbed, never called for real -- no test in this suite touches
 * the network, and this is the one module in the app whose whole job is to. The
 * assertions that carry weight are the failure ones: this thing sits in the
 * request path of a chart route with a 30s budget, and a logo is decoration.
 * Every way it can go wrong has to end in "the team is absent from the map", so
 * the renderer draws its rough fallback and the reader still gets a chart.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getTeamLookupMock = vi.fn()

vi.mock('../shared', () => ({
  getTeamLookup: (...args: unknown[]) => getTeamLookupMock(...args),
}))

import { getTeamLogoDataUris, resetTeamLogoCache, LOGO_FETCH_CONCURRENCY } from '../teamLogos'

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])
const PNG_URI = `data:image/png;base64,${PNG_BYTES.toString('base64')}`

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

/** A Response-alike, since only these three members are read. */
function imageResponse(
  bytes: Buffer = PNG_BYTES,
  contentType = 'image/png',
  ok = true,
): { ok: boolean; headers: Headers; arrayBuffer: () => Promise<ArrayBuffer> } {
  return {
    ok,
    headers: new Headers({ 'content-type': contentType }),
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  }
}

function lookup(entries: Record<string, string | null>) {
  return new Map(
    Object.entries(entries).map(([team, logo]) => [team, { logo, color: null, conference: null }]),
  )
}

const fetchMock = vi.fn()

beforeEach(() => {
  resetTeamLogoCache()
  fetchMock.mockReset()
  getTeamLookupMock.mockReset()
  consoleError.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  getTeamLookupMock.mockResolvedValue(
    lookup({
      Oklahoma: 'https://cdn.example.com/ou.png',
      Texas: 'https://cdn.example.com/tex.png',
      'Nobody State': null,
    }),
  )
  fetchMock.mockResolvedValue(imageResponse())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getTeamLogoDataUris', () => {
  it('inlines each logo as a data: URI keyed by school', async () => {
    // resvg fetches nothing, so the bytes have to travel in the document.
    const logos = await getTeamLogoDataUris(['Oklahoma', 'Texas'])

    expect(logos.get('Oklahoma')).toBe(PNG_URI)
    expect(logos.get('Texas')).toBe(PNG_URI)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('carries the response content type into the URI, not a guess from the URL', async () => {
    fetchMock.mockResolvedValue(imageResponse(PNG_BYTES, 'image/svg+xml; charset=utf-8'))

    const logos = await getTeamLogoDataUris(['Oklahoma'])

    expect(logos.get('Oklahoma')?.startsWith('data:image/svg+xml;base64,')).toBe(true)
  })

  it('fetches concurrently rather than one at a time', async () => {
    // 25 sequential fetches would not fit the chart route's budget. Asserted by
    // holding every request open at once: a sequential implementation
    // deadlocks here instead of resolving.
    getTeamLookupMock.mockResolvedValue(
      lookup(Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`Team ${i}`, `https://cdn.example.com/${i}.png`]))),
    )

    let inFlight = 0
    let peak = 0
    fetchMock.mockImplementation(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise(resolve => setTimeout(resolve, 1))
      inFlight--
      return imageResponse()
    })

    const logos = await getTeamLogoDataUris(Array.from({ length: 6 }, (_, i) => `Team ${i}`))

    expect(logos.size).toBe(6)
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(LOGO_FETCH_CONCURRENCY)
  })

  it('gives every fetch a timeout, so one slow CDN cannot eat the route budget', async () => {
    await getTeamLogoDataUris(['Oklahoma'])

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('memoizes by URL across calls, so a warm instance pays nothing', async () => {
    await getTeamLogoDataUris(['Oklahoma'])
    await getTeamLogoDataUris(['Oklahoma'])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fetches a shared asset once and hands it to every school using it', async () => {
    getTeamLookupMock.mockResolvedValue(
      lookup({ Oklahoma: 'https://cdn.example.com/same.png', Texas: 'https://cdn.example.com/same.png' }),
    )

    const logos = await getTeamLogoDataUris(['Oklahoma', 'Texas'])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(logos.get('Oklahoma')).toBe(logos.get('Texas'))
  })

  it('de-duplicates a repeated team', async () => {
    await getTeamLogoDataUris(['Oklahoma', 'Oklahoma'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('getTeamLogoDataUris — every failure degrades to an absent logo', () => {
  it('omits a team with no logo row at all', async () => {
    const logos = await getTeamLogoDataUris(['Nobody State'])

    expect(logos.has('Nobody State')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('omits a team the lookup has never heard of', async () => {
    expect((await getTeamLogoDataUris(['Nowhere Tech'])).size).toBe(0)
  })

  it('omits a logo whose URL is not fetchable', async () => {
    getTeamLookupMock.mockResolvedValue(lookup({ Oklahoma: 'not-a-url' }))

    expect((await getTeamLogoDataUris(['Oklahoma'])).size).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('omits a logo the CDN rejected', async () => {
    fetchMock.mockResolvedValue(imageResponse(PNG_BYTES, 'image/png', false))

    expect((await getTeamLogoDataUris(['Oklahoma'])).size).toBe(0)
  })

  it('omits an error page served with a 200, rather than inlining it as an image', async () => {
    // CDNs do this, and resvg would render the result as nothing at all.
    fetchMock.mockResolvedValue(imageResponse(Buffer.from('<html>oops</html>'), 'text/html'))

    expect((await getTeamLogoDataUris(['Oklahoma'])).size).toBe(0)
  })

  it('omits an empty body, and anything implausibly large for a logo', async () => {
    fetchMock.mockResolvedValue(imageResponse(Buffer.alloc(0)))
    expect((await getTeamLogoDataUris(['Oklahoma'])).size).toBe(0)

    resetTeamLogoCache()
    fetchMock.mockResolvedValue(imageResponse(Buffer.alloc(1024 * 1024)))
    expect((await getTeamLogoDataUris(['Oklahoma'])).size).toBe(0)
  })

  it('omits a logo whose fetch threw -- a timeout, DNS, a truncated body', async () => {
    fetchMock.mockRejectedValue(new Error('The operation was aborted due to timeout'))

    expect((await getTeamLogoDataUris(['Oklahoma'])).size).toBe(0)
  })

  it('still returns the logos that DID arrive when one fails', async () => {
    // The realistic case, and the one that decides whether a cold render
    // degrades or fails: partial success is success.
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('ou.png') ? imageResponse() : Promise.reject(new Error('down')),
    )

    const logos = await getTeamLogoDataUris(['Oklahoma', 'Texas'])

    expect(logos.get('Oklahoma')).toBe(PNG_URI)
    expect(logos.has('Texas')).toBe(false)
  })

  it('returns an empty map, not a rejection, when the team lookup itself fails', async () => {
    getTeamLookupMock.mockRejectedValue(new Error('supabase is down'))

    await expect(getTeamLogoDataUris(['Oklahoma'])).resolves.toEqual(new Map())
    expect(consoleError).toHaveBeenCalled()
  })

  it('does not remember a failure forever, unlike a success', async () => {
    // A success is permanent -- a school's logo file does not change. A failure
    // is usually about the network, and pinning it for the life of the Lambda
    // would turn one bad minute into a permanently logo-less chart.
    fetchMock.mockRejectedValueOnce(new Error('down')).mockResolvedValue(imageResponse())

    expect((await getTeamLogoDataUris(['Oklahoma'])).size).toBe(0)

    // Same instant, so the failure TTL has not elapsed: still cached.
    expect((await getTeamLogoDataUris(['Oklahoma'])).size).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.useFakeTimers()
    try {
      vi.setSystemTime(Date.now() + 120_000)
      expect((await getTeamLogoDataUris(['Oklahoma'])).size).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('short-circuits on an empty team list without touching the lookup', async () => {
    expect(await getTeamLogoDataUris([])).toEqual(new Map())
    expect(getTeamLookupMock).not.toHaveBeenCalled()
  })
})
