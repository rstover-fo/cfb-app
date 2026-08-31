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
import { queryPassingChartingPlayers, queryTargetProfiles, DEFAULT_MIN_CHARTED } from '../passing-charting'
import { createSupabaseMock, ok, dbError, type SupabaseMockConfig } from './helpers'

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
    await queryPassingChartingPlayers({ sort: 'adot' })
    expect(flooredColumn(mock)).toBe('air_yards_attempts_available')
  })

  it('floors on the YAC denominator when ranking YAC', async () => {
    const mock = mockClient({ apiTables: { passing_charting_player_season: ok([]) } })
    await queryPassingChartingPlayers({ sort: 'yac_per_completion' })
    // The bug this guards: an air-yards floor here admits a passer with 50
    // charted air-yard attempts and a single YAC-charted play.
    expect(flooredColumn(mock)).toBe('yards_after_catch_attempts_available')
  })

  it('applies the floor server-side before the row cap', async () => {
    const mock = mockClient({ apiTables: { passing_charting_player_season: ok([]) } })
    await queryPassingChartingPlayers({})
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
    const { rows } = await queryPassingChartingPlayers({})
    expect(rows[0].air_yards_coverage_pct).toBe(0.5)
    expect(rows[0].yards_after_catch_coverage_pct).toBe(0.25)
    // Unknown coverage must not render as 0.0, which reads as "nothing charted".
    expect(rows[1].air_yards_coverage_pct).toBeNull()
  })

  it('returns a friendly error string (never throws) on a PostgREST error', async () => {
    mockClient({ apiTables: { passing_charting_player_season: dbError('boom') } })
    const result = await queryPassingChartingPlayers({})
    expect(result.rows).toEqual([])
    expect(result.error).toMatch(/^Error: api\.passing_charting_player_season/)
  })
})

describe('queryTargetProfiles floor', () => {
  it('floors on targets when ranking volume', async () => {
    const mock = mockClient({ apiTables: { passing_charting_target_season: ok([]) } })
    await queryTargetProfiles({ sort: 'targets' })
    expect(flooredColumn(mock)).toBe('targets_charted')
  })

  it('floors on the air-yards sample when ranking aDOT', async () => {
    const mock = mockClient({ apiTables: { passing_charting_target_season: ok([]) } })
    await queryTargetProfiles({ sort: 'adot' })
    expect(flooredColumn(mock)).toBe('air_yards_charted_plays')
  })

  it('floors on the YAC sample when ranking YAC', async () => {
    const mock = mockClient({ apiTables: { passing_charting_target_season: ok([]) } })
    await queryTargetProfiles({ sort: 'yac' })
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
    const { rows } = await queryTargetProfiles({})
    expect(rows[0].average_depth_of_target).toBe(7.865)
    expect(rows[0].target_share_charted).toBe(0.344)
    expect(rows[0].partial_share).toBe(0.665)
    expect(rows[0].air_yards_coverage_pct).toBeCloseTo(0.335, 3)
  })
})
