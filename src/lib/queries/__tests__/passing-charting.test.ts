/**
 * Unit tests for src/lib/queries/passing-charting.ts.
 *
 * The property worth pinning is that the charted-play floor binds the sample
 * actually being RANKED, not just whichever denominator happens to be
 * convenient. The two denominators diverge hard in live data -- a 2025 passer
 * with 60 air-yards charted plays has only 18 for YAC -- so a flat air-yards
 * floor let the YAC leaderboard be topped by a 32-play average over a
 * runner-up with 157. Same shape on the receiver side, where targets_charted
 * runs far ahead of the metric-specific counts because a partial parse leaves
 * air yards or YAC unavailable on an otherwise-charted target.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  queryPassingChartingPlayers,
  queryTargetProfiles,
  resolvePlayerMinCharted,
  resolveTargetMinCharted,
  DEFAULT_MIN_CHARTED,
  DEFAULT_TARGET_MIN_CHARTED,
} from '../passing-charting'
import type { SeasonState } from '../season'
import { createSupabaseMock, ok, dbError, type SupabaseMockConfig } from './helpers'

const LIVE_WEEK_3: SeasonState = { season: 2026, through_week: 3, is_live: true, source: 'games' }
const COMPLETED_2025: SeasonState = { season: 2025, through_week: 16, is_live: false, source: 'games' }

function mockClient(config: SupabaseMockConfig) {
  const mock = createSupabaseMock(config)
  vi.mocked(createClient).mockResolvedValue(mock as unknown as Awaited<ReturnType<typeof createClient>>)
  return mock
}

function apiChain(mock: ReturnType<typeof createSupabaseMock>) {
  return mock.schema.mock.results[0].value.from.mock.results[0].value
}

/** The column name passed to the first .gte() call — i.e. the applied floor. */
function flooredColumn(mock: ReturnType<typeof createSupabaseMock>): string {
  return apiChain(mock).gte.mock.calls[0][0]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('queryPassingChartingPlayers floor', () => {
  it('floors on the air-yards denominator when ranking aDOT', async () => {
    const mock = mockClient({ apiTables: { passing_charting_player_season: ok([]) } })
    await queryPassingChartingPlayers({ state: COMPLETED_2025, sort: 'adot' })
    expect(flooredColumn(mock)).toBe('air_yards_attempts_available')
  })

  it('floors on the YAC denominator when ranking YAC', async () => {
    const mock = mockClient({ apiTables: { passing_charting_player_season: ok([]) } })
    await queryPassingChartingPlayers({ state: COMPLETED_2025, sort: 'yac_per_completion' })
    // The bug this guards: an air-yards floor here admits a passer with 50
    // charted air-yard attempts and a single YAC-charted play.
    expect(flooredColumn(mock)).toBe('yards_after_catch_attempts_available')
  })

  it('applies the floor server-side before the row cap', async () => {
    const mock = mockClient({ apiTables: { passing_charting_player_season: ok([]) } })
    await queryPassingChartingPlayers({ state: COMPLETED_2025 })
    const chain = apiChain(mock)
    expect(chain.gte).toHaveBeenCalledWith('air_yards_attempts_available', DEFAULT_MIN_CHARTED)
    expect(chain.limit).toHaveBeenCalled()
  })

  it('derives per-metric coverage from total attempts, and leaves it null when unknowable', async () => {
    mockClient({
      apiTables: {
        passing_charting_player_season: ok([
          { attempts: 400, air_yards_attempts_available: 200, yards_after_catch_attempts_available: 100 },
          { attempts: null, air_yards_attempts_available: 50, yards_after_catch_attempts_available: 25 },
        ]),
      },
    })
    const { rows } = await queryPassingChartingPlayers({ state: COMPLETED_2025 })
    expect(rows[0].air_yards_coverage_pct).toBe(0.5)
    expect(rows[0].yards_after_catch_coverage_pct).toBe(0.25)
    // Unknown coverage must not render as 0.0, which reads as "nothing charted".
    expect(rows[1].air_yards_coverage_pct).toBeNull()
  })

  it('falls back to the default floor and limit on non-positive values', async () => {
    const mock = mockClient({ apiTables: { passing_charting_player_season: ok([]) } })
    // clamp only caps the upper bound, so a negative limit would otherwise
    // reach PostgREST and surface a database error for a caller mistake; a
    // zero floor would admit rows with nothing charted into a ranking that
    // exists to exclude them.
    await queryPassingChartingPlayers({ state: COMPLETED_2025, minCharted: 0, limit: -5 })
    const chain = apiChain(mock)
    expect(chain.gte).toHaveBeenCalledWith('air_yards_attempts_available', DEFAULT_MIN_CHARTED)
    expect(chain.limit).toHaveBeenCalledWith(25)
  })

  it('returns a friendly error string (never throws) on a PostgREST error', async () => {
    mockClient({ apiTables: { passing_charting_player_season: dbError('boom') } })
    const result = await queryPassingChartingPlayers({ state: COMPLETED_2025 })
    expect(result.rows).toEqual([])
    expect(result.error).toMatch(/^Error: api\.passing_charting_player_season/)
  })

  it('resolves the season from state when no explicit season is given', async () => {
    const mock = mockClient({ apiTables: { passing_charting_player_season: ok([]) } })
    await queryPassingChartingPlayers({ state: COMPLETED_2025 })
    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('season', COMPLETED_2025.season)
  })
})

describe('resolvePlayerMinCharted / resolveTargetMinCharted floor scaling', () => {
  it('scales the passer floor down early in a live season (week 3 of 12), never below the minimum', () => {
    // ceil(50 * 3/12) = 13
    expect(resolvePlayerMinCharted(undefined, LIVE_WEEK_3)).toBe(13)
  })

  it('scales the target floor down early in a live season but clamps at the 10-floor minimum', () => {
    // ceil(10 * 3/12) = 3, clamped up to 10.
    expect(resolveTargetMinCharted(undefined, LIVE_WEEK_3)).toBe(10)
  })

  it('leaves an explicit positive floor unscaled even in a live season', () => {
    expect(resolvePlayerMinCharted(30, LIVE_WEEK_3)).toBe(30)
  })

  it('does not scale either floor once the season has completed', () => {
    expect(resolvePlayerMinCharted(undefined, COMPLETED_2025)).toBe(DEFAULT_MIN_CHARTED)
    expect(resolveTargetMinCharted(undefined, COMPLETED_2025)).toBe(DEFAULT_TARGET_MIN_CHARTED)
  })

  it('falls back to the unscaled default with no state at all', () => {
    expect(resolvePlayerMinCharted(undefined)).toBe(DEFAULT_MIN_CHARTED)
    expect(resolveTargetMinCharted(undefined)).toBe(DEFAULT_TARGET_MIN_CHARTED)
  })
})

describe('queryTargetProfiles floor', () => {
  it('floors on targets when ranking volume', async () => {
    const mock = mockClient({ apiTables: { passing_charting_target_season: ok([]) } })
    await queryTargetProfiles({ state: COMPLETED_2025, sort: 'targets' })
    expect(flooredColumn(mock)).toBe('targets_charted')
  })

  it('floors on the air-yards sample when ranking aDOT', async () => {
    const mock = mockClient({ apiTables: { passing_charting_target_season: ok([]) } })
    await queryTargetProfiles({ state: COMPLETED_2025, sort: 'adot' })
    expect(flooredColumn(mock)).toBe('air_yards_charted_plays')
  })

  it('floors on the YAC sample when ranking YAC', async () => {
    const mock = mockClient({ apiTables: { passing_charting_target_season: ok([]) } })
    await queryTargetProfiles({ state: COMPLETED_2025, sort: 'yac' })
    expect(flooredColumn(mock)).toBe('yards_after_catch_charted_plays')
  })

  it('rounds the view raw doubles so the two tools agree on presentation', async () => {
    mockClient({
      apiTables: {
        passing_charting_target_season: ok([
          {
            targets_charted: 155,
            air_yards_charted_plays: 52,
            yards_after_catch_charted_plays: 40,
            average_depth_of_target: 7.865384615384615,
            target_share_charted: 0.34444444444444444,
            partial_share: 0.6645161290322581,
          },
        ]),
      },
    })
    const { rows } = await queryTargetProfiles({ state: COMPLETED_2025 })
    expect(rows[0].average_depth_of_target).toBe(7.865)
    expect(rows[0].target_share_charted).toBe(0.344)
    expect(rows[0].partial_share).toBe(0.665)
    expect(rows[0].air_yards_coverage_pct).toBeCloseTo(0.335, 3)
  })

  it('resolves the season from state when no explicit season is given', async () => {
    const mock = mockClient({ apiTables: { passing_charting_target_season: ok([]) } })
    await queryTargetProfiles({ state: COMPLETED_2025 })
    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('season', COMPLETED_2025.season)
  })
})
