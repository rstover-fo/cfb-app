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
  getTeamMetricHistory,
  getTeamMetricSeason,
  MAX_METRIC_TEAMS,
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
