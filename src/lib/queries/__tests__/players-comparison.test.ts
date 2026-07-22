/**
 * Unit tests for src/lib/queries/players.ts's getPlayerComparison
 * (api.player_comparison). Season is part of the view's grain (one row per
 * player-season), so the query always orders season-descending and takes a
 * single row via .maybeSingle(): an explicit season filters to that row;
 * no season resolves the player's latest available season from the view's
 * own data. Follows the house createSupabaseMock + fixtures pattern (see
 * players-leaders.test.ts).
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
import { getPlayerComparison } from '../players'
import { createSupabaseMock, dbError, ok, type SupabaseMockConfig } from './helpers'
import { createPlayerComparisonRow } from './fixtures/players'

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

describe('getPlayerComparison', () => {
  it('fetches a single row via maybeSingle, filtered on player_id + season when a season is given', async () => {
    const mock = mockClient({ apiTables: { player_comparison: ok(createPlayerComparisonRow()) } })

    const result = await getPlayerComparison('athlete-1', 2025)

    expect(result).toEqual(createPlayerComparisonRow())

    const chain = apiChain(mock)
    expect(mock.schema).toHaveBeenCalledWith('api')
    expect(chain.eq).toHaveBeenCalledWith('player_id', 'athlete-1')
    expect(chain.eq).toHaveBeenCalledWith('season', 2025)
    expect(chain.limit).toHaveBeenCalledWith(1)
    expect(chain.maybeSingle).toHaveBeenCalled()
  })

  it('defaults to the latest available season (season desc, limit 1) when no season is given', async () => {
    const mock = mockClient({ apiTables: { player_comparison: ok(createPlayerComparisonRow({ season: 2024 })) } })

    const result = await getPlayerComparison('athlete-1')

    expect(result?.season).toBe(2024)

    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('player_id', 'athlete-1')
    expect(chain.eq).not.toHaveBeenCalledWith('season', expect.anything())
    expect(chain.order).toHaveBeenCalledWith('season', { ascending: false })
    expect(chain.limit).toHaveBeenCalledWith(1)
    expect(chain.maybeSingle).toHaveBeenCalled()
  })

  it('coerces PostgREST string-serialized numerics (raw stats and percentiles) to numbers', async () => {
    mockClient({
      apiTables: {
        player_comparison: ok({
          ...createPlayerComparisonRow(),
          pass_yds: '3182',
          pass_pct: '0.652',
          pass_yds_pctl: '0.88',
          ppa_avg_pctl: '0.9',
        }),
      },
    })

    const result = await getPlayerComparison('athlete-1', 2025)

    expect(result?.pass_yds).toBe(3182)
    expect(result?.pass_pct).toBe(0.652)
    expect(result?.pass_yds_pctl).toBe(0.88)
    expect(result?.ppa_avg_pctl).toBe(0.9)
  })

  it('preserves null stats and percentiles as null (no zero-coercion)', async () => {
    mockClient({ apiTables: { player_comparison: ok(createPlayerComparisonRow()) } })

    const result = await getPlayerComparison('athlete-1', 2025)

    expect(result?.rec_yds).toBeNull()
    expect(result?.rec_yds_pctl).toBeNull()
    expect(result?.tackles_pctl).toBeNull()
  })

  it('returns null (not a throw) when no row matches', async () => {
    mockClient({ apiTables: { player_comparison: ok(null) } })

    expect(await getPlayerComparison('nobody', 2025)).toBeNull()
  })

  it('returns null (not a throw) on PostgREST error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockClient({ apiTables: { player_comparison: dbError() } })

    expect(await getPlayerComparison('athlete-1', 2025)).toBeNull()
    errorSpy.mockRestore()
  })
})
