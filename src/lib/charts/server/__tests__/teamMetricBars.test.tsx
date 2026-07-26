/**
 * SVG-level tests for `team-metric-bars`, the second `team-metric-*` shape.
 *
 * Same strategy as teamMetricTrend.test.tsx: nothing touches Supabase (the
 * renderer imports `TeamMetricValue` as a *type*, which erases), snapshots are
 * of SVG strings rather than PNG bytes, and `expectResvgSafe` runs over every
 * variant in both themes -- a chart that renders perfectly in a browser and
 * blank under resvg is the failure mode that matters here.
 *
 * The assertions that carry the most weight are the honesty ones: bars are
 * zero-anchored, rows are ranked best-first whichever way the metric runs, and
 * the direction note says which bar length is the good one.
 */
import { describe, it, expect } from 'vitest'
import {
  MARGIN_2025,
  NO_VALUES_2025,
  SP_DEFENSE_2025,
  SP_RANK_2025,
  WINS_2025,
} from '@/lib/queries/__tests__/fixtures/teamMetric'
import { literalInk } from '../../tokens'
import { METRIC_IDS } from '../../metrics'
import { renderChartSvg, type ChartSpec } from '../svg'
import { teamMetricBarsHeight, type TeamMetricBars } from '../teamMetricBars'
import { METRIC_EMPTY_HEIGHT } from '../metricCard'
import { expectResvgSafe, elidePathData, cheapHash } from './resvgSafe'

function spec(bars: Partial<TeamMetricBars> & Pick<TeamMetricBars, 'series'>): ChartSpec {
  return { chart: 'team-metric-bars', bars: { metric: 'sp_defense', season: 2025, ...bars } }
}

/** The request this shape was built for. */
const FOUR_TEAMS = spec({ series: SP_DEFENSE_2025 })
const RANKS = spec({ metric: 'sp_rank', series: SP_RANK_2025 })
const WINS = spec({ metric: 'wins', series: WINS_2025 })
const MARGIN = spec({ metric: 'avg_margin', series: MARGIN_2025 })
const NO_DATA = spec({ series: NO_VALUES_2025 })

describe('team-metric-bars — resvg safety', () => {
  const cases: Array<[string, ChartSpec]> = [
    ['four teams on a lower-is-better metric', FOUR_TEAMS],
    ['four teams on a rank axis', RANKS],
    ['two teams on a higher-is-better metric', WINS],
    ['a metric that spans zero', MARGIN],
    ['a single team', spec({ series: [SP_DEFENSE_2025[0]] })],
    ['no data at all', NO_DATA],
    ['some teams missing', spec({ series: [SP_DEFENSE_2025[0], { team: 'Nobody State', value: null }] })],
  ]

  for (const [name, chartSpec] of cases) {
    it(`emits resvg-safe markup for ${name}`, async () => {
      expectResvgSafe(await renderChartSvg(chartSpec))
    })

    it(`emits resvg-safe markup for ${name} in dark mode`, async () => {
      expectResvgSafe(await renderChartSvg(chartSpec, { theme: 'dark' }))
    })
  }

  it('emits resvg-safe markup for every metric in the enum', async () => {
    // A metric whose formatter emitted something odd (a `var()`, an unescaped
    // entity) would only show up here.
    for (const metric of METRIC_IDS) {
      expectResvgSafe(await renderChartSvg(spec({ metric, series: WINS_2025 })))
    }
  })
})

describe('team-metric-bars — determinism', () => {
  it('is byte-identical across renders (seeded roughjs)', async () => {
    expect(await renderChartSvg(FOUR_TEAMS)).toBe(await renderChartSvg(FOUR_TEAMS))
  })

  it('pins the full-byte output for the reference chart', async () => {
    expect(cheapHash(await renderChartSvg(FOUR_TEAMS))).toMatchInlineSnapshot(`"0b17a218"`)
  })

  it('matches the reviewable structural snapshot', async () => {
    expect(elidePathData(await renderChartSvg(FOUR_TEAMS))).toMatchSnapshot()
  })

  it('matches the empty-state snapshot in full', async () => {
    expect(await renderChartSvg(NO_DATA)).toMatchSnapshot()
  })
})

describe('team-metric-bars — canvas', () => {
  it('keeps the 700 width and grows the canvas with the row count', async () => {
    expect(await renderChartSvg(FOUR_TEAMS)).toContain(`viewBox="0 0 700 ${teamMetricBarsHeight(4)}"`)
    expect(await renderChartSvg(WINS)).toContain(`viewBox="0 0 700 ${teamMetricBarsHeight(2)}"`)
    expect(teamMetricBarsHeight(4)).toBeGreaterThan(teamMetricBarsHeight(2))
  })

  it("shares the family's compact empty card rather than inventing its own", async () => {
    expect(await renderChartSvg(NO_DATA)).toContain(`viewBox="0 0 700 ${METRIC_EMPTY_HEIGHT}"`)
  })
})

describe('team-metric-bars — ranking is the direction treatment', () => {
  it('puts the best team in the top row for a lower-is-better metric', async () => {
    // Ohio State is the best 2025 SP+ defense at 9.1, Clemson the worst at
    // 18.9. Best first means Ohio State's row label sits at the smallest y.
    const rows = await rowLabels(FOUR_TEAMS)
    expect(rows.map(row => row.label)).toEqual(['Ohio State', 'Oklahoma', 'Texas', 'Clemson'])
  })

  it('puts the best team in the top row for a higher-is-better metric too', async () => {
    const rows = await rowLabels(WINS)
    expect(rows.map(row => row.label)).toEqual(['Oklahoma', 'Clemson'])
  })

  it('ranks a rank metric by the rank itself, 1 first', async () => {
    const rows = await rowLabels(RANKS)
    expect(rows.map(row => row.label)).toEqual(['Ohio State', 'Oklahoma', 'Texas', 'Clemson'])
  })

  it('says which bar length is the good one', async () => {
    // The whole reason ranking replaces the trend's inverted axis: a bar chart
    // cannot flip length without inventing a quantity, so the sentence has to
    // disarm "longer must be better" explicitly.
    const lower = await renderChartSvg(FOUR_TEAMS)
    expect(lower).toContain('Lower is better')
    expect(lower).toContain('ranked best first')
    expect(lower).toContain('shortest bar is the strongest team')

    const higher = await renderChartSvg(WINS)
    expect(higher).toContain('Higher is better')
    expect(higher).toContain('longest bar is the strongest team')

    const rank = await renderChartSvg(RANKS)
    expect(rank).toContain('Rank 1 is best')
    expect(rank).toContain('shortest bar is the strongest team')
  })

  it('drops the length claim entirely once the domain crosses zero', async () => {
    // Bars run both ways from the baseline, so on a two-sided domain length
    // encodes MAGNITUDE, not quality -- the worst team owns the longest bar.
    // "The longest bar is the strongest team" is then exactly inverted, on the
    // one sentence the picture depends on. The honest fallback is row order.
    //
    // The fixture matters: it has to be one where the most-negative team is
    // also the longest bar. A spans-zero fixture whose best team happens to be
    // longest would pass a broken implementation.
    const svg = await renderChartSvg(
      spec({
        metric: 'avg_margin',
        series: [
          { team: 'Oklahoma', value: 3.1 },
          { team: 'Kansas', value: -18.4 },
          { team: 'Purdue', value: -24.6 },
        ],
      }),
    )
    expect(svg).toContain('Higher is better')
    expect(svg).toContain('ranked best first')
    expect(svg).toContain('read the row order, not the bar length')
    // The falsehood must be gone, not merely accompanied by a caveat.
    expect(svg).not.toContain('longest bar is the strongest team')
    expect(svg).not.toContain('shortest bar is the strongest team')
  })

  it('keeps the length claim on a one-sided domain of the same metric', async () => {
    // Guards the fix against over-firing: avg_margin is only ambiguous when the
    // rendered domain actually spans zero, not whenever the metric could.
    const svg = await renderChartSvg(
      spec({
        metric: 'avg_margin',
        series: [
          { team: 'Oklahoma', value: 14.2 },
          { team: 'Texas', value: 6.8 },
        ],
      }),
    )
    expect(svg).toContain('longest bar is the strongest team')
  })

  it("never claims the axis is inverted -- that is the line chart's treatment", async () => {
    expect(await renderChartSvg(FOUR_TEAMS)).not.toContain('the axis is inverted')
  })
})

describe('team-metric-bars — honest lengths', () => {
  it('anchors the value axis at zero', async () => {
    // 2025 SP+ defense runs 9.1 to 18.9. A data-padded domain would start near
    // 5 and draw Clemson's bar three times Ohio State's; zero-anchored it is
    // roughly double, which is the truth.
    const ticks = await xAxisTicks(FOUR_TEAMS)
    expect(Math.min(...ticks.map(tick => tick.value))).toBe(0)
  })

  it('keeps the zero baseline on a rank axis without labelling a rank 0', async () => {
    const svg = await renderChartSvg(RANKS)
    const ticks = await xAxisTicks(RANKS)
    expect(ticks.every(tick => tick.value > 0)).toBe(true)
    expect(svg).toContain('Ohio State')
  })

  it('points a negative bar the other way from the baseline', async () => {
    // Clemson's -3.8 margin must draw left of zero, not as a positive stub.
    const svg = await renderChartSvg(MARGIN)
    expect(svg).toContain('-3.8')
    const ticks = await xAxisTicks(MARGIN)
    expect(Math.min(...ticks.map(tick => tick.value))).toBeLessThan(0)
    expect(ticks.some(tick => tick.value === 0)).toBe(true)
  })

  it('labels every bar with its value, so no length has to be estimated', async () => {
    const svg = await renderChartSvg(FOUR_TEAMS)
    for (const value of ['12.9', '16.4', '9.1', '18.9']) expect(svg).toContain(value)
  })
})

describe('team-metric-bars — ink', () => {
  it('draws in the categorical ramp, never the valence-carrying semantic tokens', async () => {
    // `--color-positive` means *good* app-wide; assigning it by slot order made
    // a chart call the worst team on the card green (spec §6).
    const svg = await renderChartSvg(FOUR_TEAMS)
    for (const semantic of ['#4A7A5C', '#A65A5A', '#5C5A7A']) expect(svg).not.toContain(semantic)
  })

  it('assigns ink by request order, not by placing', async () => {
    // Oklahoma is named first and placed second. Colour is identity here, so
    // it keeps --series-1 -- and keeps the same colour it had on a trend chart
    // of the same request.
    const ink = literalInk('light')
    const svg = await renderChartSvg(FOUR_TEAMS)
    for (const color of ink.series) expect(svg).toContain(color)

    // Reversing the request order changes which team gets which ink, which is
    // exactly what "colour follows the caller's order" means.
    const reversed = await renderChartSvg(spec({ series: [...SP_DEFENSE_2025].reverse() }))
    expect(reversed).not.toBe(svg)
  })

  it('swaps the ramp per mode instead of reusing one theme-invariant set', async () => {
    const light = await renderChartSvg(FOUR_TEAMS, { theme: 'light' })
    const dark = await renderChartSvg(FOUR_TEAMS, { theme: 'dark' })

    for (const token of literalInk('light').series) {
      expect(light).toContain(token)
      expect(dark).not.toContain(token)
    }
    for (const token of literalInk('dark').series) {
      expect(dark).toContain(token)
      expect(light).not.toContain(token)
    }
  })

  it('bakes literal dark-mode ink into the markup', async () => {
    const svg = await renderChartSvg(FOUR_TEAMS, { theme: 'dark' })
    expect(svg).toContain('#252019') // --bg-surface, dark
    expect(svg).toContain('#8A847A') // --text-muted, dark
    expect(svg).not.toContain('#FFFFFF')
  })

  it('keeps the house primary weights off the bars -- §9 gives bars their own', async () => {
    // ROUGH_BAR is 1.5px; the 3px primary belongs to line series.
    expect(await renderChartSvg(FOUR_TEAMS)).not.toContain('stroke-width="3"')
  })

  it('leans adjacent bars apart with the paired ±41° hachure (spec §10)', async () => {
    // Texture separation between vertically adjacent rows. Not a colour
    // fallback -- the row label is that.
    const svg = await renderChartSvg(FOUR_TEAMS)
    expect(countPaths(svg)).toBeGreaterThan(countPaths(await renderChartSvg(NO_DATA)))
  })
})

describe('team-metric-bars — content', () => {
  it('names the metric, the teams and the season', async () => {
    const svg = await renderChartSvg(FOUR_TEAMS)
    expect(svg).toContain('SP+ defense rating')
    expect(svg).toContain('Oklahoma')
    expect(svg).toContain('Clemson')
    expect(svg).toContain('2025')
  })

  it('carries no legend -- every row is captioned with its own team', async () => {
    // The trend card needs one because its lines overlap; here a legend would
    // just repeat the four row labels sitting beside the bars.
    const svg = await renderChartSvg(FOUR_TEAMS)
    for (const team of ['Oklahoma', 'Texas', 'Ohio State', 'Clemson']) {
      expect(occurrences(svg, `>${team}<`)).toBe(1)
    }
  })

  it('names the teams it could not chart, and still draws the ones it could', async () => {
    const svg = await renderChartSvg(
      spec({ series: [SP_DEFENSE_2025[0], { team: 'Nobody State', value: null }] }),
    )
    expect(svg).toContain('No SP+ defensive rating on record for Nobody State.')
    expect(svg).toContain('Oklahoma')
  })

  it('explains itself when no team has any data', async () => {
    const svg = await renderChartSvg(NO_DATA)
    expect(svg).toContain('No SP+ defensive rating on record for Nobody State and Nowhere Tech in 2025.')
  })

  it('escapes XML-hostile team names instead of producing invalid markup', async () => {
    const svg = await renderChartSvg(spec({ series: [{ team: 'Texas A&M <Aggies>', value: 14.2 }] }))
    expect(svg).toContain('Texas A&amp;M &lt;Aggies&gt;')
    expect(svg).not.toContain('A&M <Aggies>')
    expectResvgSafe(svg)
  })

  it('survives a flat field where every team has the same value', async () => {
    const flat = spec({
      series: [
        { team: 'Oklahoma', value: 14 },
        { team: 'Clemson', value: 14 },
      ],
    })
    expectResvgSafe(await renderChartSvg(flat))
  })

  it('survives a field of zeros without dividing by zero', async () => {
    const zeros = spec({ metric: 'wins', series: [{ team: 'Winless State', value: 0 }] })
    expectResvgSafe(await renderChartSvg(zeros))
  })

  it('draws at most four bars even if handed more', async () => {
    const five = spec({ series: [...SP_DEFENSE_2025, { team: 'Fifth Wheel', value: 11.1 }] })
    expect(await renderChartSvg(five)).not.toContain('Fifth Wheel')
  })
})

/** Count of emitted `<path>` elements -- a proxy for "how much got drawn". */
function countPaths(svg: string): number {
  return [...svg.matchAll(/<path\b/g)].length
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

/**
 * Row labels top to bottom. Identified by their anchor: team names are the only
 * `text-anchor="end"` labels in the left gutter, at x = contentX + LABEL_W.
 */
async function rowLabels(chartSpec: ChartSpec): Promise<Array<{ label: string; y: number }>> {
  const svg = await renderChartSvg(chartSpec)
  return [...svg.matchAll(/<text x="160" y="([\d.]+)" text-anchor="end"[^>]*>([^<]+)<\/text>/g)]
    .map(match => ({ y: Number(match[1]), label: match[2] }))
    .sort((a, b) => a.y - b.y)
}

/**
 * The x-axis tick labels, with the canvas x they were drawn at. Identified by
 * their y: the tick gutter sits below the last row and nothing else is there.
 */
async function xAxisTicks(chartSpec: ChartSpec): Promise<Array<{ value: number; x: number }>> {
  const svg = await renderChartSvg(chartSpec)
  return [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)" text-anchor="middle"[^>]*>([-\d.]+)<\/text>/g)]
    .map(match => ({ x: Number(match[1]), y: Number(match[2]), value: Number(match[3]) }))
    .filter(tick => Number.isFinite(tick.value))
}
