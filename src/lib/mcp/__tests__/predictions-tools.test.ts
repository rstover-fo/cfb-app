/**
 * Unit tests for the three predictions-surface MCP tools (get_game_prediction,
 * get_team_elo, get_matchup_edges) in src/lib/mcp/tools.ts, with the query
 * layer (src/lib/queries/predictions.ts) mocked out.
 *
 * Unlike src/lib/queries/mcp.ts (which returns a {rows, error} McpResult with
 * a friendly "Error: ..." string on failure), predictions.ts's query fns
 * collapse "no row found" and "query error" into the same null/[] result --
 * see each fn's own doc comment in predictions.ts. So there is no separate
 * error-string branch to exercise here: the "never-throw" contract is
 * verified by confirming a null/empty query result always resolves to either
 * a friendly string or an empty envelope, never a rejected promise/exception.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/queries/predictions', () => ({
  getGamePrediction: vi.fn(),
  getTeamElo: vi.fn(),
  getTeamEloHistory: vi.fn(),
  getScoredMatchupEdges: vi.fn(),
}))

import { getGamePrediction, getTeamElo, getTeamEloHistory, getScoredMatchupEdges } from '@/lib/queries/predictions'
import { getGamePredictionTool, getTeamEloTool, getMatchupEdgesTool } from '../tools'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getGamePredictionTool', () => {
  it('wraps a found prediction in the api.game_predictions envelope, defaulting model_version', async () => {
    const prediction = {
      game_id: 401520123,
      model_version: 'elo_epa_blend_v1',
      expected_home_margin: 3.2,
      home_win_prob: 0.61,
      market_spread: -2.5,
      market_home_margin: 2.5,
      edge: 0.7,
      edge_pick: 'home',
    }
    vi.mocked(getGamePrediction).mockResolvedValue(prediction as never)

    const parsed = JSON.parse(await getGamePredictionTool({ game_id: 401520123 }))

    expect(parsed).toEqual({ _source: 'api.game_predictions', count: 1, rows: [prediction] })
    expect(getGamePrediction).toHaveBeenCalledWith(401520123, 'elo_epa_blend_v1')
  })

  it('forwards an explicit model_version instead of the default', async () => {
    vi.mocked(getGamePrediction).mockResolvedValue({ game_id: 1, model_version: 'elo_v1' } as never)

    await getGamePredictionTool({ game_id: 1, model_version: 'elo_v1' })

    expect(getGamePrediction).toHaveBeenCalledWith(1, 'elo_v1')
  })

  it('returns a friendly "No prediction found" string when the query layer returns null', async () => {
    vi.mocked(getGamePrediction).mockResolvedValue(null)

    const text = await getGamePredictionTool({ game_id: 999999 })

    expect(text).toMatch(/^No prediction found for game_id=999999 with model_version='elo_epa_blend_v1'/)
  })

  it('never throws: a null result resolves to a string, not a rejection', async () => {
    vi.mocked(getGamePrediction).mockResolvedValue(null)

    await expect(getGamePredictionTool({ game_id: 1 })).resolves.toEqual(expect.any(String))
  })
})

describe('getTeamEloTool', () => {
  it('combines the season-end summary and game history, defaulting season to CURRENT_SEASON', async () => {
    const elo = { team: 'Oklahoma', season: 2025, season_end_elo: 1750, elo_rank: 5, games_played: 12, low_confidence: false, cfbd_elo: 1748 }
    const history = [
      { game_id: 1, week: 1, opponent: 'Temple', pregame_elo: 1700, postgame_elo: 1720 },
      { game_id: 2, week: 2, opponent: 'Houston', pregame_elo: 1720, postgame_elo: 1735 },
    ]
    vi.mocked(getTeamElo).mockResolvedValue(elo as never)
    vi.mocked(getTeamEloHistory).mockResolvedValue(history as never)

    const parsed = JSON.parse(await getTeamEloTool({ team: 'Oklahoma' }))

    expect(parsed.elo).toEqual({ _source: 'api.team_elo', count: 1, rows: [elo] })
    expect(parsed.history).toEqual({ _source: 'api.game_elo_history', count: 2, rows: history })
    expect(getTeamElo).toHaveBeenCalledWith('Oklahoma', 2025)
    expect(getTeamEloHistory).toHaveBeenCalledWith('Oklahoma', 2025)
  })

  it('forwards an explicit season instead of the default', async () => {
    vi.mocked(getTeamElo).mockResolvedValue(null)
    vi.mocked(getTeamEloHistory).mockResolvedValue([])

    await getTeamEloTool({ team: 'Oklahoma', season: 2019 })

    expect(getTeamElo).toHaveBeenCalledWith('Oklahoma', 2019)
    expect(getTeamEloHistory).toHaveBeenCalledWith('Oklahoma', 2019)
  })

  it('still returns the envelope (not the friendly string) when only history has rows', async () => {
    vi.mocked(getTeamElo).mockResolvedValue(null)
    vi.mocked(getTeamEloHistory).mockResolvedValue([{ game_id: 1 }] as never)

    const parsed = JSON.parse(await getTeamEloTool({ team: 'Oklahoma' }))

    expect(parsed.elo).toEqual({ _source: 'api.team_elo', count: 0, rows: [] })
    expect(parsed.history.count).toBe(1)
  })

  it('returns a friendly "No Elo data found" string when both sources are empty/null', async () => {
    vi.mocked(getTeamElo).mockResolvedValue(null)
    vi.mocked(getTeamEloHistory).mockResolvedValue([])

    const text = await getTeamEloTool({ team: 'Nobody State', season: 2025 })

    expect(text).toBe("No Elo data found for 'Nobody State' in 2025. Check the team name (exact, case-sensitive) and season.")
  })

  it('never throws: a null/empty result resolves to a string, not a rejection', async () => {
    vi.mocked(getTeamElo).mockResolvedValue(null)
    vi.mocked(getTeamEloHistory).mockResolvedValue([])

    await expect(getTeamEloTool({ team: 'Nobody State' })).resolves.toEqual(expect.any(String))
  })
})

describe('getMatchupEdgesTool', () => {
  it('wraps rows under api.scored_matchup_edges and forwards season/week/model_version', async () => {
    vi.mocked(getScoredMatchupEdges).mockResolvedValue([{ game_id: 1, abs_edge: 5 }] as never)

    const parsed = JSON.parse(await getMatchupEdgesTool({ season: 2025, week: 6, model_version: 'elo_v1' }))

    expect(parsed).toEqual({ _source: 'api.scored_matchup_edges', count: 1, rows: [{ game_id: 1, abs_edge: 5 }] })
    expect(getScoredMatchupEdges).toHaveBeenCalledWith(2025, 6, 'elo_v1')
  })

  it('defaults season to CURRENT_SEASON, week to undefined, and model_version to the default blend', async () => {
    vi.mocked(getScoredMatchupEdges).mockResolvedValue([])

    await getMatchupEdgesTool({})

    expect(getScoredMatchupEdges).toHaveBeenCalledWith(2025, undefined, 'elo_epa_blend_v1')
  })

  it('slices to `limit` client-side after the query, taking the top of the sorted list', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ game_id: i, abs_edge: 5 - i }))
    vi.mocked(getScoredMatchupEdges).mockResolvedValue(rows as never)

    const parsed = JSON.parse(await getMatchupEdgesTool({ limit: 2 }))

    expect(parsed.count).toBe(2)
    expect(parsed.rows).toEqual([rows[0], rows[1]])
  })

  it('clamps limit to the 100-row max even if a caller passes more', async () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({ game_id: i }))
    vi.mocked(getScoredMatchupEdges).mockResolvedValue(rows as never)

    const parsed = JSON.parse(await getMatchupEdgesTool({ limit: 500 }))

    expect(parsed.count).toBe(100)
  })

  it('returns an empty envelope (not an error string) for an off-season empty result', async () => {
    vi.mocked(getScoredMatchupEdges).mockResolvedValue([])

    const parsed = JSON.parse(await getMatchupEdgesTool({ season: 2035 }))

    expect(parsed).toEqual({ _source: 'api.scored_matchup_edges', count: 0, rows: [] })
  })

  it('never throws: an empty result resolves to valid JSON, not a rejection', async () => {
    vi.mocked(getScoredMatchupEdges).mockResolvedValue([])

    await expect(getMatchupEdgesTool({})).resolves.toEqual(expect.any(String))
  })
})
