/**
 * Unit tests for src/lib/queries/predictions.ts.
 *
 * Lot A (this file's top section, through the marker below) covers
 * getGamePrediction, getLineMovement, getTeamEloHistory. Lot B appends
 * describe blocks for the team/model-scoped fns below the marker -- see
 * predictions-api-memo.md Section 7 for the file-conflict protocol.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getGamePrediction, getLineMovement, getTeamEloHistory } from '../predictions'
import { createSupabaseMock, dbError, ok, type SupabaseMockConfig } from './helpers'
import {
  createGamePredictionRow,
  createGamePredictionRowEloOnly,
  createGamePredictionRowNoMarket,
  createLineMovementRows,
  createTeamEloHistoryRows,
} from './fixtures/predictions'

function mockClient(config: SupabaseMockConfig) {
  vi.mocked(createClient).mockResolvedValue(
    createSupabaseMock(config) as unknown as Awaited<ReturnType<typeof createClient>>
  )
}

describe('getGamePrediction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the prediction row for the given game + model version', async () => {
    mockClient({ apiTables: { game_predictions: ok(createGamePredictionRow()) } })

    const result = await getGamePrediction(401752873, 'elo_epa_blend_v1')

    expect(result).toEqual(createGamePredictionRow())
    expect(result!.edge).toBe(1.5)
    expect(result!.edge_pick).toBe('home')
  })

  it('defaults to DEFAULT_PREDICTION_MODEL (elo_epa_blend_v1) when no model version is given', async () => {
    mockClient({ apiTables: { game_predictions: ok(createGamePredictionRow()) } })

    const result = await getGamePrediction(401752873)

    expect(result!.model_version).toBe('elo_epa_blend_v1')
  })

  it('returns the elo_v1 row when that model version is requested -- distinct margin/edge from the blend row', async () => {
    mockClient({ apiTables: { game_predictions: ok(createGamePredictionRowEloOnly()) } })

    const result = await getGamePrediction(401752873, 'elo_v1')

    expect(result!.model_version).toBe('elo_v1')
    expect(result!.expected_home_margin).toBe(3.2)
    expect(result!.edge).toBe(0.7)
    // home_win_prob is Elo-only in both model rows -- same value as the blend row.
    expect(result!.home_win_prob).toBe(0.62)
  })

  it('handles a null-market row: market_*/edge/edge_pick all null, expected margin still present', async () => {
    mockClient({ apiTables: { game_predictions: ok(createGamePredictionRowNoMarket()) } })

    const result = await getGamePrediction(401752900)

    expect(result!.market_provider).toBeNull()
    expect(result!.market_spread).toBeNull()
    expect(result!.edge).toBeNull()
    expect(result!.edge_pick).toBeNull()
    expect(result!.expected_home_margin).toBe(5.2)
  })

  it('returns null when no row is found (no prediction for this game -- not an error)', async () => {
    mockClient({ apiTables: { game_predictions: ok(null) } })

    expect(await getGamePrediction(999999)).toBeNull()
  })

  it('returns null (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { game_predictions: dbError() } })

    expect(await getGamePrediction(401752873)).toBeNull()
  })
})

describe('getLineMovement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes through the provider/captured_at-ordered snapshot series', async () => {
    mockClient({ apiTables: { line_movement: ok(createLineMovementRows()) } })

    const result = await getLineMovement(401752873)

    expect(result).toHaveLength(3)
    expect(result.map(p => p.spread)).toEqual([-1.5, -2.5, -3])
    expect(result.every(p => p.provider === 'DraftKings')).toBe(true)
    expect(result[0].captured_at).toBe('2025-11-24T08:00:00+00:00')
    expect(result[2].captured_at).toBe('2025-11-28T08:00:00+00:00')
  })

  it('returns [] on empty data (completed/historical games have no snapshots -- not an error)', async () => {
    mockClient({ apiTables: { line_movement: ok([]) } })

    expect(await getLineMovement(401752873)).toEqual([])
  })

  it('returns [] (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { line_movement: dbError() } })

    expect(await getLineMovement(401752873)).toEqual([])
  })
})

describe('getTeamEloHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps home-side rows to the team perspective directly', async () => {
    mockClient({ apiTables: { game_elo_history: ok(createTeamEloHistoryRows()) } })

    const result = await getTeamEloHistory('Ohio State', 2025)

    // Row 3 (week 16) has null postgame Elo and is dropped -> 2 points remain.
    expect(result).toHaveLength(2)

    const [game1, game2] = result
    expect(game1).toMatchObject({
      game_id: 401752860, week: 12, opponent: 'Purdue', is_home: true,
      pregame_elo: 1875.0, postgame_elo: 1892.4, team_win_prob: 0.88,
    })
    expect(game2).toMatchObject({
      game_id: 401752873, week: 14, opponent: 'Michigan', is_home: false,
    })
  })

  it('maps away-side rows to the away team\'s perspective, inverting win prob', async () => {
    mockClient({ apiTables: { game_elo_history: ok(createTeamEloHistoryRows()) } })

    const result = await getTeamEloHistory('Ohio State', 2025)
    const awayGame = result.find(p => p.game_id === 401752873)!

    // Row: home_team=Michigan, away_team=Ohio State, home_win_prob=0.38
    // -> Ohio State (away) gets away_pregame/postgame_elo and 1 - home_win_prob.
    expect(awayGame.pregame_elo).toBe(1892.4)
    expect(awayGame.postgame_elo).toBe(1912.9)
    expect(awayGame.team_win_prob).toBeCloseTo(0.62)
  })

  it('drops rows where the team\'s pregame or postgame Elo is null', async () => {
    mockClient({ apiTables: { game_elo_history: ok(createTeamEloHistoryRows()) } })

    const result = await getTeamEloHistory('Ohio State', 2025)

    expect(result.some(p => p.game_id === 401752901)).toBe(false)
  })

  it('returns [] on empty data (no games this season -- not an error)', async () => {
    mockClient({ apiTables: { game_elo_history: ok([]) } })

    expect(await getTeamEloHistory('Ohio State', 2025)).toEqual([])
  })

  it('returns [] (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { game_elo_history: dbError() } })

    expect(await getTeamEloHistory('Ohio State', 2025)).toEqual([])
  })
})

// ===== Lot B: team/model-scoped (append below; do not edit above this line) =====
