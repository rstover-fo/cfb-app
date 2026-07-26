/**
 * Query tests for `getTeamMetricHistory` (src/lib/queries/teamMetric.ts).
 *
 * Same chainable-builder mock as compare.test.ts -- nothing here touches
 * Supabase. The assertions that matter are the ones a chart depends on: that
 * the select list is derived from the metric registry (so a metric can never
 * name a column that does not exist), that nulls stay gaps instead of becoming
 * zeros, and that every requested team comes back even when it has no rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

function chainable(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const builder: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'neq', 'in', 'not', 'or', 'order', 'limit', 'range', 'lte', 'gte', 'schema']
  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder)
  }
  builder.single = vi.fn().mockResolvedValue(result)
  builder.then = (resolve: (v: unknown) => void) => resolve(result)
  return builder
}

const fromMock = vi.fn()
const schemaMock = vi.fn().mockReturnValue({ from: (...args: unknown[]) => fromMock(...args) })

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: (...args: unknown[]) => fromMock(...args),
    schema: (...args: unknown[]) => schemaMock(...args),
  }),
}))

import { METRICS, METRIC_IDS } from '@/lib/charts/metrics'
import {
  getTeamMetricField,
  getTeamMetricHistory,
  getTeamMetricSeason,
  MAX_METRIC_TEAMS,
  METRIC_FIELD_SIZE,
  MIN_METRIC_SEASON,
  MAX_TREND_SPAN,
} from '../teamMetric'

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

beforeEach(() => {
  fromMock.mockReset()
  schemaMock.mockClear()
  consoleError.mockClear()
})

describe('getTeamMetricHistory', () => {
  it('reads the contracted api.team_history view', async () => {
    const builder = chainable({ data: [], error: null })
    fromMock.mockReturnValue(builder)

    await getTeamMetricHistory(['Oklahoma'], 'sp_defense', 2015, 2025)

    expect(schemaMock).toHaveBeenCalledWith('api')
    expect(fromMock).toHaveBeenCalledWith('team_history')
  })

  it('derives its select list from the metric registry, never select(*)', async () => {
    const builder = chainable({ data: [], error: null })
    fromMock.mockReturnValue(builder)

    await getTeamMetricHistory(['Oklahoma'], 'sp_defense', 2015, 2025)

    expect(builder.select).toHaveBeenCalledWith('team, season, sp_defense')
    expect(builder.select).not.toHaveBeenCalledWith('*')
  })

  it('filters to the requested teams and season window', async () => {
    const builder = chainable({ data: [], error: null })
    fromMock.mockReturnValue(builder)

    await getTeamMetricHistory(['Oklahoma', 'Clemson'], 'sp_rating', 2015, 2025)

    expect(builder.in).toHaveBeenCalledWith('team', ['Oklahoma', 'Clemson'])
    expect(builder.gte).toHaveBeenCalledWith('season', 2015)
    expect(builder.lte).toHaveBeenCalledWith('season', 2025)
    // teams x seasons -- the true row ceiling, stated rather than assumed.
    expect(builder.limit).toHaveBeenCalledWith(22)
  })

  it('groups rows by team, in the order requested, sorted by season', async () => {
    fromMock.mockReturnValue(
      chainable({
        data: [
          { team: 'Clemson', season: 2016, sp_defense: 14.1 },
          { team: 'Oklahoma', season: 2016, sp_defense: 22.9 },
          { team: 'Oklahoma', season: 2015, sp_defense: 19.3 },
          { team: 'Clemson', season: 2015, sp_defense: 17.2 },
        ],
        error: null,
      }),
    )

    const result = await getTeamMetricHistory(['Oklahoma', 'Clemson'], 'sp_defense', 2015, 2016)

    expect(result.map(series => series.team)).toEqual(['Oklahoma', 'Clemson'])
    expect(result[0].points).toEqual([
      { season: 2015, value: 19.3 },
      { season: 2016, value: 22.9 },
    ])
    expect(result[1].points).toEqual([
      { season: 2015, value: 17.2 },
      { season: 2016, value: 14.1 },
    ])
  })

  it('drops null metric values instead of charting them as zero', async () => {
    fromMock.mockReturnValue(
      chainable({
        data: [
          { team: 'Oklahoma', season: 2015, sp_defense: 19.3 },
          { team: 'Oklahoma', season: 2016, sp_defense: null },
          { team: 'Oklahoma', season: 2017, sp_defense: 24.2 },
        ],
        error: null,
      }),
    )

    const [series] = await getTeamMetricHistory(['Oklahoma'], 'sp_defense', 2015, 2017)

    expect(series.points.map(point => point.season)).toEqual([2015, 2017])
    expect(series.points.some(point => point.value === 0)).toBe(false)
  })

  it('keeps a requested team with no rows, as an empty series', async () => {
    fromMock.mockReturnValue(
      chainable({ data: [{ team: 'Oklahoma', season: 2015, sp_defense: 19.3 }], error: null }),
    )

    const result = await getTeamMetricHistory(['Oklahoma', 'Nobody State'], 'sp_defense', 2015, 2015)

    expect(result).toHaveLength(2)
    expect(result[1]).toEqual({ team: 'Nobody State', points: [] })
  })

  it('ignores rows for a team that was never asked for', async () => {
    fromMock.mockReturnValue(
      chainable({
        data: [
          { team: 'Oklahoma', season: 2015, sp_defense: 19.3 },
          { team: 'Texas', season: 2015, sp_defense: 21.1 },
        ],
        error: null,
      }),
    )

    const result = await getTeamMetricHistory(['Oklahoma'], 'sp_defense', 2015, 2015)

    expect(result).toHaveLength(1)
    expect(result[0].points).toHaveLength(1)
  })

  it('returns every series empty on a query error -- a partial chart would be a lie', async () => {
    fromMock.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))

    const result = await getTeamMetricHistory(['Oklahoma', 'Clemson'], 'sp_defense', 2015, 2025)

    expect(result).toEqual([
      { team: 'Oklahoma', points: [] },
      { team: 'Clemson', points: [] },
    ])
    expect(consoleError).toHaveBeenCalled()
  })

  it('short-circuits without a query for an empty team list or a backwards range', async () => {
    expect(await getTeamMetricHistory([], 'sp_defense', 2015, 2025)).toEqual([])
    expect(await getTeamMetricHistory(['Oklahoma'], 'sp_defense', 2025, 2015)).toEqual([
      { team: 'Oklahoma', points: [] },
    ])
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('getTeamMetricSeason', () => {
  it('reads the same view through the same range query, pinned to one season', async () => {
    const builder = chainable({ data: [], error: null })
    fromMock.mockReturnValue(builder)

    await getTeamMetricSeason(['Oklahoma', 'Texas'], 'sp_defense', 2025)

    expect(fromMock).toHaveBeenCalledWith('team_history')
    expect(builder.select).toHaveBeenCalledWith('team, season, sp_defense')
    expect(builder.gte).toHaveBeenCalledWith('season', 2025)
    expect(builder.lte).toHaveBeenCalledWith('season', 2025)
    // One row per team, not teams x span -- the projection is the only thing
    // that differs between the two shapes' reads.
    expect(builder.limit).toHaveBeenCalledWith(2)
  })

  it('flattens each team to a single value, in the order requested', async () => {
    fromMock.mockReturnValue(
      chainable({
        data: [
          { team: 'Texas', season: 2025, sp_defense: 16.4 },
          { team: 'Oklahoma', season: 2025, sp_defense: 12.9 },
        ],
        error: null,
      }),
    )

    expect(await getTeamMetricSeason(['Oklahoma', 'Texas'], 'sp_defense', 2025)).toEqual([
      { team: 'Oklahoma', value: 12.9 },
      { team: 'Texas', value: 16.4 },
    ])
  })

  it('keeps a team with no row as a null value rather than dropping it', async () => {
    // Inherited from the range query: the team survives as far as the chart's
    // "no data for..." note instead of vanishing from a card that was asked
    // about it.
    fromMock.mockReturnValue(
      chainable({ data: [{ team: 'Oklahoma', season: 2025, sp_defense: 12.9 }], error: null }),
    )

    expect(await getTeamMetricSeason(['Oklahoma', 'Nobody State'], 'sp_defense', 2025)).toEqual([
      { team: 'Oklahoma', value: 12.9 },
      { team: 'Nobody State', value: null },
    ])
  })

  it('keeps a null metric value null rather than charting a zero-length bar as real', async () => {
    fromMock.mockReturnValue(
      chainable({ data: [{ team: 'Oklahoma', season: 2025, sp_defense: null }], error: null }),
    )

    expect(await getTeamMetricSeason(['Oklahoma'], 'sp_defense', 2025)).toEqual([
      { team: 'Oklahoma', value: null },
    ])
  })

  it('returns every value null on a query error -- a partial field would be a lie', async () => {
    fromMock.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))

    expect(await getTeamMetricSeason(['Oklahoma', 'Texas'], 'sp_defense', 2025)).toEqual([
      { team: 'Oklahoma', value: null },
      { team: 'Texas', value: null },
    ])
    expect(consoleError).toHaveBeenCalled()
  })
})

describe('getTeamMetricField', () => {
  /** `n` teams whose rating descends, so placings are predictable. */
  function seasonRows(n: number, extra: Array<Record<string, unknown>> = []) {
    return [
      ...Array.from({ length: n }, (_, i) => ({
        team: `Team ${String(i + 1).padStart(2, '0')}`,
        sp_offense: 40 - i,
        sp_defense: 10 + i,
        sp_rating: 30 - i,
      })),
      ...extra,
    ]
  }

  it('reads one season of the contracted view, with a de-duplicated select list', async () => {
    const builder = chainable({ data: [], error: null })
    fromMock.mockReturnValue(builder)

    await getTeamMetricField('sp_offense', 'sp_defense', 2025, 'sp_rating')

    expect(schemaMock).toHaveBeenCalledWith('api')
    expect(fromMock).toHaveBeenCalledWith('team_history')
    expect(builder.select).toHaveBeenCalledWith('team, sp_offense, sp_defense, sp_rating')
    expect(builder.eq).toHaveBeenCalledWith('season', 2025)
  })

  it('does not name the ranking column twice when it is also a plotted one', async () => {
    // The default request -- sp_rating against sp_offense -- would otherwise
    // send `team, sp_rating, sp_defense, sp_rating`.
    const builder = chainable({ data: [], error: null })
    fromMock.mockReturnValue(builder)

    await getTeamMetricField('sp_rating', 'sp_defense', 2025, 'sp_rating')

    expect(builder.select).toHaveBeenCalledWith('team, sp_rating, sp_defense')
  })

  it('ranks the season best-first and cuts it to `size`', async () => {
    fromMock.mockReturnValue(chainable({ data: seasonRows(40), error: null }))

    const field = await getTeamMetricField('sp_offense', 'sp_defense', 2025, 'sp_rating', [], 25)

    expect(field.points).toHaveLength(25)
    expect(field.points[0]).toEqual({ team: 'Team 01', x: 40, y: 10, placing: 1 })
    expect(field.points[24].placing).toBe(25)
  })

  it('ranks ascending for a metric where smaller is better', async () => {
    // Same predicate the charts use for their axes, so the field and the
    // picture can never disagree about which way a metric runs.
    fromMock.mockReturnValue(
      chainable({
        data: [
          { team: 'Best', sp_offense: 30, sp_defense: 12, sp_rank: 1 },
          { team: 'Worst', sp_offense: 20, sp_defense: 30, sp_rank: 90 },
        ],
        error: null,
      }),
    )

    const field = await getTeamMetricField('sp_offense', 'sp_defense', 2025, 'sp_rank', [], 2)

    expect(field.points.map(point => point.team)).toEqual(['Best', 'Worst'])
    expect(field.points[0].placing).toBe(1)
  })

  it('unions a named team that missed the cut, keeping its real placing', async () => {
    // The whole reason `rankBy` picks a field rather than a team list: a team
    // someone asked about is the subject, wherever it placed.
    fromMock.mockReturnValue(chainable({ data: seasonRows(40), error: null }))

    const field = await getTeamMetricField('sp_offense', 'sp_defense', 2025, 'sp_rating', ['Team 33'], 25)

    expect(field.points).toHaveLength(26)
    expect(field.points.find(point => point.team === 'Team 33')?.placing).toBe(33)
    // ...and it does not displace the 25th team.
    expect(field.points.some(point => point.team === 'Team 25')).toBe(true)
  })

  it('drops a row missing either plotted metric -- half a pair is not a position', async () => {
    fromMock.mockReturnValue(
      chainable({
        data: [
          { team: 'Complete', sp_offense: 30, sp_defense: 12, sp_rating: 20 },
          { team: 'No offense', sp_offense: null, sp_defense: 12, sp_rating: 19 },
          { team: 'No defense', sp_offense: 30, sp_defense: null, sp_rating: 18 },
        ],
        error: null,
      }),
    )

    const field = await getTeamMetricField('sp_offense', 'sp_defense', 2025, 'sp_rating')

    expect(field.points.map(point => point.team)).toEqual(['Complete'])
  })

  it('keeps a team with no ranking value, unplaced rather than placed zero', async () => {
    fromMock.mockReturnValue(
      chainable({
        data: seasonRows(3, [{ team: 'Unranked', sp_offense: 25, sp_defense: 25, sp_rating: null }]),
        error: null,
      }),
    )

    const field = await getTeamMetricField('sp_offense', 'sp_defense', 2025, 'sp_rating', ['Unranked'], 25)

    const unranked = field.points.find(point => point.team === 'Unranked')
    expect(unranked?.placing).toBeNull()
    // Sunk to the end rather than sorted as a zero rating.
    expect(field.points[field.points.length - 1].team).toBe('Unranked')
  })

  it('names a team it has no usable row for', async () => {
    fromMock.mockReturnValue(chainable({ data: seasonRows(3), error: null }))

    const field = await getTeamMetricField('sp_offense', 'sp_defense', 2025, 'sp_rating', ['Nobody State'])

    expect(field.missing).toEqual(['Nobody State'])
    expect(field.points).toHaveLength(3)
  })

  it('breaks ties by team name, so the same season always mints the same chart', async () => {
    // Byte-identical output is what makes the route's caching honest.
    const tied = [
      { team: 'Zebra Tech', sp_offense: 30, sp_defense: 12, sp_rating: 20 },
      { team: 'Aardvark A&M', sp_offense: 31, sp_defense: 13, sp_rating: 20 },
    ]
    fromMock.mockReturnValue(chainable({ data: tied, error: null }))
    const first = await getTeamMetricField('sp_offense', 'sp_defense', 2025, 'sp_rating')

    fromMock.mockReturnValue(chainable({ data: [...tied].reverse(), error: null }))
    const second = await getTeamMetricField('sp_offense', 'sp_defense', 2025, 'sp_rating')

    expect(first.points.map(point => point.team)).toEqual(['Aardvark A&M', 'Zebra Tech'])
    expect(second).toEqual(first)
  })

  it('returns an empty field on a query error -- a partial season would read as the whole one', async () => {
    fromMock.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))

    const field = await getTeamMetricField('sp_offense', 'sp_defense', 2025, 'sp_rating', ['Oklahoma'])

    expect(field).toEqual({ points: [], missing: ['Oklahoma'] })
    expect(consoleError).toHaveBeenCalled()
  })

  it('publishes the field size the route and the chart both assume', () => {
    expect(METRIC_FIELD_SIZE).toBe(25)
  })
})

describe('metric registry', () => {
  it('every metric names a distinct column', () => {
    const columns = METRIC_IDS.map(id => METRICS[id].column)
    expect(new Set(columns).size).toBe(columns.length)
  })

  it('every id equals its column, so the URL is self-describing', () => {
    for (const id of METRIC_IDS) expect(METRICS[id].column).toBe(id)
  })

  it('columns are safe to interpolate into a PostgREST select list', () => {
    // The registry is the only source of column names -- caller input never
    // reaches the select string -- but this keeps that invariant checkable.
    for (const id of METRIC_IDS) expect(METRICS[id].column).toMatch(/^[a-z][a-z0-9_]*$/)
  })

  it('flags every rank as lower-is-better, so each shape can apply its direction treatment', () => {
    for (const id of METRIC_IDS) {
      const metric = METRICS[id]
      if (metric.kind === 'rank') expect(metric.lowerIsBetter).toBe(true)
    }
  })

  it('formats a value for each metric without throwing', () => {
    for (const id of METRIC_IDS) expect(typeof METRICS[id].format(12.345)).toBe('string')
  })
})

describe('metric limits', () => {
  it('publishes the bounds the route and the MCP tool both enforce', () => {
    expect(MAX_METRIC_TEAMS).toBe(4)
    expect(MIN_METRIC_SEASON).toBeLessThan(2000)
    expect(MAX_TREND_SPAN).toBeGreaterThanOrEqual(10)
  })
})
