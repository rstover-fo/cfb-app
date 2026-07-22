/**
 * Unit tests for src/lib/queries/players.ts's WEPA/usage leaderboard fns:
 * getWepaLeaders (api.player_wepa_leaders, category filter + season_rank
 * ordering) and getUsageLeaders (api.player_usage_leaders, usage_overall
 * ordering). Split from players.test.ts, which owns getPlayerGameLog /
 * getLeaderboardSeasons with a bespoke inline mock -- these two fns follow
 * the house createSupabaseMock + fixtures pattern (see roster-context.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, cache: <T>(fn: T): T => fn }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getWepaLeaders, getUsageLeaders } from '../players'
import { createSupabaseMock, dbError, ok, type SupabaseMockConfig } from './helpers'
import { createWepaLeaderRows, createUsageLeaderRows } from './fixtures/players'

function mockClient(config: SupabaseMockConfig) {
  const mock = createSupabaseMock(config)
  vi.mocked(createClient).mockResolvedValue(mock as unknown as Awaited<ReturnType<typeof createClient>>)
  return mock
}

/** The chain object returned by the Nth `.schema('api').from(...)` call this test made. */
function apiChain(mock: ReturnType<typeof createSupabaseMock>, callIndex = 0) {
  return mock.schema.mock.results[callIndex].value.from.mock.results[0].value
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getWepaLeaders', () => {
  it('returns season_rank-ordered WEPA leaders and filters by category when given', async () => {
    const mock = mockClient({ apiTables: { player_wepa_leaders: ok(createWepaLeaderRows()) } })

    const result = await getWepaLeaders(2025, 'passing')

    expect(result).toEqual(createWepaLeaderRows())
    expect(result[0].athlete_name).toBe('Jackson Arnold')
    expect(result[0].season_rank).toBe(1)

    const chain = apiChain(mock)
    expect(mock.schema).toHaveBeenCalledWith('api')
    expect(chain.eq).toHaveBeenCalledWith('season', 2025)
    expect(chain.eq).toHaveBeenCalledWith('category', 'passing')
    expect(chain.order).toHaveBeenCalledWith('season_rank', { ascending: true })
    expect(chain.limit).toHaveBeenCalledWith(25)
  })

  it('omits the category filter when none is given', async () => {
    const mock = mockClient({ apiTables: { player_wepa_leaders: ok(createWepaLeaderRows()) } })

    await getWepaLeaders(2025)

    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('season', 2025)
    expect(chain.eq).not.toHaveBeenCalledWith('category', expect.anything())
  })

  it('respects a custom limit', async () => {
    const mock = mockClient({ apiTables: { player_wepa_leaders: ok(createWepaLeaderRows()) } })

    await getWepaLeaders(2025, 'rushing', 10)

    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('category', 'rushing')
    expect(chain.limit).toHaveBeenCalledWith(10)
  })

  it('returns an empty array (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { player_wepa_leaders: dbError() } })

    expect(await getWepaLeaders(2025, 'passing')).toEqual([])
  })

  it('returns an empty array when there are no qualifying rows', async () => {
    mockClient({ apiTables: { player_wepa_leaders: ok([]) } })

    expect(await getWepaLeaders(2025, 'kicking')).toEqual([])
  })
})

describe('getUsageLeaders', () => {
  it('returns usage_overall-ordered leaders', async () => {
    const mock = mockClient({ apiTables: { player_usage_leaders: ok(createUsageLeaderRows()) } })

    const result = await getUsageLeaders(2025)

    expect(result).toEqual(createUsageLeaderRows())
    expect(result[0].player_name).toBe('Jackson Arnold')
    expect(result[0].usage_overall).toBe(0.284)

    const chain = apiChain(mock)
    expect(mock.schema).toHaveBeenCalledWith('api')
    expect(chain.eq).toHaveBeenCalledWith('season', 2025)
    expect(chain.order).toHaveBeenCalledWith('usage_overall', { ascending: false })
    expect(chain.limit).toHaveBeenCalledWith(25)
  })

  it('respects a custom limit', async () => {
    const mock = mockClient({ apiTables: { player_usage_leaders: ok(createUsageLeaderRows()) } })

    await getUsageLeaders(2025, 5)

    const chain = apiChain(mock)
    expect(chain.limit).toHaveBeenCalledWith(5)
  })

  it('returns an empty array (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { player_usage_leaders: dbError() } })

    expect(await getUsageLeaders(2025)).toEqual([])
  })

  it('returns an empty array when there are no qualifying rows', async () => {
    mockClient({ apiTables: { player_usage_leaders: ok([]) } })

    expect(await getUsageLeaders(2025)).toEqual([])
  })
})
