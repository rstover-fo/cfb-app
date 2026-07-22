/**
 * Unit tests for src/lib/queries/live.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getLiveScoreboard } from '../live'
import { createSupabaseMock, dbError, ok, type SupabaseMockConfig } from './helpers'
import {
  createLiveScoreboardRows,
  createPregameScoreboardRow,
  createInProgressScoreboardRow,
  createFinalScoreboardRow,
} from './fixtures/live'

function mockClient(config: SupabaseMockConfig) {
  const mock = createSupabaseMock(config)
  vi.mocked(createClient).mockResolvedValue(mock as unknown as Awaited<ReturnType<typeof createClient>>)
  return mock
}

/** The chain object returned by this test's `.schema('api').from(...)` call. */
function apiChain(mock: ReturnType<typeof createSupabaseMock>) {
  return mock.schema.mock.results[0].value.from.mock.results[0].value
}

describe('getLiveScoreboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the current slate (pregame/in-progress/final rows) ordered by game_id', async () => {
    mockClient({ apiTables: { live_scoreboard: ok(createLiveScoreboardRows()) } })

    const result = await getLiveScoreboard()

    expect(result).toHaveLength(3)
    expect(result).toEqual([...result].sort((a, b) => a.game_id - b.game_id))
  })

  it('queries api.live_scoreboard with no filters, ordered by game_id ascending', async () => {
    const mock = mockClient({ apiTables: { live_scoreboard: ok(createLiveScoreboardRows()) } })

    await getLiveScoreboard()

    expect(mock.schema).toHaveBeenCalledWith('api')
    const chain = apiChain(mock)
    expect(chain.eq).not.toHaveBeenCalled()
    expect(chain.order).toHaveBeenCalledWith('game_id', { ascending: true })
  })

  it('returns a pregame row with no score/clock/possession/live win prob yet', async () => {
    mockClient({ apiTables: { live_scoreboard: ok([createPregameScoreboardRow()]) } })

    const [game] = await getLiveScoreboard()

    expect(game.status).toBe('scheduled')
    expect(game.period).toBeNull()
    expect(game.clock).toBeNull()
    expect(game.home_points).toBeNull()
    expect(game.possession).toBeNull()
    expect(game.house_live_home_wp).toBeNull()
    expect(game.pregame_expected_margin).toBe(5.2)
  })

  it('returns an in-progress row with possession + clock + house_live_home_wp populated', async () => {
    mockClient({ apiTables: { live_scoreboard: ok([createInProgressScoreboardRow()]) } })

    const [game] = await getLiveScoreboard()

    expect(game.status).toBe('in_progress')
    expect(game.possession).toBe('Ohio State')
    expect(game.clock).toBe('08:41')
    expect(game.period).toBe(2)
    expect(game.house_live_home_wp).toBe(0.71)
  })

  it('returns a final row with period/clock frozen and score settled', async () => {
    mockClient({ apiTables: { live_scoreboard: ok([createFinalScoreboardRow()]) } })

    const [game] = await getLiveScoreboard()

    expect(game.status).toBe('final')
    expect(game.period).toBe(4)
    expect(game.clock).toBe('00:00')
    expect(game.home_points).toBe(38)
    expect(game.away_points).toBe(14)
    expect(game.possession).toBeNull()
  })

  it('an empty live scoreboard is the normal off-season/off-window state, not an error', async () => {
    mockClient({ apiTables: { live_scoreboard: ok([]) } })

    const result = await getLiveScoreboard()

    expect(result).toEqual([])
  })

  it('returns [] (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { live_scoreboard: dbError() } })

    expect(await getLiveScoreboard()).toEqual([])
  })
})
