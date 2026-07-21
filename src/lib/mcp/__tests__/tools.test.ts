/**
 * Unit tests for the 8 MCP tool implementations (src/lib/mcp/tools.ts), with
 * the query layer (src/lib/queries/mcp.ts, src/lib/queries/compare.ts,
 * src/lib/queries/matchups.ts) mocked out. Verifies the JSON envelope
 * ({_source, count, rows}), the "No ... found" friendly strings, and that a
 * query-layer error string is passed straight through (never thrown),
 * mirroring cfb_mcp/server.py's contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/queries/mcp', () => ({
  DEFAULT_ROW_CAP: 100,
  queryTeamDetail: vi.fn(),
  queryGameDetail: vi.fn(),
  queryPollRankings: vi.fn(),
  queryLeaderboardTeams: vi.fn(),
  queryTeamWepaSeason: vi.fn(),
  callSituationalSplitRpc: vi.fn(),
  callPlayerSearch: vi.fn(),
  callPlayerDetail: vi.fn(),
  callDataFreshness: vi.fn(),
  SPLIT_RPC_NAMES: {
    home_away: 'get_home_away_splits',
    conference: 'get_conference_splits',
    red_zone: 'get_red_zone_splits',
    down_distance: 'get_down_distance_splits',
    field_position: 'get_field_position_splits',
  },
}))

vi.mock('@/lib/queries/compare', () => ({
  getTeamHistory: vi.fn(),
}))

vi.mock('@/lib/queries/matchups', () => ({
  getMatchup: vi.fn(),
  getMatchupGames: vi.fn(),
}))

import {
  queryTeamDetail,
  queryGameDetail,
  queryPollRankings,
  queryLeaderboardTeams,
  queryTeamWepaSeason,
  callSituationalSplitRpc,
  callPlayerSearch,
  callPlayerDetail,
  callDataFreshness,
} from '@/lib/queries/mcp'
import { getTeamHistory } from '@/lib/queries/compare'
import { getMatchup, getMatchupGames } from '@/lib/queries/matchups'
import {
  queryTeamTool,
  queryGamesTool,
  queryMatchupTool,
  getRankingsTool,
  getLeaderboardTool,
  situationalSplitsTool,
  searchPlayersTool,
  getDataFreshnessTool,
} from '../tools'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('queryTeamTool', () => {
  it('combines team_detail and team_history, re-sorted to season descending', async () => {
    vi.mocked(queryTeamDetail).mockResolvedValue({ rows: [{ school: 'Oklahoma' }] as never, error: null })
    // getTeamHistory returns ascending order (its UI convention); the tool must reverse it.
    vi.mocked(getTeamHistory).mockResolvedValue([
      { team: 'Oklahoma', season: 2022 },
      { team: 'Oklahoma', season: 2023 },
      { team: 'Oklahoma', season: 2024 },
    ] as never)

    const text = await queryTeamTool({ team: 'Oklahoma' })
    const parsed = JSON.parse(text)

    expect(parsed.team_detail).toEqual({ _source: 'api.team_detail', count: 1, rows: [{ school: 'Oklahoma' }] })
    expect(parsed.team_history._source).toBe('api.team_history')
    expect(parsed.team_history.rows.map((r: { season: number }) => r.season)).toEqual([2024, 2023, 2022])
  })

  it('returns a friendly "No team found" string when both sources are empty', async () => {
    vi.mocked(queryTeamDetail).mockResolvedValue({ rows: [], error: null })
    vi.mocked(getTeamHistory).mockResolvedValue([])

    const text = await queryTeamTool({ team: 'Nobody State' })
    expect(text).toMatch(/^No team found matching 'Nobody State'/)
  })

  it('passes through a query-layer error string unchanged', async () => {
    vi.mocked(queryTeamDetail).mockResolvedValue({ rows: [], error: 'Error: api.team_detail request failed: boom' })
    vi.mocked(getTeamHistory).mockResolvedValue([])

    expect(await queryTeamTool({ team: 'Oklahoma' })).toBe('Error: api.team_detail request failed: boom')
  })
})

describe('queryGamesTool', () => {
  it('wraps rows with _source/count on success', async () => {
    vi.mocked(queryGameDetail).mockResolvedValue({ rows: [{ game_id: 1 }, { game_id: 2 }] as never, error: null })

    const parsed = JSON.parse(await queryGamesTool({ season: 2024 }))
    expect(parsed).toEqual({ _source: 'api.game_detail', count: 2, rows: [{ game_id: 1 }, { game_id: 2 }] })
  })

  it('returns "No games found" for an empty result', async () => {
    vi.mocked(queryGameDetail).mockResolvedValue({ rows: [], error: null })
    expect(await queryGamesTool({ season: 1899 })).toBe('No games found matching the given filters.')
  })

  it('passes through a query-layer error unchanged', async () => {
    vi.mocked(queryGameDetail).mockResolvedValue({ rows: [], error: 'Error: boom' })
    expect(await queryGamesTool({})).toBe('Error: boom')
  })
})

describe('queryMatchupTool', () => {
  it('combines the matchup summary and full game log', async () => {
    vi.mocked(getMatchup).mockResolvedValue({ teamA: 'Oklahoma', teamB: 'Texas', totalGames: 3 } as never)
    vi.mocked(getMatchupGames).mockResolvedValue([{ gameId: 1 }, { gameId: 2 }] as never)

    const parsed = JSON.parse(await queryMatchupTool({ team_a: 'Oklahoma', team_b: 'Texas' }))
    expect(parsed.matchup).toEqual({
      _source: 'api.matchup',
      count: 1,
      rows: [{ teamA: 'Oklahoma', teamB: 'Texas', totalGames: 3 }],
    })
    expect(parsed.games).toEqual({ _source: 'api.game_detail', count: 2, rows: [{ gameId: 1 }, { gameId: 2 }] })
  })

  it('returns a friendly "No matchup history found" string when the pair never met', async () => {
    vi.mocked(getMatchup).mockResolvedValue(null)

    const text = await queryMatchupTool({ team_a: 'Oklahoma', team_b: 'Rutgers' })
    expect(text).toMatch(/^No matchup history found between 'Oklahoma' and 'Rutgers'/)
    expect(getMatchupGames).not.toHaveBeenCalled()
  })
})

describe('getRankingsTool', () => {
  it('defaults season_type to regular and forwards it to the query layer', async () => {
    vi.mocked(queryPollRankings).mockResolvedValue({ rows: [{ rank: 1, school: 'Oklahoma' }] as never, error: null })

    await getRankingsTool({ season: 2024 })
    expect(queryPollRankings).toHaveBeenCalledWith(
      expect.objectContaining({ season: 2024, seasonType: 'regular' })
    )
  })

  it('honors an explicit season_type', async () => {
    vi.mocked(queryPollRankings).mockResolvedValue({ rows: [{ rank: 1 }] as never, error: null })
    await getRankingsTool({ season: 2023, season_type: 'postseason' })
    expect(queryPollRankings).toHaveBeenCalledWith(expect.objectContaining({ seasonType: 'postseason' }))
  })

  it('returns a friendly "No rankings found" string mentioning season and season_type', async () => {
    vi.mocked(queryPollRankings).mockResolvedValue({ rows: [], error: null })
    const text = await getRankingsTool({ season: 2024, season_type: 'postseason' })
    expect(text).toBe('No rankings found for season=2024, season_type=postseason with the given filters.')
  })
})

describe('getLeaderboardTool', () => {
  it('routes wepa to queryTeamWepaSeason with source api.team_wepa_season', async () => {
    vi.mocked(queryTeamWepaSeason).mockResolvedValue({ rows: [{ team: 'Oklahoma' }] as never, error: null })

    const parsed = JSON.parse(await getLeaderboardTool({ season: 2024, metric: 'wepa' }))
    expect(parsed._source).toBe('api.team_wepa_season')
    expect(queryLeaderboardTeams).not.toHaveBeenCalled()
  })

  it('routes non-wepa metrics to queryLeaderboardTeams with source api.leaderboard_teams', async () => {
    vi.mocked(queryLeaderboardTeams).mockResolvedValue({ rows: [{ team: 'Oklahoma' }] as never, error: null })

    const parsed = JSON.parse(await getLeaderboardTool({ season: 2024, metric: 'epa' }))
    expect(parsed._source).toBe('api.leaderboard_teams')
    expect(queryTeamWepaSeason).not.toHaveBeenCalled()
    expect(queryLeaderboardTeams).toHaveBeenCalledWith(2024, 'epa', undefined)
  })

  it('returns "No leaderboard data found" for an empty season', async () => {
    vi.mocked(queryLeaderboardTeams).mockResolvedValue({ rows: [], error: null })
    expect(await getLeaderboardTool({ season: 1899, metric: 'wins' })).toBe(
      'No leaderboard data found for season=1899.'
    )
  })
})

describe('situationalSplitsTool', () => {
  it('wraps rows under the public.<rpc_name> source', async () => {
    vi.mocked(callSituationalSplitRpc).mockResolvedValue({ rows: [{ side: 'offense' }] as never, error: null })

    const parsed = JSON.parse(
      await situationalSplitsTool({ team: 'Oklahoma', season: 2023, split_type: 'red_zone' })
    )
    expect(parsed._source).toBe('public.get_red_zone_splits')
  })

  it('returns a friendly "No <split_type> splits found" string', async () => {
    vi.mocked(callSituationalSplitRpc).mockResolvedValue({ rows: [], error: null })
    const text = await situationalSplitsTool({ team: 'Rice', season: 2010, split_type: 'down_distance' })
    expect(text).toMatch(/^No down_distance splits found for 'Rice' in 2010/)
  })
})

describe('searchPlayersTool', () => {
  it('fetches detail for the top hit and returns both search and top_hit_detail', async () => {
    vi.mocked(callPlayerSearch).mockResolvedValue({
      rows: [{ player_id: 'p1', name: 'Caleb Williams' }] as never,
      error: null,
    })
    vi.mocked(callPlayerDetail).mockResolvedValue({ rows: [{ player_id: 'p1', pass_yds: 4000 }] as never, error: null })

    const parsed = JSON.parse(await searchPlayersTool({ query: 'Caleb Williams' }))
    expect(parsed.search).toEqual({
      _source: 'public.get_player_search',
      count: 1,
      rows: [{ player_id: 'p1', name: 'Caleb Williams' }],
    })
    expect(parsed.top_hit_detail).toEqual({
      _source: 'public.get_player_detail',
      count: 1,
      rows: [{ player_id: 'p1', pass_yds: 4000 }],
    })
    expect(callPlayerDetail).toHaveBeenCalledWith('p1', undefined)
  })

  it('returns "No players found" without calling player detail', async () => {
    vi.mocked(callPlayerSearch).mockResolvedValue({ rows: [], error: null })
    expect(await searchPlayersTool({ query: 'Nobody Real' })).toBe("No players found matching 'Nobody Real'.")
    expect(callPlayerDetail).not.toHaveBeenCalled()
  })

  it('keeps search results and surfaces top_hit_detail_error when detail lookup fails', async () => {
    vi.mocked(callPlayerSearch).mockResolvedValue({ rows: [{ player_id: 'p1', name: 'X' }] as never, error: null })
    vi.mocked(callPlayerDetail).mockResolvedValue({ rows: [], error: 'Error: public.get_player_detail request failed: boom' })

    const parsed = JSON.parse(await searchPlayersTool({ query: 'X' }))
    expect(parsed.search.count).toBe(1)
    expect(parsed.top_hit_detail_error).toBe('Error: public.get_player_detail request failed: boom')
    expect(parsed.top_hit_detail).toBeUndefined()
  })
})

describe('getDataFreshnessTool', () => {
  it('wraps rows under public.get_data_freshness', async () => {
    vi.mocked(callDataFreshness).mockResolvedValue({ rows: [{ table_name: 'games', is_stale: false }] as never, error: null })

    const parsed = JSON.parse(await getDataFreshnessTool())
    expect(parsed).toEqual({
      _source: 'public.get_data_freshness',
      count: 1,
      rows: [{ table_name: 'games', is_stale: false }],
    })
  })

  it('passes through a query-layer error unchanged', async () => {
    vi.mocked(callDataFreshness).mockResolvedValue({ rows: [], error: 'Error: boom' })
    expect(await getDataFreshnessTool()).toBe('Error: boom')
  })
})
