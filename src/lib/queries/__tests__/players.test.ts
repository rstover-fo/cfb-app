/**
 * Unit tests for src/lib/queries/players.ts:
 *  - getPlayerGameLog's post-RPC O/U enrichment (batch-fetch + merge by
 *    game_id, dedupe, never fail the log on the enrichment query erroring)
 *  - getLeaderboardSeasons' PBP_MIN_SEASON floor
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// React's cache() requires a request scope; make it a pass-through in unit
// tests so the query functions can be exercised directly and repeated calls
// with the same args in different `it` blocks don't return stale results
// (matches the pattern in matchups.test.ts).
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, cache: <T>(fn: T): T => fn }
})

// Chainable Supabase query builder mock (matches the house style used by
// src/lib/queries/__tests__/compare.test.ts). Supports `.schema('api')`
// returning itself so api.* views can be mocked the same way as public
// tables/RPCs.
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
const rpcMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: (...args: unknown[]) => fromMock(...args),
    schema: vi.fn().mockReturnValue({ from: (...args: unknown[]) => fromMock(...args) }),
    rpc: (...args: unknown[]) => rpcMock(...args),
  }),
}))

import { getPlayerGameLog, getLeaderboardSeasons } from '../players'

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// getPlayerGameLog
// ---------------------------------------------------------------------------

const RPC_ROW = (overrides: Record<string, unknown> = {}) => ({
  game_id: 101,
  season: 2025,
  team: 'Oklahoma',
  player_name: 'Jackson Arnold',
  play_category: 'passing',
  plays: 30,
  total_epa: 8.2,
  epa_per_play: 0.27,
  success_rate: 0.5,
  explosive_plays: 4,
  total_yards: 280,
  week: 3,
  opponent: 'Tennessee',
  home_away: 'home',
  result: 'W',
  ...overrides,
})

describe('getPlayerGameLog', () => {
  it('merges RPC rows with api.game_detail O/U by game_id (not array order)', async () => {
    rpcMock.mockResolvedValue({
      data: [
        RPC_ROW({ game_id: 101 }),
        RPC_ROW({ game_id: 102, opponent: 'Auburn', week: 4 }),
      ],
      error: null,
    })
    // Intentionally out-of-order relative to the RPC rows to prove the merge
    // keys off game_id, not array position.
    const builder = chainable({
      data: [
        { game_id: 102, over_under: 48.5, ou_result: 'under' },
        { game_id: 101, over_under: 61.5, ou_result: 'over' },
      ],
      error: null,
    })
    fromMock.mockReturnValue(builder)

    const result = await getPlayerGameLog('player-1', 2025)

    expect(fromMock).toHaveBeenCalledWith('game_detail')
    expect(builder.select).toHaveBeenCalledWith('game_id, over_under, ou_result')

    const game101 = result.find(e => e.game_id === 101)!
    const game102 = result.find(e => e.game_id === 102)!
    expect(game101.over_under).toBe(61.5)
    expect(game101.ou_result).toBe('over')
    expect(game102.over_under).toBe(48.5)
    expect(game102.ou_result).toBe('under')
  })

  it('leaves O/U null on every entry when the game_detail lookup errors, without failing the log', async () => {
    rpcMock.mockResolvedValue({
      data: [RPC_ROW({ game_id: 101 })],
      error: null,
    })
    fromMock.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))

    const result = await getPlayerGameLog('player-1', 2025)

    expect(result).toHaveLength(1)
    expect(result[0].game_id).toBe(101)
    expect(result[0].over_under).toBeNull()
    expect(result[0].ou_result).toBeNull()
    // Core RPC-derived fields still come through untouched.
    expect(result[0].total_epa).toBe(8.2)
  })

  it('dedupes game_ids before batch-fetching O/U (e.g. passing + rushing rows for the same game)', async () => {
    rpcMock.mockResolvedValue({
      data: [
        RPC_ROW({ game_id: 101, play_category: 'passing' }),
        RPC_ROW({ game_id: 101, play_category: 'rushing' }),
        RPC_ROW({ game_id: 102, play_category: 'passing' }),
      ],
      error: null,
    })
    const builder = chainable({
      data: [
        { game_id: 101, over_under: 61.5, ou_result: 'over' },
        { game_id: 102, over_under: 55, ou_result: 'push' },
      ],
      error: null,
    })
    fromMock.mockReturnValue(builder)

    await getPlayerGameLog('player-1', 2025)

    expect(builder.in).toHaveBeenCalledWith('game_id', [101, 102])
  })

  it('returns an empty array (no O/U lookup) when the RPC itself errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const result = await getPlayerGameLog('player-1', 2025)

    expect(result).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// getLeaderboardSeasons
// ---------------------------------------------------------------------------

describe('getLeaderboardSeasons', () => {
  it('filters out seasons before PBP_MIN_SEASON (2014)', async () => {
    rpcMock.mockResolvedValue({
      data: [2025, 2020, 2014, 2013, 2005, 2000],
      error: null,
    })

    const result = await getLeaderboardSeasons()

    expect(result).toEqual([2025, 2020, 2014])
  })

  it('falls back to a floor-respecting default when the RPC returns no data', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })

    const result = await getLeaderboardSeasons()

    expect(result).toEqual([2024])
    expect(result.every(s => s >= 2014)).toBe(true)
  })
})
