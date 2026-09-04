/**
 * Unit tests for the render_chart MCP tool (src/lib/mcp/tools.ts), phase 2.3.
 *
 * Unlike every other tool test in this directory, nothing here mocks the
 * charts signing module (src/lib/charts/server/signing.ts) -- the whole
 * point of render_chart is to be the producer half of a signing scheme whose
 * consumer (verifyChartSignature, used by src/app/api/chart/[chart]/route.ts)
 * lives in that same file. The most important assertion in this file feeds a
 * URL minted by renderChartTool through the REAL verifyChartSignature and
 * checks it passes: that single round trip is what stops the producer
 * (this tool) and the consumer (the route) from ever silently drifting apart
 * in production.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyChartSignature } from '@/lib/charts/server/signing'
import type { ChartId } from '@/lib/charts/server/svg'
import { renderChartTool } from '../tools'

// Season-rollover U2: render_chart now resolves its default season via
// getCurrentSeasonForRoute() instead of the CURRENT_SEASON constant. Pin it
// to a fixed state so "defaults to the current season" assertions below stay
// deterministic rather than depending on the resolver's real-Supabase-call
// failing over to its fallback in this test environment.
vi.mock('@/lib/queries/season', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/queries/season')>()
  return {
    ...actual,
    getCurrentSeasonForRoute: vi.fn().mockResolvedValue({
      season: 2025,
      through_week: 16,
      is_live: false,
      source: 'games',
    }),
  }
})

const ORIGINAL_SECRET = process.env.CHART_SIGNING_SECRET
const ORIGINAL_BASE = process.env.CHART_BASE_URL
const ORIGINAL_VERCEL = process.env.VERCEL_PROJECT_PRODUCTION_URL

const SECRET = 'chart-signing-secret-for-tests'

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

describe('renderChartTool', () => {
  it('returns a chart-renderer envelope whose URL is absolute and carries a v1 signature', async () => {
    const parsed = JSON.parse(await renderChartTool({ chart: 'team-playcalling', team: 'Oklahoma', season: 2026 }))

    expect(parsed._source).toBe('chart-renderer')
    expect(parsed.chart).toBe('team-playcalling')
    expect(parsed.url).toMatch(/^https:\/\/charts\.example\.com\/api\/chart\/team-playcalling\.png\?/)
    expect(parsed.url).toContain('sig=v1.')
    expect(typeof parsed.alt).toBe('string')
    expect(parsed.alt).toContain('Oklahoma')
    expect(typeof parsed.width).toBe('number')
    expect(typeof parsed.height).toBe('number')
    expect(typeof parsed.usage).toBe('string')
  })

  it('produces a URL that the real verifyChartSignature accepts (producer/consumer round trip)', async () => {
    const parsed = JSON.parse(await renderChartTool({ chart: 'team-playcalling', team: 'Oklahoma', season: 2026 }))

    const url = new URL(parsed.url)
    const result = verifyChartSignature('team-playcalling', url.searchParams)

    expect(result).toEqual({ ok: true, status: 200 })
  })

  it('defaults season to CURRENT_SEASON when omitted', async () => {
    const parsed = JSON.parse(await renderChartTool({ chart: 'team-playcalling', team: 'Oklahoma' }))

    const url = new URL(parsed.url)
    expect(url.searchParams.get('season')).toBe(String(2025))
  })

  it('defaults mode to light when omitted', async () => {
    const parsed = JSON.parse(await renderChartTool({ chart: 'team-playcalling', team: 'Oklahoma' }))

    const url = new URL(parsed.url)
    expect(url.searchParams.get('mode')).toBe('light')
  })

  it('forwards an explicit mode', async () => {
    const parsed = JSON.parse(
      await renderChartTool({ chart: 'team-playcalling', team: 'Oklahoma', season: 2026, mode: 'dark' })
    )

    const url = new URL(parsed.url)
    expect(url.searchParams.get('mode')).toBe('dark')
  })

  it('fails verification when a param on the produced URL is tampered with after the fact', async () => {
    const parsed = JSON.parse(await renderChartTool({ chart: 'team-playcalling', team: 'Oklahoma', season: 2026 }))

    const url = new URL(parsed.url)
    url.searchParams.set('team', 'Texas')
    const result = verifyChartSignature('team-playcalling', url.searchParams)

    expect(result.ok).toBe(false)
  })

  it('returns a friendly plain string instead of throwing when CHART_SIGNING_SECRET is unset', async () => {
    delete process.env.CHART_SIGNING_SECRET

    const text = await renderChartTool({ chart: 'team-playcalling', team: 'Oklahoma', season: 2026 })

    expect(text).toBe('Chart rendering is not configured on this deployment. Answer in text instead.')
  })

  it('returns the same friendly string instead of throwing when no chart base URL is resolvable', async () => {
    delete process.env.CHART_BASE_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL

    const text = await renderChartTool({ chart: 'team-playcalling', team: 'Oklahoma', season: 2026 })

    expect(text).toBe('Chart rendering is not configured on this deployment. Answer in text instead.')
  })

  it('never throws: an unset secret resolves to a string, not a rejection', async () => {
    delete process.env.CHART_SIGNING_SECRET

    await expect(renderChartTool({ chart: 'team-playcalling', team: 'Oklahoma' })).resolves.toEqual(
      expect.any(String)
    )
  })

  it('asks for the team it needs instead of minting a URL that would render an empty card', async () => {
    const text = await renderChartTool({ chart: 'team-playcalling' })
    expect(text).toMatch(/needs a `team`/)
  })
})

// ---------------------------------------------------------------------------
// team-metric-trend -- the generative chart
// ---------------------------------------------------------------------------

/** Every trend URL these tests mint, parsed. */
async function mintTrend(args: Parameters<typeof renderChartTool>[0]): Promise<URL> {
  const parsed = JSON.parse(await renderChartTool(args))
  return new URL(parsed.url)
}

describe('renderChartTool -- team-metric-trend', () => {
  const base = { chart: 'team-metric-trend', metric: 'sp_defense', teams: ['Oklahoma', 'Clemson'] } as const

  it('mints the URL shape the route expects', async () => {
    const url = await mintTrend({ ...base, from: 2015, to: 2025 })

    expect(url.pathname).toBe('/api/chart/team-metric-trend.png')
    expect(url.searchParams.get('metric')).toBe('sp_defense')
    expect(url.searchParams.get('teams')).toBe('Oklahoma,Clemson')
    expect(url.searchParams.get('from')).toBe('2015')
    expect(url.searchParams.get('to')).toBe('2025')
    expect(url.searchParams.get('mode')).toBe('light')
    expect(url.searchParams.get('sig')).toMatch(/^v1\./)
  })

  it('produces a URL the real verifyChartSignature accepts (producer/consumer round trip)', async () => {
    const url = await mintTrend({ ...base, from: 2015, to: 2025, annotations: [{ season: 2022, label: 'Venables hired' }] })

    expect(verifyChartSignature('team-metric-trend', url.searchParams)).toEqual({ ok: true, status: 200 })
  })

  it('fails verification when a param on the produced URL is tampered with', async () => {
    const url = await mintTrend({ ...base, from: 2015, to: 2025 })
    url.searchParams.set('teams', 'Oklahoma,Texas')

    expect(verifyChartSignature('team-metric-trend', url.searchParams).ok).toBe(false)
  })

  it('is stable: the same request always mints the same URL, so the CDN can keep it', async () => {
    const first = await mintTrend({ ...base, from: 2015, to: 2025 })
    const second = await mintTrend({ ...base, from: 2015, to: 2025 })

    expect(second.toString()).toBe(first.toString())
  })

  it('preserves the order the teams were named in -- that order is the chart', async () => {
    const url = await mintTrend({ ...base, teams: ['Clemson', 'Oklahoma'], from: 2015, to: 2025 })
    expect(url.searchParams.get('teams')).toBe('Clemson,Oklahoma')
  })

  it('drops duplicate teams rather than drawing one team twice', async () => {
    const url = await mintTrend({ ...base, teams: ['Oklahoma', 'Oklahoma', 'Clemson'], from: 2015, to: 2025 })
    expect(url.searchParams.get('teams')).toBe('Oklahoma,Clemson')
  })

  it('defaults to the last decade ending in the current season', async () => {
    const url = await mintTrend(base)
    expect(url.searchParams.get('to')).toBe('2025')
    expect(url.searchParams.get('from')).toBe('2016')
  })

  it('accepts a single team named with `team` instead of `teams`', async () => {
    const url = await mintTrend({ chart: 'team-metric-trend', metric: 'wins', team: 'Oklahoma' })
    expect(url.searchParams.get('teams')).toBe('Oklahoma')
  })

  it('encodes annotations as season:label, and drops ones outside the range', async () => {
    const url = await mintTrend({
      ...base,
      from: 2015,
      to: 2025,
      annotations: [
        { season: 2022, label: 'Venables hired' },
        { season: 1999, label: 'Ancient history' },
      ],
    })

    expect(url.searchParams.get('annotations')).toBe('2022:Venables hired')
  })

  it('strips the encoding separators out of an annotation label', async () => {
    const url = await mintTrend({
      ...base,
      from: 2015,
      to: 2025,
      annotations: [{ season: 2022, label: 'Fired: Riley | hired: Venables' }],
    })

    const annotations = url.searchParams.get('annotations') ?? ''
    expect(annotations.startsWith('2022:')).toBe(true)
    expect(annotations.slice(5)).not.toMatch(/[|:]/)
  })

  it('omits the annotations param entirely when there are none', async () => {
    const url = await mintTrend({ ...base, from: 2015, to: 2025 })
    expect(url.searchParams.has('annotations')).toBe(false)
  })

  it('says what is missing instead of minting a URL that would 400', async () => {
    expect(await renderChartTool({ chart: 'team-metric-trend', teams: ['Oklahoma'] })).toMatch(/needs a `metric`/)
    expect(await renderChartTool({ chart: 'team-metric-trend', metric: 'sp_defense' })).toMatch(/needs `teams`/)
    expect(
      await renderChartTool({
        chart: 'team-metric-trend',
        metric: 'sp_defense',
        teams: ['a', 'b', 'c', 'd', 'e'],
      })
    ).toMatch(/at most 4 teams/)
    expect(await renderChartTool({ ...base, from: 2025, to: 2015 })).toMatch(/must be the same season as `from` or later/)
    expect(await renderChartTool({ ...base, from: 1900, to: 2025 })).toMatch(/Seasons must be whole years/)
    expect(await renderChartTool({ ...base, from: 1960, to: 2020 })).toMatch(/at most 40 seasons/)
  })

  it('never throws, whatever it is handed', async () => {
    await expect(renderChartTool({ chart: 'team-metric-trend' })).resolves.toEqual(expect.any(String))
    delete process.env.CHART_SIGNING_SECRET
    await expect(renderChartTool({ ...base, from: 2015, to: 2025 })).resolves.toEqual(expect.any(String))
  })

  it('describes the chart in its alt text, naming both teams and the range', async () => {
    const parsed = JSON.parse(await renderChartTool({ ...base, from: 2015, to: 2025 }))
    expect(parsed.alt).toContain('Oklahoma')
    expect(parsed.alt).toContain('Clemson')
    expect(parsed.alt).toContain('2015-2025')
    expect(parsed.chart).toBe('team-metric-trend')
    expect(typeof parsed.width).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// team-metric-bars -- the second shape of the generative family
// ---------------------------------------------------------------------------

describe('renderChartTool -- team-metric-bars', () => {
  const base = { chart: 'team-metric-bars', metric: 'sp_defense', teams: ['Oklahoma', 'Texas'] } as const

  it('mints the URL shape the route expects', async () => {
    const url = await mintTrend({ ...base, season: 2025 })

    expect(url.pathname).toBe('/api/chart/team-metric-bars.png')
    expect(url.searchParams.get('metric')).toBe('sp_defense')
    expect(url.searchParams.get('teams')).toBe('Oklahoma,Texas')
    expect(url.searchParams.get('season')).toBe('2025')
    expect(url.searchParams.get('mode')).toBe('light')
    expect(url.searchParams.get('sig')).toMatch(/^v1\./)
  })

  it('never sends the trend-only params, which the route would 400 on', async () => {
    const url = await mintTrend({ ...base, season: 2025 })
    for (const param of ['from', 'to', 'annotations']) {
      expect(url.searchParams.has(param)).toBe(false)
    }
  })

  it('produces a URL the real verifyChartSignature accepts (producer/consumer round trip)', async () => {
    const url = await mintTrend({ ...base, season: 2025 })
    expect(verifyChartSignature('team-metric-bars', url.searchParams)).toEqual({ ok: true, status: 200 })
  })

  it('will not verify against the sibling shape -- the chart id is part of the signature', async () => {
    const url = await mintTrend({ ...base, season: 2025 })
    expect(verifyChartSignature('team-metric-trend', url.searchParams).ok).toBe(false)
  })

  it('is stable: the same request always mints the same URL, so the CDN can keep it', async () => {
    const first = await mintTrend({ ...base, season: 2025 })
    const second = await mintTrend({ ...base, season: 2025 })
    expect(second.toString()).toBe(first.toString())
  })

  it('defaults season to the current one', async () => {
    const url = await mintTrend(base)
    expect(url.searchParams.get('season')).toBe('2025')
  })

  it('shares the team normalization with the trend chart', async () => {
    const url = await mintTrend({ ...base, teams: ['Texas', 'Texas', 'Oklahoma'], season: 2025 })
    expect(url.searchParams.get('teams')).toBe('Texas,Oklahoma')
  })

  it('accepts a single team named with `team` instead of `teams`', async () => {
    const url = await mintTrend({ chart: 'team-metric-bars', metric: 'wins', team: 'Oklahoma' })
    expect(url.searchParams.get('teams')).toBe('Oklahoma')
  })

  it('says what is missing instead of minting a URL that would 400', async () => {
    expect(await renderChartTool({ chart: 'team-metric-bars', teams: ['Oklahoma'] })).toMatch(/needs a `metric`/)
    expect(await renderChartTool({ chart: 'team-metric-bars', metric: 'sp_defense' })).toMatch(/needs `teams`/)
    expect(
      await renderChartTool({
        chart: 'team-metric-bars',
        metric: 'sp_defense',
        teams: ['a', 'b', 'c', 'd', 'e'],
      })
    ).toMatch(/at most 4 teams/)
    expect(await renderChartTool({ ...base, season: 1900 })).toMatch(/must be a whole year/)
  })

  it('never throws, whatever it is handed', async () => {
    await expect(renderChartTool({ chart: 'team-metric-bars' })).resolves.toEqual(expect.any(String))
    delete process.env.CHART_SIGNING_SECRET
    await expect(renderChartTool({ ...base, season: 2025 })).resolves.toEqual(expect.any(String))
  })

  it('describes the chart in its alt text, naming the teams, the season and the ranking', async () => {
    const parsed = JSON.parse(await renderChartTool({ ...base, season: 2025 }))
    expect(parsed.chart).toBe('team-metric-bars')
    expect(parsed.alt).toContain('Oklahoma')
    expect(parsed.alt).toContain('Texas')
    expect(parsed.alt).toContain('2025')
    expect(parsed.alt).toContain('ranked best first')
    expect(typeof parsed.width).toBe('number')
    expect(typeof parsed.height).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// team-metric-scatter -- the third shape
// ---------------------------------------------------------------------------

describe('renderChartTool -- team-metric-scatter', () => {
  const base = { chart: 'team-metric-scatter', x: 'sp_offense', y: 'sp_defense' } as const

  it('mints the URL shape the route expects', async () => {
    const url = await mintTrend({ ...base, teams: ['Oklahoma', 'Texas'], season: 2025 })

    expect(url.pathname).toBe('/api/chart/team-metric-scatter.png')
    expect(url.searchParams.get('x')).toBe('sp_offense')
    expect(url.searchParams.get('y')).toBe('sp_defense')
    expect(url.searchParams.get('season')).toBe('2025')
    expect(url.searchParams.get('teams')).toBe('Oklahoma,Texas')
    expect(url.searchParams.get('mode')).toBe('light')
    expect(url.searchParams.get('sig')).toMatch(/^v1\./)
  })

  it('produces a URL the real verifyChartSignature accepts (producer/consumer round trip)', async () => {
    const url = await mintTrend({ ...base, teams: ['Oklahoma'], season: 2025 })
    expect(verifyChartSignature('team-metric-scatter', url.searchParams)).toEqual({ ok: true, status: 200 })
  })

  it('will not verify against a sibling shape -- the chart id is part of the signature', async () => {
    const url = await mintTrend({ ...base, season: 2025 })
    expect(verifyChartSignature('team-metric-bars', url.searchParams).ok).toBe(false)
  })

  it('mints a chart with no teams at all -- the field is a legitimate subject', async () => {
    // The one shape where an empty `teams` is not a mistake. Named teams are
    // highlighted AGAINST the field rather than being the whole chart.
    const url = await mintTrend({ ...base, season: 2025 })
    expect(url.searchParams.has('teams')).toBe(false)
    expect(verifyChartSignature('team-metric-scatter', url.searchParams).ok).toBe(true)
  })

  it('leaves rankBy off the URL when it is the default, and sends it when it is not', async () => {
    // The common request keeps the shortest, most cacheable URL; the route
    // fills the same default in, so the two can never disagree.
    expect((await mintTrend({ ...base, season: 2025 })).searchParams.has('rankBy')).toBe(false)
    expect((await mintTrend({ ...base, season: 2025, rank_by: 'elo' })).searchParams.get('rankBy')).toBe('elo')
  })

  it('never sends the params belonging to the other shapes', async () => {
    const url = await mintTrend({
      ...base,
      season: 2025,
      // Sent by a confused model; must not reach a `.strict()` schema.
      metric: 'sp_rating',
      from: 2015,
      to: 2025,
      annotations: [{ season: 2022, label: 'Venables hired' }],
    })
    for (const param of ['metric', 'from', 'to', 'annotations']) {
      expect(url.searchParams.has(param)).toBe(false)
    }
  })

  it('accepts `metric` as a shorthand for the x axis', async () => {
    // A model reaching for the family's usual param name gets a chart rather
    // than a lecture -- it still has to name the other axis.
    const url = await mintTrend({ chart: 'team-metric-scatter', metric: 'sp_offense', y: 'sp_defense', season: 2025 })
    expect(url.searchParams.get('x')).toBe('sp_offense')
  })

  it('is stable: the same request always mints the same URL, so the CDN can keep it', async () => {
    const first = await mintTrend({ ...base, teams: ['Oklahoma'], season: 2025 })
    const second = await mintTrend({ ...base, teams: ['Oklahoma'], season: 2025 })
    expect(second.toString()).toBe(first.toString())
  })

  it('defaults season to the current one', async () => {
    expect((await mintTrend(base)).searchParams.get('season')).toBe('2025')
  })

  it('says what is missing instead of minting a URL that would 400', async () => {
    expect(await renderChartTool({ chart: 'team-metric-scatter', x: 'sp_offense' })).toMatch(/needs two metrics/)
    expect(await renderChartTool({ chart: 'team-metric-scatter' })).toMatch(/needs two metrics/)
    expect(await renderChartTool({ chart: 'team-metric-scatter', x: 'wins', y: 'wins' })).toMatch(
      /two DIFFERENT metrics/,
    )
    expect(
      await renderChartTool({ ...base, teams: ['a', 'b', 'c', 'd', 'e'] }),
    ).toMatch(/at most 4 teams/)
    expect(await renderChartTool({ ...base, season: 1900 })).toMatch(/must be a whole year/)
  })

  it('never throws, whatever it is handed', async () => {
    await expect(renderChartTool({ chart: 'team-metric-scatter' })).resolves.toEqual(expect.any(String))
    delete process.env.CHART_SIGNING_SECRET
    await expect(renderChartTool({ ...base, season: 2025 })).resolves.toEqual(expect.any(String))
  })

  it('describes the chart in its alt text, naming the subject and the good corner', async () => {
    const parsed = JSON.parse(await renderChartTool({ ...base, teams: ['Oklahoma', 'Texas'], season: 2025 }))
    expect(parsed.chart).toBe('team-metric-scatter')
    expect(parsed.alt).toContain('Oklahoma')
    expect(parsed.alt).toContain('Texas')
    expect(parsed.alt).toContain('2025')
    expect(parsed.alt).toContain('top-right is best')

    // With no team named, the field itself is what the alt text is about.
    const fieldOnly = JSON.parse(await renderChartTool({ ...base, season: 2025 }))
    expect(fieldOnly.alt).toContain('the 2025 field')
  })
})

describe('renderChartTool -- chart registry', () => {
  it('answers for every shipped chart id rather than falling through to one builder', async () => {
    // CHART_METADATA is typed against the ChartId union, so a new chart cannot
    // reach the registry without an entry -- but nothing typed stops the
    // *request builder* dispatch from silently defaulting. This is that guard.
    const args: Record<ChartId, Parameters<typeof renderChartTool>[0]> = {
      'team-playcalling': { chart: 'team-playcalling', team: 'Oklahoma', season: 2025 },
      'team-metric-trend': { chart: 'team-metric-trend', metric: 'wins', teams: ['Oklahoma'], from: 2015, to: 2025 },
      'team-metric-bars': { chart: 'team-metric-bars', metric: 'wins', teams: ['Oklahoma'], season: 2025 },
      'team-metric-scatter': { chart: 'team-metric-scatter', x: 'wins', y: 'losses', season: 2025 },
    }

    for (const id of Object.keys(args) as ChartId[]) {
      const parsed = JSON.parse(await renderChartTool(args[id]))
      expect(parsed.chart).toBe(id)
      expect(new URL(parsed.url).pathname).toBe(`/api/chart/${id}.png`)
    }
  })

  it('returns a sentence rather than throwing for a chart id it does not know', async () => {
    // Typed as a ChartId, but a model can send anything down an MCP transport
    // and this tool's contract is that it never throws.
    const text = await renderChartTool({ chart: 'team-tempo' as ChartId, team: 'Oklahoma' })
    expect(text).toMatch(/Unknown chart/)
  })
})
