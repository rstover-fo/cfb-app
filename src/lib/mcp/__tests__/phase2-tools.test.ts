/**
 * Unit tests for the four phase-2 MCP tools (get_playcalling_profile,
 * get_adjusted_epa, get_live_scoreboard, get_model_accuracy) in
 * src/lib/mcp/tools.ts, with the query layer mocked out.
 *
 * Following predictions-tools.test.ts's precedent: getPlaycallingProfile and
 * getTeamWeekFeatures (src/lib/queries/playcalling.ts) collapse "no row"/
 * "query error" into null/[] (see their own doc comments), so there is no
 * separate error-string branch to exercise for those two tools -- the
 * never-throw contract is verified by confirming a null/empty query result
 * always resolves to a friendly string, never a rejected promise. Live
 * scoreboard and model accuracy mirror get_matchup_edges' precedent instead:
 * an empty result is a normal state, so they always resolve to the envelope
 * (count: 0), never a "No ... found" string.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/queries/playcalling', () => ({
  getPlaycallingProfile: vi.fn(),
  getTeamWeekFeatures: vi.fn(),
}))

vi.mock('@/lib/queries/live', () => ({
  getLiveScoreboard: vi.fn(),
}))

vi.mock('@/lib/queries/predictions', () => ({
  getPredictionAccuracy: vi.fn(),
}))

import { getPlaycallingProfile, getTeamWeekFeatures } from '@/lib/queries/playcalling'
import { getLiveScoreboard } from '@/lib/queries/live'
import { getPredictionAccuracy } from '@/lib/queries/predictions'
import {
  getPlaycallingProfileTool,
  getAdjustedEpaTool,
  getLiveScoreboardTool,
  getModelAccuracyTool,
} from '../tools'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getPlaycallingProfileTool', () => {
  it('wraps a found profile in the api.team_playcalling_profile envelope, defaulting season', async () => {
    const profile = {
      team: 'Oklahoma',
      season: 2025,
      conference: 'SEC',
      games_played: 12,
      overall_run_rate: 0.45,
      third_down_pass_rate_pctl: 82,
    }
    vi.mocked(getPlaycallingProfile).mockResolvedValue(profile as never)

    const parsed = JSON.parse(await getPlaycallingProfileTool({ team: 'Oklahoma' }))

    expect(parsed).toEqual({ _source: 'api.team_playcalling_profile', count: 1, rows: [profile] })
    expect(getPlaycallingProfile).toHaveBeenCalledWith('Oklahoma', 2025)
  })

  it('forwards an explicit season instead of the default', async () => {
    vi.mocked(getPlaycallingProfile).mockResolvedValue(null)

    await getPlaycallingProfileTool({ team: 'Oklahoma', season: 2019 })

    expect(getPlaycallingProfile).toHaveBeenCalledWith('Oklahoma', 2019)
  })

  it('returns a friendly "No playcalling profile found" string when the query layer returns null', async () => {
    vi.mocked(getPlaycallingProfile).mockResolvedValue(null)

    const text = await getPlaycallingProfileTool({ team: 'Nobody State', season: 2025 })

    expect(text).toMatch(/^No playcalling profile found for 'Nobody State' in 2025/)
  })

  it('never throws: a null result resolves to a string, not a rejection', async () => {
    vi.mocked(getPlaycallingProfile).mockResolvedValue(null)

    await expect(getPlaycallingProfileTool({ team: 'Nobody State' })).resolves.toEqual(expect.any(String))
  })
})

describe('getAdjustedEpaTool', () => {
  it('wraps week rows in the api.team_week_features envelope, defaulting season', async () => {
    const weeks = [
      { season: 2025, week: 1, week_index: 1, team: 'Oklahoma', adj_epa_off: 0.12, off_epa_per_play: 0.2 },
      { season: 2025, week: 2, week_index: 2, team: 'Oklahoma', adj_epa_off: 0.15, off_epa_per_play: 0.18 },
    ]
    vi.mocked(getTeamWeekFeatures).mockResolvedValue(weeks as never)

    const parsed = JSON.parse(await getAdjustedEpaTool({ team: 'Oklahoma' }))

    expect(parsed).toEqual({ _source: 'api.team_week_features', count: 2, rows: weeks })
    expect(getTeamWeekFeatures).toHaveBeenCalledWith('Oklahoma', 2025)
  })

  it('forwards an explicit season instead of the default', async () => {
    vi.mocked(getTeamWeekFeatures).mockResolvedValue([])

    await getAdjustedEpaTool({ team: 'Oklahoma', season: 2019 })

    expect(getTeamWeekFeatures).toHaveBeenCalledWith('Oklahoma', 2019)
  })

  it('returns a friendly "No adjusted-EPA data found" string when the query layer returns []', async () => {
    vi.mocked(getTeamWeekFeatures).mockResolvedValue([])

    const text = await getAdjustedEpaTool({ team: 'Nobody State', season: 2025 })

    expect(text).toMatch(/^No adjusted-EPA data found for 'Nobody State' in 2025/)
  })

  it('never throws: an empty result resolves to a string, not a rejection', async () => {
    vi.mocked(getTeamWeekFeatures).mockResolvedValue([])

    await expect(getAdjustedEpaTool({ team: 'Nobody State' })).resolves.toEqual(expect.any(String))
  })
})

describe('getLiveScoreboardTool', () => {
  it('wraps rows under api.live_scoreboard', async () => {
    const games = [
      { game_id: 1, season: 2025, week: 6, status: 'in_progress', home_team: 'Oklahoma', away_team: 'Texas' },
    ]
    vi.mocked(getLiveScoreboard).mockResolvedValue(games as never)

    const parsed = JSON.parse(await getLiveScoreboardTool())

    expect(parsed).toEqual({ _source: 'api.live_scoreboard', count: 1, rows: games })
  })

  it('returns an empty envelope (not an error string) outside a polling window', async () => {
    vi.mocked(getLiveScoreboard).mockResolvedValue([])

    const parsed = JSON.parse(await getLiveScoreboardTool())

    expect(parsed).toEqual({ _source: 'api.live_scoreboard', count: 0, rows: [] })
  })

  it('never throws: an empty result resolves to valid JSON, not a rejection', async () => {
    vi.mocked(getLiveScoreboard).mockResolvedValue([])

    await expect(getLiveScoreboardTool()).resolves.toEqual(expect.any(String))
  })
})

describe('getModelAccuracyTool', () => {
  it('wraps rows under api.prediction_accuracy', async () => {
    const rows = [
      {
        model_version: 'elo_epa_blend_v1',
        season: 2025,
        edge_threshold: 0,
        n_games: 800,
        margin_mae: 10.2,
        margin_rmse: 13.1,
        brier: 0.19,
        cfbd_brier: 0.2,
      },
    ]
    vi.mocked(getPredictionAccuracy).mockResolvedValue(rows as never)

    const parsed = JSON.parse(await getModelAccuracyTool())

    expect(parsed).toEqual({ _source: 'api.prediction_accuracy', count: 1, rows })
  })

  it('returns an empty envelope (not an error string) when the backtest table is empty', async () => {
    vi.mocked(getPredictionAccuracy).mockResolvedValue([])

    const parsed = JSON.parse(await getModelAccuracyTool())

    expect(parsed).toEqual({ _source: 'api.prediction_accuracy', count: 0, rows: [] })
  })

  it('never throws: an empty result resolves to valid JSON, not a rejection', async () => {
    vi.mocked(getPredictionAccuracy).mockResolvedValue([])

    await expect(getModelAccuracyTool()).resolves.toEqual(expect.any(String))
  })
})
