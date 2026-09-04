/**
 * Unit tests for the two passing-charting MCP tools (get_passing_charting,
 * get_target_profile) in src/lib/mcp/tools.ts, with the query layer mocked.
 *
 * The behaviour worth pinning here is coverage handling, because that is the
 * way this surface goes confidently wrong rather than visibly broken: the
 * averages divide by a partial charted-play count, the two metrics have
 * DIFFERENT denominators, and a leaderboard that omits them ranks on who got
 * charted rather than on who throws deepest. So every payload must carry the
 * denominators, the derived coverage, and the floor that was applied.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/queries/passing-charting', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries/passing-charting')>(
    '@/lib/queries/passing-charting'
  )
  return {
    ...actual,
    queryPassingChartingPlayers: vi.fn(),
    queryTargetProfiles: vi.fn(),
  }
})

// Season-rollover U3: get_passing_charting/get_target_profile now resolve
// their season default (and the min_charted scaling rule) via
// getCurrentSeasonForRoute() instead of the CURRENT_SEASON constant. Pin it
// to a fixed, non-live state so these tests keep their existing "defaults to
// 2025"/floor expectations; scaleFloor stays real via importActual.
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

import {
  queryPassingChartingPlayers,
  queryTargetProfiles,
  DEFAULT_MIN_CHARTED,
} from '@/lib/queries/passing-charting'
import { getCurrentSeasonForRoute } from '@/lib/queries/season'
import { getPassingChartingTool, getTargetProfileTool } from '../tools'

// Carson Beck's real 2025 row: 462 attempts, but only 288 charted for air
// yards and 207 for YAC. 2070 / 288 = 7.2 -- the aDOT is over the charted
// count, which is the whole trap this surface presents.
const BECK = {
  season: 2025,
  player_id: '4430841',
  player: 'Carson Beck',
  team: 'Miami',
  conference: 'ACC',
  position: 'QB',
  attempts: 462,
  completions: 334,
  interceptions: 6,
  completion_rate: 0.723,
  total_air_yards: 2070,
  average_depth_of_target: 7.2,
  air_yards_attempts_available: 288,
  total_yards_after_catch: 1269,
  average_yards_after_catch: 6.1,
  yards_after_catch_attempts_available: 207,
  air_yards_coverage_pct: 0.623,
  yards_after_catch_coverage_pct: 0.448,
}

const TARGET = {
  season: 2025,
  target_id: '5079720',
  target: 'Jeremiah Smith',
  team_id: 194,
  team: 'Ohio State',
  targets_charted: 61,
  receptions: 40,
  total_air_yards: 700,
  average_depth_of_target: 11.5,
  air_yards_charted_plays: 61,
  total_yards_after_catch: 380,
  average_yards_after_catch: 9.5,
  yards_after_catch_charted_plays: 40,
  target_share_charted: 0.21,
  partial_share: 0.1,
  air_yards_coverage_pct: 1,
  yards_after_catch_coverage_pct: 0.656,
}

const mockPlayers = vi.mocked(queryPassingChartingPlayers)
const mockTargets = vi.mocked(queryTargetProfiles)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('get_passing_charting', () => {
  it('carries both denominators and both derived coverage fractions', async () => {
    mockPlayers.mockResolvedValue({ rows: [BECK], error: null })
    const out = JSON.parse(await getPassingChartingTool({}))

    expect(out._source).toBe('api.passing_charting_player_season')
    const row = out.rows[0]
    // The two denominators differ; collapsing them to one would misstate
    // whichever metric it did not describe.
    expect(row.air_yards_attempts_available).toBe(288)
    expect(row.yards_after_catch_attempts_available).toBe(207)
    expect(row.air_yards_coverage_pct).toBeCloseTo(0.623, 3)
    expect(row.yards_after_catch_coverage_pct).toBeCloseTo(0.448, 3)
    expect(row.air_yards_coverage_pct).not.toEqual(row.yards_after_catch_coverage_pct)
  })

  it('echoes the applied floor so a ranking can be qualified', async () => {
    mockPlayers.mockResolvedValue({ rows: [BECK], error: null })
    const out = JSON.parse(await getPassingChartingTool({}))
    expect(out.min_charted_attempts).toBe(DEFAULT_MIN_CHARTED)
    expect(out.coverage_note).toMatch(/CHARTED plays/)
  })

  it('echoes the ENFORCED floor, not the requested one', async () => {
    mockPlayers.mockResolvedValue({ rows: [BECK], error: null })
    // A direct TS caller bypasses the zod .min(1). The query normalizes 0 away
    // to the default, so echoing the raw arg would have the response claim a
    // threshold that was never applied -- and a reader cannot detect that.
    const out = JSON.parse(await getPassingChartingTool({ min_charted: 0 }))
    expect(out.min_charted_attempts).toBe(DEFAULT_MIN_CHARTED)
  })

  it('reports a caller-supplied floor rather than the default', async () => {
    mockPlayers.mockResolvedValue({ rows: [BECK], error: null })
    const out = JSON.parse(await getPassingChartingTool({ min_charted: 10 }))
    expect(out.min_charted_attempts).toBe(10)
  })

  it('passes filters through to the query layer', async () => {
    mockPlayers.mockResolvedValue({ rows: [BECK], error: null })
    await getPassingChartingTool({ season: 2025, team: 'Miami', conference: 'ACC', sort: 'air_yards', limit: 5 })
    expect(mockPlayers).toHaveBeenCalledWith({
      season: 2025,
      team: 'Miami',
      conference: 'ACC',
      minCharted: undefined,
      sort: 'air_yards',
      limit: 5,
      state: { season: 2025, through_week: 16, is_live: false, source: 'games' },
    })
  })

  it('refuses a pre-charting season as a coverage boundary, not an empty result', async () => {
    const out = await getPassingChartingTool({ season: 2019 })
    expect(out).toMatch(/starts in 2025/)
    expect(out).toMatch(/coverage boundary/)
    // Must not have burned a query on a season that cannot have data.
    expect(mockPlayers).not.toHaveBeenCalled()
  })

  it('explains an empty result in terms of partial coverage, and names the floor', async () => {
    mockPlayers.mockResolvedValue({ rows: [], error: null })
    const out = await getPassingChartingTool({ team: 'Kent State' })
    expect(out).toMatch(new RegExp(`at least ${DEFAULT_MIN_CHARTED} charted attempts`))
    expect(out).toMatch(/407/)
  })

  it('passes a query-layer error string through unchanged (never throws)', async () => {
    mockPlayers.mockResolvedValue({ rows: [], error: 'Error: api.passing_charting_player_season request failed: boom' })
    await expect(getPassingChartingTool({})).resolves.toBe(
      'Error: api.passing_charting_player_season request failed: boom'
    )
  })

  it('carries the resolved season/through_week/source as as_of', async () => {
    mockPlayers.mockResolvedValue({ rows: [BECK], error: null })
    const out = JSON.parse(await getPassingChartingTool({}))
    expect(out.as_of).toEqual({ season: 2025, through_week: 16, source: 'games' })
  })
})

describe('get_passing_charting / get_target_profile floor scaling (live season)', () => {
  beforeEach(() => {
    vi.mocked(getCurrentSeasonForRoute).mockResolvedValue({
      season: 2026,
      through_week: 3,
      is_live: true,
      source: 'games',
    })
  })

  afterEach(() => {
    vi.mocked(getCurrentSeasonForRoute).mockResolvedValue({
      season: 2025,
      through_week: 16,
      is_live: false,
      source: 'games',
    })
  })

  it('scales the passing floor to 13 in week 3 of a live season', async () => {
    mockPlayers.mockResolvedValue({ rows: [BECK], error: null })
    const out = JSON.parse(await getPassingChartingTool({}))
    expect(out.min_charted_attempts).toBe(13)
  })

  it('scales the target floor to 10 (the scaling minimum) in week 3 of a live season', async () => {
    mockTargets.mockResolvedValue({ rows: [TARGET], error: null })
    const out = JSON.parse(await getTargetProfileTool({}))
    expect(out.min_charted_targets).toBe(10)
  })

  it("names the season, 'through week', and the scaled floor in an empty passing-charting message", async () => {
    mockPlayers.mockResolvedValue({ rows: [], error: null })
    const out = await getPassingChartingTool({})
    expect(out).toMatch(/2026/)
    expect(out).toMatch(/through week 3/)
    expect(out).toMatch(/13/)
  })

  it("names the season, 'through week', and the scaled floor in an empty target-profile message", async () => {
    mockTargets.mockResolvedValue({ rows: [], error: null })
    const out = await getTargetProfileTool({})
    expect(out).toMatch(/2026/)
    expect(out).toMatch(/through week 3/)
    expect(out).toMatch(/10/)
  })
})

describe('get_target_profile', () => {
  it('returns receiver-grain rows with per-metric denominators', async () => {
    mockTargets.mockResolvedValue({ rows: [TARGET], error: null })
    const out = JSON.parse(await getTargetProfileTool({}))

    expect(out._source).toBe('api.passing_charting_target_season')
    const row = out.rows[0]
    expect(row.target_id).toBe('5079720')
    expect(row.air_yards_charted_plays).toBe(61)
    expect(row.yards_after_catch_charted_plays).toBe(40)
    expect(row.yards_after_catch_coverage_pct).toBeCloseTo(0.656, 3)
  })

  it('warns that target_share_charted is not a true target share', async () => {
    mockTargets.mockResolvedValue({ rows: [TARGET], error: null })
    const out = JSON.parse(await getTargetProfileTool({}))
    expect(out.coverage_note).toMatch(/NOT a true target share/)
    expect(out.coverage_note).toMatch(/partial_share/)
  })

  it('defaults to a lower floor than the passer tool', async () => {
    mockTargets.mockResolvedValue({ rows: [TARGET], error: null })
    const out = JSON.parse(await getTargetProfileTool({}))
    // A receiver sees a fraction of the plays the passer does; reusing the
    // passer floor would empty the board.
    expect(out.min_charted_targets).toBeLessThan(DEFAULT_MIN_CHARTED)
    expect(out.min_charted_targets).toBe(Math.round(DEFAULT_MIN_CHARTED / 5))
  })

  it('echoes the ENFORCED target floor, not the requested one', async () => {
    mockTargets.mockResolvedValue({ rows: [TARGET], error: null })
    const out = JSON.parse(await getTargetProfileTool({ min_charted: -3 }))
    expect(out.min_charted_targets).toBe(Math.round(DEFAULT_MIN_CHARTED / 5))
  })

  it('refuses a pre-charting season', async () => {
    const out = await getTargetProfileTool({ season: 2014 })
    expect(out).toMatch(/starts in 2025/)
    expect(mockTargets).not.toHaveBeenCalled()
  })

  it('passes a query-layer error string through unchanged (never throws)', async () => {
    mockTargets.mockResolvedValue({ rows: [], error: 'Error: api.passing_charting_target_season request failed: boom' })
    await expect(getTargetProfileTool({})).resolves.toBe(
      'Error: api.passing_charting_target_season request failed: boom'
    )
  })

  it('never throws on an empty result', async () => {
    mockTargets.mockResolvedValue({ rows: [], error: null })
    await expect(getTargetProfileTool({ team: 'Rice' })).resolves.toEqual(expect.any(String))
  })
})
