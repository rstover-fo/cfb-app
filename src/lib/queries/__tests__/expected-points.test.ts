/**
 * Unit tests for the expected-points query layer
 * (src/lib/queries/expected-points.ts). These functions back the
 * get_expected_points MCP tool and keep mcp.ts's contract: raw view rows,
 * friendly "Error: ..." strings on failure (never a throw), and hard row caps.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createSupabaseMock, dbError, ok, type SupabaseMockConfig } from './helpers'
import { DEFAULT_ROW_CAP } from '../mcp'
import {
  EXPECTED_POINTS_DEFAULT_LIMIT,
  EXPECTED_POINTS_ERAS,
  EXPECTED_POINTS_FIRST_SEASON,
  PUNT_OUTCOMES_BY_ERA_ZONE,
  PUNT_RETURN_TD_EP,
  computePuntEp,
  distanceBucketFor,
  eraForSeason,
  fieldZoneForYardsToGoal,
  queryExpectedPoints,
} from '../expected-points'

function mockClient(config: SupabaseMockConfig) {
  const mock = createSupabaseMock(config)
  vi.mocked(createClient).mockResolvedValue(mock as unknown as Awaited<ReturnType<typeof createClient>>)
  return mock
}

function apiChain(mock: ReturnType<typeof mockClient>) {
  return mock.schema.mock.results[0].value.from.mock.results[0].value
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('eraForSeason', () => {
  it('maps each documented era boundary onto the right era', () => {
    expect(eraForSeason(2004)).toBe('2004-2013')
    expect(eraForSeason(2013)).toBe('2004-2013')
    expect(eraForSeason(2014)).toBe('2014-2020')
    expect(eraForSeason(2020)).toBe('2014-2020')
    expect(eraForSeason(2021)).toBe('2021+')
  })

  it('is open-ended on the right: future seasons stay in the current era', () => {
    expect(eraForSeason(2026)).toBe('2021+')
    expect(eraForSeason(2099)).toBe('2021+')
  })

  it('returns null before the model coverage starts, not the oldest era', () => {
    expect(eraForSeason(EXPECTED_POINTS_FIRST_SEASON - 1)).toBeNull()
    expect(eraForSeason(1998)).toBeNull()
  })
})

describe('fieldZoneForYardsToGoal', () => {
  it('maps yards-to-goal deciles onto zones counted from the goal line', () => {
    // Zone 1 is 1-10 yards out (nearly scoring), zone 10 is 91-99 (backed up),
    // matching the view's yards_to_goal_min/max decoding.
    expect(fieldZoneForYardsToGoal(1)).toBe(1)
    expect(fieldZoneForYardsToGoal(10)).toBe(1)
    expect(fieldZoneForYardsToGoal(11)).toBe(2)
    expect(fieldZoneForYardsToGoal(50)).toBe(5)
    expect(fieldZoneForYardsToGoal(75)).toBe(8)
    expect(fieldZoneForYardsToGoal(91)).toBe(10)
    expect(fieldZoneForYardsToGoal(99)).toBe(10)
  })

  it('clamps out-of-range spots into the valid 1-10 zone range', () => {
    expect(fieldZoneForYardsToGoal(0)).toBe(1)
    expect(fieldZoneForYardsToGoal(120)).toBe(10)
  })
})

describe('distanceBucketFor', () => {
  it("maps down 1 through its own vocabulary: standard is exactly 10, not 'about 10'", () => {
    // Handoff boundaries: d1 standard(=10) / short(<10) / long(>10).
    expect(distanceBucketFor(1, 10)).toBe('standard')
    expect(distanceBucketFor(1, 9)).toBe('short')
    expect(distanceBucketFor(1, 1)).toBe('short')
    expect(distanceBucketFor(1, 11)).toBe('long')
    expect(distanceBucketFor(1, 25)).toBe('long')
  })

  it('maps downs 2-4 through the short/med/long/xlong boundaries', () => {
    // Handoff boundaries: d2-4 short(<=3) / med(4-6) / long(7-10) / xlong(>10).
    for (const down of [2, 3, 4]) {
      expect(distanceBucketFor(down, 1)).toBe('short')
      expect(distanceBucketFor(down, 3)).toBe('short')
      expect(distanceBucketFor(down, 4)).toBe('med')
      expect(distanceBucketFor(down, 6)).toBe('med')
      expect(distanceBucketFor(down, 7)).toBe('long')
      expect(distanceBucketFor(down, 10)).toBe('long')
      expect(distanceBucketFor(down, 11)).toBe('xlong')
    }
  })

  it('lets goal-to-go override the yardage buckets at every down', () => {
    // 1st-and-goal from the 8 is 'goal', not 'short' -- there is no
    // first-down line before the goal line.
    expect(distanceBucketFor(1, 8, 8)).toBe('goal')
    expect(distanceBucketFor(3, 3, 3)).toBe('goal')
    // Not goal-to-go when a first-down line exists short of the goal.
    expect(distanceBucketFor(1, 10, 35)).toBe('standard')
    expect(distanceBucketFor(3, 3, 12)).toBe('short')
  })
})

describe('computePuntEp', () => {
  /** A flat EP curve makes the weighted arithmetic hand-checkable. */
  function flatCurve(epNet: number, omitZones: number[] = []) {
    const map = new Map<number, number>()
    for (let zone = 1; zone <= 10; zone++) {
      if (!omitZones.includes(zone)) map.set(zone, epNet)
    }
    return map
  }

  it('covers every era and zone with real punt outcomes behind each distribution', () => {
    // The table is embedded (stable historical facts, not a model output);
    // this guards against a refresh accidentally dropping an era or zone.
    for (const era of EXPECTED_POINTS_ERAS) {
      for (let zone = 1; zone <= 10; zone++) {
        const dist = PUNT_OUTCOMES_BY_ERA_ZONE[era][zone]
        const nOpp = dist.oppZoneCounts.reduce((a, b) => a + b, 0)
        expect(nOpp + dist.nReturnTd + dist.nKickKeep).toBeGreaterThan(0)
        expect(dist.kickKeepAvgYtg).toBeGreaterThanOrEqual(1)
        expect(dist.kickKeepAvgYtg).toBeLessThanOrEqual(99)
      }
    }
  })

  it('weights outcomes, not the average spot: return TDs and kick-team recoveries price in', () => {
    // 2021+ zone 5 (punting from midfield): 7469 clean transfers, 16 return
    // TDs, 223 kicking-team recoveries (avg retained spot ytg 54 -> zone 6).
    // On a flat 0.4 EP curve: clean transfers are worth -0.4 each, return TDs
    // -6.97, recoveries +0.4.
    const result = computePuntEp('2021+', 50, flatCurve(0.4))
    const expected = (7469 * -0.4 + 16 * PUNT_RETURN_TD_EP + 223 * 0.4) / 7708

    expect(result).not.toBeNull()
    expect(result!.nPunts).toBe(7708)
    expect(result!.epPunt).toBeCloseTo(expected, 10)
    expect(result!.pReturnTd).toBeCloseTo(16 / 7708, 10)
    expect(result!.pKickKeep).toBeCloseTo(223 / 7708, 10)
  })

  it('returns null when a zone carrying weight has no computed ep_net -- never treats it as zero', () => {
    // 2014-2020 zone 2 has weight in opponent zone 8 (144 punts); dropping
    // that zone from the curve must fail the whole computation.
    expect(computePuntEp('2014-2020', 15, flatCurve(0.4, [8]))).toBeNull()
    // Opponent zone 10 has ZERO weight for that era/zone, so its absence is
    // harmless.
    expect(computePuntEp('2014-2020', 15, flatCurve(0.4, [10]))).not.toBeNull()
  })

  it('keeps the narration-only expected start out of the EP math but plausible', () => {
    // 2021+ zone 8 (own 21-30): opponents mostly start in zones 6-8, i.e.
    // around their own 30-40 -- the classic ~40 net.
    const result = computePuntEp('2021+', 75, flatCurve(0.4))
    expect(result!.expectedOppStartYtg).toBeGreaterThan(55)
    expect(result!.expectedOppStartYtg).toBeLessThan(75)
  })
})

describe('queryExpectedPoints', () => {
  it('always pins the era and orders as a stable walk down the field', async () => {
    const rows = [{ era: '2021+', state: 'd1|standard|z8', ep_drive: 1.7961 }]
    const mock = mockClient({ apiTables: { expected_points: ok(rows) } })
    const result = await queryExpectedPoints({ era: '2021+' })

    expect(result.error).toBeNull()
    expect(result.rows).toEqual(rows)
    const chain = apiChain(mock)
    expect(mock.schema).toHaveBeenCalledWith('api')
    expect(chain.eq).toHaveBeenCalledWith('era', '2021+')
    expect(chain.order).toHaveBeenCalledWith('down', { ascending: true })
    expect(chain.order).toHaveBeenCalledWith('field_zone', { ascending: true })
    expect(chain.order).toHaveBeenCalledWith('distance_bucket', { ascending: true })
  })

  it('applies down, field-zone and bucket filters only when given', async () => {
    const mock = mockClient({ apiTables: { expected_points: ok([]) } })
    await queryExpectedPoints({ era: '2021+', down: 1, fieldZone: 8 })

    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('down', 1)
    expect(chain.eq).toHaveBeenCalledWith('field_zone', 8)
    expect(chain.eq).not.toHaveBeenCalledWith('distance_bucket', expect.anything())

    vi.clearAllMocks()
    const mock2 = mockClient({ apiTables: { expected_points: ok([]) } })
    await queryExpectedPoints({ era: '2014-2020', distanceBucket: 'short' })
    const chain2 = apiChain(mock2)
    expect(chain2.eq).toHaveBeenCalledWith('distance_bucket', 'short')
    expect(chain2.eq).not.toHaveBeenCalledWith('down', expect.anything())
    expect(chain2.eq).not.toHaveBeenCalledWith('field_zone', expect.anything())
  })

  it('defaults the limit and clamps a caller-supplied one to DEFAULT_ROW_CAP', async () => {
    const mock = mockClient({ apiTables: { expected_points: ok([]) } })
    await queryExpectedPoints({ era: '2021+' })
    expect(apiChain(mock).limit).toHaveBeenCalledWith(EXPECTED_POINTS_DEFAULT_LIMIT)

    vi.clearAllMocks()
    const mock2 = mockClient({ apiTables: { expected_points: ok([]) } })
    await queryExpectedPoints({ era: '2021+', limit: 5000 })
    expect(apiChain(mock2).limit).toHaveBeenCalledWith(DEFAULT_ROW_CAP)
  })

  it('returns [] with no error for a bucket the down does not have', async () => {
    // down=1 + 'med' matches nothing in the view; that is a real empty
    // outcome, not a failure, and the tool layer owns explaining it.
    mockClient({ apiTables: { expected_points: ok([]) } })
    expect(await queryExpectedPoints({ era: '2021+', down: 1, distanceBucket: 'med' })).toEqual({
      rows: [],
      error: null,
    })
  })

  it('returns a friendly "Error: ..." string (never throws) on PostgREST error', async () => {
    mockClient({ apiTables: { expected_points: dbError('connection refused') } })
    const result = await queryExpectedPoints({ era: '2021+' })

    expect(result.rows).toEqual([])
    expect(result.error).toMatch(/^Error: api\.expected_points request failed: connection refused$/)
  })
})
