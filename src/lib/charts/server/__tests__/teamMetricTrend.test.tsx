/**
 * SVG-level tests for `team-metric-trend`, the generative chart primitive.
 *
 * Same strategy as renderChartSvg.test.tsx: nothing touches Supabase (the
 * renderer imports `TeamMetricSeries` as a *type*, which erases), snapshots are
 * of SVG strings rather than PNG bytes, and `expectResvgSafe` runs over every
 * output including the empty state -- a chart that renders perfectly in a
 * browser and blank under resvg is the failure mode that matters here.
 *
 * The fixtures are real Oklahoma/Clemson history, so these assertions describe
 * what the scales do with data that actually occurred.
 */
import { describe, it, expect } from 'vitest'
import {
  CLEMSON_SP_DEFENSE,
  CLEMSON_SP_RANK,
  EMPTY_SERIES,
  GAPPED_SERIES,
  OHIO_STATE_SP_RANK,
  OKLAHOMA_SP_DEFENSE,
  OKLAHOMA_SP_RANK,
  OKLAHOMA_WINS,
  SINGLE_POINT_SERIES,
  TEXAS_SP_RANK,
} from '@/lib/queries/__tests__/fixtures/teamMetric'
import type { TeamMetricSeries } from '@/lib/queries/teamMetric'
import { literalInk } from '../../tokens'
import { renderChartSvg, type ChartSpec } from '../svg'
import { teamMetricTrendHeight, type TeamMetricTrend } from '../teamMetricTrend'
import { METRIC_EMPTY_HEIGHT } from '../metricCard'
import { METRIC_IDS } from '../../metrics'
import { expectResvgSafe, elidePathData, cheapHash } from './resvgSafe'

function spec(trend: Partial<TeamMetricTrend> & Pick<TeamMetricTrend, 'series'>): ChartSpec {
  return {
    chart: 'team-metric-trend',
    trend: { metric: 'sp_defense', from: 2015, to: 2025, ...trend },
  }
}

/** The request this whole primitive was built for. */
const OU_CLEMSON_DEFENSE = spec({ series: [OKLAHOMA_SP_DEFENSE, CLEMSON_SP_DEFENSE] })

const ANNOTATED = spec({
  series: [OKLAHOMA_SP_DEFENSE, CLEMSON_SP_DEFENSE],
  annotations: [{ season: 2022, label: 'Venables hired' }],
})

const FOUR_TEAMS = spec({
  metric: 'sp_rank',
  series: [OKLAHOMA_SP_RANK, CLEMSON_SP_RANK, TEXAS_SP_RANK, OHIO_STATE_SP_RANK],
})

const SINGLE_TEAM = spec({ metric: 'wins', series: [OKLAHOMA_WINS] })

const NO_DATA = spec({ series: [EMPTY_SERIES] })

describe('team-metric-trend — resvg safety', () => {
  const cases: Array<[string, ChartSpec]> = [
    ['two teams', OU_CLEMSON_DEFENSE],
    ['with an annotation', ANNOTATED],
    ['four teams on a rank axis', FOUR_TEAMS],
    ['a single team', SINGLE_TEAM],
    ['gaps and an isolated season', spec({ metric: 'ppg', from: 2010, to: 2025, series: [GAPPED_SERIES, SINGLE_POINT_SERIES] })],
    ['no data at all', NO_DATA],
    ['some teams missing', spec({ series: [OKLAHOMA_SP_DEFENSE, EMPTY_SERIES] })],
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
      expectResvgSafe(await renderChartSvg(spec({ metric, series: [OKLAHOMA_WINS] })))
    }
  })
})

describe('team-metric-trend — determinism', () => {
  it('is byte-identical across renders (seeded roughjs)', async () => {
    expect(await renderChartSvg(ANNOTATED)).toBe(await renderChartSvg(ANNOTATED))
  })

  it('pins the full-byte output for the reference chart', async () => {
    expect(cheapHash(await renderChartSvg(ANNOTATED))).toMatchInlineSnapshot(`"87ec9941"`)
  })

  it('matches the reviewable structural snapshot', async () => {
    expect(elidePathData(await renderChartSvg(ANNOTATED))).toMatchSnapshot()
  })

  it('matches the empty-state snapshot in full', async () => {
    expect(await renderChartSvg(NO_DATA)).toMatchSnapshot()
  })
})

describe('team-metric-trend — canvas', () => {
  it('keeps the 700 width and grows the canvas with the legend', async () => {
    const two = await renderChartSvg(OU_CLEMSON_DEFENSE)
    const four = await renderChartSvg(FOUR_TEAMS)

    expect(two).toContain(`viewBox="0 0 700 ${teamMetricTrendHeight(2, false)}"`)
    // Four teams need a second legend row, and the plot height is held
    // constant rather than squashed.
    expect(four).toContain(`viewBox="0 0 700 ${teamMetricTrendHeight(4, false)}"`)
    expect(teamMetricTrendHeight(4, false)).toBeGreaterThan(teamMetricTrendHeight(2, false))
  })

  it('reserves a band above the plot only when there are annotations', async () => {
    expect(await renderChartSvg(ANNOTATED)).toContain(`viewBox="0 0 700 ${teamMetricTrendHeight(2, true)}"`)
    expect(teamMetricTrendHeight(2, true)).toBeGreaterThan(teamMetricTrendHeight(2, false))
  })

  it('shrinks to a compact card when there is nothing to draw', async () => {
    expect(await renderChartSvg(NO_DATA)).toContain(`viewBox="0 0 700 ${METRIC_EMPTY_HEIGHT}"`)
    expect(METRIC_EMPTY_HEIGHT).toBeLessThan(teamMetricTrendHeight(1, false))
  })
})

describe('team-metric-trend — content', () => {
  it('names the metric, the teams and the season range', async () => {
    const svg = await renderChartSvg(OU_CLEMSON_DEFENSE)
    expect(svg).toContain('SP+ defense rating')
    expect(svg).toContain('Oklahoma')
    expect(svg).toContain('Clemson')
    expect(svg).toContain('2015')
    expect(svg).toContain('2025')
  })

  it('states the axis direction for a lower-is-better metric', async () => {
    const svg = await renderChartSvg(OU_CLEMSON_DEFENSE)
    expect(svg).toContain('Lower is better')
    expect(svg).toContain('the axis is inverted')
  })

  it('inverts the y-axis for a lower-is-better metric, and not otherwise', async () => {
    // SP+ defensive rating: smaller is a better defense, so the SMALLEST tick
    // is at the top of the canvas (the smallest y).
    const defense = await yAxisTicks(OU_CLEMSON_DEFENSE)
    expect(defense.length).toBeGreaterThan(2)
    expect(defense[0].value).toBeLessThan(defense[defense.length - 1].value)
    expect(defense[0].y).toBeLessThan(defense[defense.length - 1].y)

    // Wins: bigger is better, so the axis runs the conventional way and the
    // smallest tick sits at the bottom (the largest y).
    const wins = await yAxisTicks(SINGLE_TEAM)
    expect(wins.length).toBeGreaterThan(2)
    expect(wins[0].value).toBeLessThan(wins[wins.length - 1].value)
    expect(wins[0].y).toBeGreaterThan(wins[wins.length - 1].y)
  })

  it('puts rank 1 at the top of a rank axis', async () => {
    const ticks = await yAxisTicks(FOUR_TEAMS)
    const best = ticks.find(tick => tick.value === 1)
    expect(best).toBeDefined()
    expect(best!.y).toBe(Math.min(...ticks.map(tick => tick.y)))
  })

  it('says rank 1 is best on a rank axis, and never labels a rank 0', async () => {
    const svg = await renderChartSvg(FOUR_TEAMS)
    expect(svg).toContain('Rank 1 is best')
    // Ohio State's best fixture season is rank 1, so the axis floor is 1.
    expect(svg).toMatch(/>1</)
    expect(svg).not.toMatch(/>0</)
  })

  it('gives each series a different ink AND a different dash AND a different marker', async () => {
    const svg = await renderChartSvg(FOUR_TEAMS)
    // Design tokens only -- never a team brand hex.
    for (const token of literalInk('light').series) expect(svg).toContain(token)
    // Three dashed treatments plus one solid: color is never the only channel.
    for (const dash of ['9 5', '2 5', '13 4 3 4']) expect(svg).toContain(`stroke-dasharray="${dash}"`)
  })

  it('draws series in the categorical ramp, never the valence-carrying semantic tokens', async () => {
    // `--color-positive` means *good* app-wide; assigning it to whoever placed
    // third in the request order made the chart call the worst team on the card
    // green. The ramp exists so slot order asserts nothing (spec §6).
    const svg = await renderChartSvg(FOUR_TEAMS)
    for (const semantic of ['#4A7A5C', '#A65A5A', '#5C5A7A']) expect(svg).not.toContain(semantic)
  })

  it('swaps the series ramp per mode instead of reusing one theme-invariant set', async () => {
    // The semantic tokens are theme-invariant and several of them fail 3:1 on
    // the dark card, which made a peer series visibly recede in dark mode.
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
    const svg = await renderChartSvg(OU_CLEMSON_DEFENSE, { theme: 'dark' })
    expect(svg).toContain('#252019') // --bg-surface, dark
    expect(svg).toContain('#8A847A') // --text-muted, dark
    expect(svg).not.toContain('#FFFFFF')
  })

  it('draws an annotation as a labelled vertical rule', async () => {
    const svg = await renderChartSvg(ANNOTATED)
    expect(svg).toContain('Venables hired')
    expect(svg).toContain('stroke-dasharray="4 4"')
  })

  it('drops an annotation outside the season range', async () => {
    const svg = await renderChartSvg(
      spec({ series: [OKLAHOMA_SP_DEFENSE], annotations: [{ season: 1999, label: 'Long ago' }] }),
    )
    expect(svg).not.toContain('Long ago')
    // ...and the annotation band is not reserved for it.
    expect(svg).toContain(`viewBox="0 0 700 ${teamMetricTrendHeight(1, false)}"`)
  })

  it('breaks the line across missing seasons instead of drawing a trend that never happened', async () => {
    const gapped = spec({ metric: 'ppg', from: 2010, to: 2025, series: [GAPPED_SERIES] })
    const continuous = spec({ metric: 'ppg', from: 2010, to: 2025, series: [{ ...GAPPED_SERIES, points: GAPPED_SERIES.points.map((p, i) => ({ season: 2010 + i, value: p.value })) }] })

    // Two runs of consecutive seasons (2015-2016, 2022-2023) plus one isolated
    // season means more stroked segments than the same points made contiguous.
    expect(countPaths(await renderChartSvg(gapped))).toBeGreaterThan(countPaths(await renderChartSvg(continuous)))
  })

  it('still marks a season that stands completely alone', async () => {
    // A one-point segment has no line to draw, so without its marker the team
    // would vanish from a chart its legend still names.
    const svg = await renderChartSvg(spec({ series: [SINGLE_POINT_SERIES] }))
    expect(svg).toContain('Sam Houston')
    expect(countPaths(svg)).toBeGreaterThan(countPaths(await renderChartSvg(NO_DATA)))
  })

  it('names the teams it could not chart, and still draws the ones it could', async () => {
    const svg = await renderChartSvg(spec({ series: [OKLAHOMA_SP_DEFENSE, EMPTY_SERIES] }))
    expect(svg).toContain('No SP+ defensive rating on record for Nobody State.')
    expect(svg).toContain('Oklahoma')
  })

  it('explains itself when no team has any data', async () => {
    const svg = await renderChartSvg(NO_DATA)
    expect(svg).toContain('No SP+ defensive rating on record for Nobody State in 2015–2025.')
  })

  it('escapes XML-hostile team names instead of producing invalid markup', async () => {
    const svg = await renderChartSvg(
      spec({ series: [{ ...OKLAHOMA_SP_DEFENSE, team: 'Texas A&M <Aggies>' }] }),
    )
    expect(svg).toContain('Texas A&amp;M &lt;Aggies&gt;')
    expect(svg).not.toContain('A&M <Aggies>')
    expectResvgSafe(svg)
  })

  it('escapes an annotation label, which is free text from the caller', async () => {
    const svg = await renderChartSvg(
      spec({ series: [OKLAHOMA_SP_DEFENSE], annotations: [{ season: 2022, label: 'Fired <b>&' }] }),
    )
    expect(svg).toContain('Fired &lt;b&gt;&amp;')
    expectResvgSafe(svg)
  })

  it('survives a single-season range without dividing by zero', async () => {
    const svg = await renderChartSvg(
      spec({ from: 2025, to: 2025, series: [{ team: 'Oklahoma', points: [{ season: 2025, value: 12.9 }] }] }),
    )
    expect(svg).toContain('2025')
    expectResvgSafe(svg)
  })

  it('survives a flat series, where min equals max', async () => {
    const flat: TeamMetricSeries = {
      team: 'Flat',
      points: [
        { season: 2015, value: 8 },
        { season: 2016, value: 8 },
      ],
    }
    expectResvgSafe(await renderChartSvg(spec({ metric: 'wins', from: 2015, to: 2016, series: [flat] })))
  })

  it('keeps the house primary stroke for a two-team comparison', async () => {
    // §9's primary/secondary split encodes rank, and peers do not outrank each
    // other. ROUGH_PRIMARY's 3px is the only source of stroke-width="3" in the
    // document, so its presence is the assertion.
    expect(await renderChartSvg(SINGLE_TEAM)).toContain('stroke-width="3"')
    expect(await renderChartSvg(OU_CLEMSON_DEFENSE)).toContain('stroke-width="3"')
  })

  it('drops to the secondary stroke only once lines start colliding (3-4 series)', async () => {
    expect(await renderChartSvg(FOUR_TEAMS)).not.toContain('stroke-width="3"')
  })

  it('draws at most four series even if handed more', async () => {
    const five = spec({
      metric: 'sp_rank',
      series: [OKLAHOMA_SP_RANK, CLEMSON_SP_RANK, TEXAS_SP_RANK, OHIO_STATE_SP_RANK, { ...OKLAHOMA_SP_RANK, team: 'Fifth Wheel' }],
    })
    expect(await renderChartSvg(five)).not.toContain('Fifth Wheel')
  })
})

/** Count of emitted `<path>` elements -- a proxy for "how much got drawn". */
function countPaths(svg: string): number {
  return [...svg.matchAll(/<path\b/g)].length
}

/**
 * The y-axis tick labels, in the order emitted (ascending by value), with the
 * canvas y they were drawn at. Identified by their x: the y gutter sits ten
 * units left of the plot, and nothing else in the document is anchored there.
 */
async function yAxisTicks(chartSpec: ChartSpec): Promise<Array<{ value: number; y: number }>> {
  const svg = await renderChartSvg(chartSpec)
  return [...svg.matchAll(/<text x="62" y="([\d.]+)"[^>]*>([^<]+)<\/text>/g)].map(match => ({
    y: Number(match[1]),
    value: Number(match[2].replace('%', '')),
  }))
}
