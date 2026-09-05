/**
 * Unit tests for src/lib/queries/rushing-charting.ts.
 *
 * The property worth pinning is that, unlike passing-charting.ts, EVERY sort
 * here floors on the same column (`attempts`) -- so there is no sort-to-floor
 * mismatch to guard against. What IS worth guarding: the RB-only default
 * (QB attempts include sacks), the `ALL` sentinel, stuff_rate's ascending
 * direction (lower is better, and it is the only inverted sort), and the
 * direction_coverage_pct derivation, which must never divide by a zero or
 * missing denominator.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  queryRushingChartingPlayers,
  resolveMinAttempts,
  resolvePosition,
  DEFAULT_MIN_ATTEMPTS,
  type RushingChartingSort,
} from '../rushing-charting'
import type { SeasonState } from '../season'
import { createSupabaseMock, ok, dbError, type SupabaseMockConfig } from './helpers'

const LIVE_WEEK_1: SeasonState = { season: 2026, through_week: 1, is_live: true, source: 'games' }
const COMPLETED_2025: SeasonState = { season: 2025, through_week: 16, is_live: false, source: 'games' }

function mockClient(config: SupabaseMockConfig) {
  const mock = createSupabaseMock(config)
  vi.mocked(createClient).mockResolvedValue(mock as unknown as Awaited<ReturnType<typeof createClient>>)
  return mock
}

function apiChain(mock: ReturnType<typeof createSupabaseMock>) {
  return mock.schema.mock.results[0].value.from.mock.results[0].value
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('queryRushingChartingPlayers defaults', () => {
  it('floors attempts at 50, defaults to RB, sorts ppa desc with nullsFirst:false, then player_id asc, limit 25', async () => {
    const mock = mockClient({ apiTables: { rushing_charting_player_season: ok([]) } })
    await queryRushingChartingPlayers({ state: COMPLETED_2025 })
    const chain = apiChain(mock)

    expect(chain.gte).toHaveBeenCalledWith('attempts', DEFAULT_MIN_ATTEMPTS)
    expect(chain.eq).toHaveBeenCalledWith('position', 'RB')
    expect(chain.eq).toHaveBeenCalledWith('season', COMPLETED_2025.season)
    expect(chain.order.mock.calls[0]).toEqual(['ppa', { ascending: false, nullsFirst: false }])
    expect(chain.order.mock.calls[1]).toEqual(['player_id', { ascending: true }])
    // (season, player_id, team) grain: a two-stint player has two rows, so team
    // is the final key that keeps the limit boundary deterministic.
    expect(chain.order.mock.calls[2]).toEqual(['team', { ascending: true }])
    expect(chain.order.mock.calls.length).toBe(3)
    expect(chain.limit).toHaveBeenCalledWith(25)
  })

  it('applies the given season instead of the state default', async () => {
    const mock = mockClient({ apiTables: { rushing_charting_player_season: ok([]) } })
    await queryRushingChartingPlayers({ season: 2023, state: COMPLETED_2025 })
    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('season', 2023)
  })

  it('always scopes to a season: the state season by default, an explicit season when given', async () => {
    const byState = mockClient({ apiTables: { rushing_charting_player_season: ok([]) } })
    await queryRushingChartingPlayers({ state: COMPLETED_2025 })
    expect(apiChain(byState).eq).toHaveBeenCalledWith('season', COMPLETED_2025.season)

    const explicit = mockClient({ apiTables: { rushing_charting_player_season: ok([]) } })
    await queryRushingChartingPlayers({ state: COMPLETED_2025, season: 2023 })
    expect(apiChain(explicit).eq).toHaveBeenCalledWith('season', 2023)
    expect(apiChain(explicit).eq).not.toHaveBeenCalledWith('season', COMPLETED_2025.season)
  })

  it('orders stuff_rate ascending (lower is better) with nullsFirst:false', async () => {
    const mock = mockClient({ apiTables: { rushing_charting_player_season: ok([]) } })
    await queryRushingChartingPlayers({ state: COMPLETED_2025, sort: 'stuff_rate' })
    const chain = apiChain(mock)
    expect(chain.order.mock.calls[0]).toEqual(['stuff_rate', { ascending: true, nullsFirst: false }])
  })

  const DESCENDING_SORTS: Array<[RushingChartingSort, string]> = [
    ['success_rate', 'success_rate'],
    ['explosiveness', 'explosiveness'],
    ['ypc', 'yards_per_carry'],
    ['power_success', 'power_success'],
    ['yards', 'total_rushing_yards'],
    ['attempts', 'attempts'],
    ['line_yards', 'line_yards'],
    ['second_level_yards', 'second_level_yards'],
    ['open_field_yards', 'open_field_yards'],
  ]

  it.each(DESCENDING_SORTS)('orders %s by %s descending', async (sort, column) => {
    const mock = mockClient({ apiTables: { rushing_charting_player_season: ok([]) } })
    await queryRushingChartingPlayers({ state: COMPLETED_2025, sort })
    const chain = apiChain(mock)
    expect(chain.order.mock.calls[0]).toEqual([column, { ascending: false, nullsFirst: false }])
  })
})

describe('queryRushingChartingPlayers position filter', () => {
  it("skips the position filter for 'all' and 'ALL'", async () => {
    for (const position of ['all', 'ALL']) {
      const mock = mockClient({ apiTables: { rushing_charting_player_season: ok([]) } })
      await queryRushingChartingPlayers({ state: COMPLETED_2025, position })
      const chain = apiChain(mock)
      expect(chain.eq).not.toHaveBeenCalledWith('position', expect.anything())
    }
  })

  it("applies position 'QB' for input 'qb'", async () => {
    const mock = mockClient({ apiTables: { rushing_charting_player_season: ok([]) } })
    await queryRushingChartingPlayers({ state: COMPLETED_2025, position: 'qb' })
    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('position', 'QB')
  })
})

describe('queryRushingChartingPlayers other filters', () => {
  it('passes team and conference through as .eq(), and omits calls for unset filters', async () => {
    const mock = mockClient({ apiTables: { rushing_charting_player_season: ok([]) } })
    await queryRushingChartingPlayers({ state: COMPLETED_2025, team: 'Ohio State', conference: 'Big Ten' })
    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('team', 'Ohio State')
    expect(chain.eq).toHaveBeenCalledWith('conference', 'Big Ten')
  })

  it('adds no team/conference .eq() calls when omitted', async () => {
    const mock = mockClient({ apiTables: { rushing_charting_player_season: ok([]) } })
    await queryRushingChartingPlayers({ state: COMPLETED_2025 })
    const chain = apiChain(mock)
    expect(chain.eq).not.toHaveBeenCalledWith('team', expect.anything())
    expect(chain.eq).not.toHaveBeenCalledWith('conference', expect.anything())
  })

  it('falls back to the default floor and limit on non-positive values', async () => {
    const mock = mockClient({ apiTables: { rushing_charting_player_season: ok([]) } })
    await queryRushingChartingPlayers({ state: COMPLETED_2025, minAttempts: 0, limit: -5 })
    const chain = apiChain(mock)
    expect(chain.gte).toHaveBeenCalledWith('attempts', DEFAULT_MIN_ATTEMPTS)
    expect(chain.limit).toHaveBeenCalledWith(25)
  })
})

describe('resolveMinAttempts / resolvePosition', () => {
  it('resolveMinAttempts falls back to the default on 0/negative/undefined with no state', () => {
    expect(resolveMinAttempts(0)).toBe(DEFAULT_MIN_ATTEMPTS)
    expect(resolveMinAttempts(-3)).toBe(DEFAULT_MIN_ATTEMPTS)
    expect(resolveMinAttempts(undefined)).toBe(DEFAULT_MIN_ATTEMPTS)
    expect(resolveMinAttempts(20)).toBe(20)
  })

  it('scales the default floor down early in a live season, but never below the minimum', () => {
    // week 1 of 12: ceil(50 * 1/12) = 5, clamped up to the 10-floor minimum.
    expect(resolveMinAttempts(undefined, LIVE_WEEK_1)).toBe(10)
  })

  it('leaves an explicit positive floor unscaled even in a live season', () => {
    expect(resolveMinAttempts(30, LIVE_WEEK_1)).toBe(30)
  })

  it('does not scale the floor once the season has completed', () => {
    expect(resolveMinAttempts(undefined, COMPLETED_2025)).toBe(DEFAULT_MIN_ATTEMPTS)
  })

  it('resolvePosition defaults to RB and uppercases input', () => {
    expect(resolvePosition(undefined)).toBe('RB')
    expect(resolvePosition('rb')).toBe('RB')
    expect(resolvePosition('all')).toBe('ALL')
    expect(resolvePosition('ALL')).toBe('ALL')
    expect(resolvePosition('qb')).toBe('QB')
  })
})

describe('queryRushingChartingPlayers direction coverage and nulls', () => {
  it('derives direction_coverage_pct from available/eligible, and leaves it null when unknowable', async () => {
    mockClient({
      apiTables: {
        rushing_charting_player_season: ok([
          { direction_available_attempts: 26, direction_eligible_attempts: 117 },
          { direction_available_attempts: null, direction_eligible_attempts: 50 },
          { direction_available_attempts: 10, direction_eligible_attempts: 0 },
          { direction_available_attempts: 10, direction_eligible_attempts: null },
          { direction_available_attempts: 0, direction_eligible_attempts: 50 },
        ]),
      },
    })
    const { rows } = await queryRushingChartingPlayers({ state: COMPLETED_2025 })
    expect(rows[0].direction_coverage_pct).toBeCloseTo(0.222, 3)
    expect(rows[1].direction_coverage_pct).toBeNull()
    expect(rows[2].direction_coverage_pct).toBeNull()
    expect(rows[3].direction_coverage_pct).toBeNull()
    // A genuine zero (0 of 50 resolved) must come back as 0, not null -- only
    // a missing side or a zero denominator collapses to null.
    expect(rows[4].direction_coverage_pct).toBe(0)
  })

  it('leaves a NULL ppa on input as null on output (never coerced to 0)', async () => {
    mockClient({
      apiTables: {
        rushing_charting_player_season: ok([{ player_id: '123', ppa: null }]),
      },
    })
    const { rows } = await queryRushingChartingPlayers({ state: COMPLETED_2025 })
    expect(rows[0].ppa).toBeNull()
  })
})

describe('queryRushingChartingPlayers error handling', () => {
  it('returns a friendly error string (never throws) on a PostgREST error', async () => {
    mockClient({ apiTables: { rushing_charting_player_season: dbError('boom') } })
    const result = await queryRushingChartingPlayers({ state: COMPLETED_2025 })
    expect(result.rows).toEqual([])
    expect(result.error).toMatch(/^Error: api\.rushing_charting_player_season/)
  })
})
