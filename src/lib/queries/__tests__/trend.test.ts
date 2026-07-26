/**
 * Query tests for `getTeamMetricTrend` (src/lib/queries/trend.ts).
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

import { TREND_METRICS, TREND_METRIC_IDS } from '@/lib/charts/trendMetrics'
import { getTeamMetricTrend, MAX_TREND_TEAMS, MIN_TREND_SEASON, MAX_TREND_SPAN } from '../trend'

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

beforeEach(() => {
  fromMock.mockReset()
  schemaMock.mockClear()
  consoleError.mockClear()
})

describe('getTeamMetricTrend', () => {
  it('reads the contracted api.team_history view', async () => {
    const builder = chainable({ data: [], error: null })
    fromMock.mockReturnValue(builder)

    await getTeamMetricTrend(['Oklahoma'], 'sp_defense', 2015, 2025)

    expect(schemaMock).toHaveBeenCalledWith('api')
    expect(fromMock).toHaveBeenCalledWith('team_history')
  })

  it('derives its select list from the metric registry, never select(*)', async () => {
    const builder = chainable({ data: [], error: null })
    fromMock.mockReturnValue(builder)

    await getTeamMetricTrend(['Oklahoma'], 'sp_defense', 2015, 2025)

    expect(builder.select).toHaveBeenCalledWith('team, season, sp_defense')
    expect(builder.select).not.toHaveBeenCalledWith('*')
  })

  it('filters to the requested teams and season window', async () => {
    const builder = chainable({ data: [], error: null })
    fromMock.mockReturnValue(builder)

    await getTeamMetricTrend(['Oklahoma', 'Clemson'], 'sp_rating', 2015, 2025)

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

    const result = await getTeamMetricTrend(['Oklahoma', 'Clemson'], 'sp_defense', 2015, 2016)

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

    const [series] = await getTeamMetricTrend(['Oklahoma'], 'sp_defense', 2015, 2017)

    expect(series.points.map(point => point.season)).toEqual([2015, 2017])
    expect(series.points.some(point => point.value === 0)).toBe(false)
  })

  it('keeps a requested team with no rows, as an empty series', async () => {
    fromMock.mockReturnValue(
      chainable({ data: [{ team: 'Oklahoma', season: 2015, sp_defense: 19.3 }], error: null }),
    )

    const result = await getTeamMetricTrend(['Oklahoma', 'Nobody State'], 'sp_defense', 2015, 2015)

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

    const result = await getTeamMetricTrend(['Oklahoma'], 'sp_defense', 2015, 2015)

    expect(result).toHaveLength(1)
    expect(result[0].points).toHaveLength(1)
  })

  it('returns every series empty on a query error -- a partial chart would be a lie', async () => {
    fromMock.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))

    const result = await getTeamMetricTrend(['Oklahoma', 'Clemson'], 'sp_defense', 2015, 2025)

    expect(result).toEqual([
      { team: 'Oklahoma', points: [] },
      { team: 'Clemson', points: [] },
    ])
    expect(consoleError).toHaveBeenCalled()
  })

  it('short-circuits without a query for an empty team list or a backwards range', async () => {
    expect(await getTeamMetricTrend([], 'sp_defense', 2015, 2025)).toEqual([])
    expect(await getTeamMetricTrend(['Oklahoma'], 'sp_defense', 2025, 2015)).toEqual([
      { team: 'Oklahoma', points: [] },
    ])
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('metric registry', () => {
  it('every metric names a distinct column', () => {
    const columns = TREND_METRIC_IDS.map(id => TREND_METRICS[id].column)
    expect(new Set(columns).size).toBe(columns.length)
  })

  it('every id equals its column, so the URL is self-describing', () => {
    for (const id of TREND_METRIC_IDS) expect(TREND_METRICS[id].column).toBe(id)
  })

  it('columns are safe to interpolate into a PostgREST select list', () => {
    // The registry is the only source of column names -- caller input never
    // reaches the select string -- but this keeps that invariant checkable.
    for (const id of TREND_METRIC_IDS) expect(TREND_METRICS[id].column).toMatch(/^[a-z][a-z0-9_]*$/)
  })

  it('flags every rank as lower-is-better, so the axis inverts', () => {
    for (const id of TREND_METRIC_IDS) {
      const metric = TREND_METRICS[id]
      if (metric.kind === 'rank') expect(metric.lowerIsBetter).toBe(true)
    }
  })

  it('formats a value for each metric without throwing', () => {
    for (const id of TREND_METRIC_IDS) expect(typeof TREND_METRICS[id].format(12.345)).toBe('string')
  })
})

describe('trend limits', () => {
  it('publishes the bounds the route and the MCP tool both enforce', () => {
    expect(MAX_TREND_TEAMS).toBe(4)
    expect(MIN_TREND_SEASON).toBeLessThan(2000)
    expect(MAX_TREND_SPAN).toBeGreaterThanOrEqual(10)
  })
})
