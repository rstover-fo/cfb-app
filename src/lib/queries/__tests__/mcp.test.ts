/**
 * Unit tests for the MCP-specific query layer (src/lib/queries/mcp.ts).
 * These functions back the 8 MCP tools in src/lib/mcp/tools.ts and must
 * mirror cfb_mcp/server.py's shapes: raw view/RPC rows, friendly
 * "Error: ..." strings on failure (never a throw), and a 100-row cap.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createSupabaseMock, dbError, ok, type SupabaseMockConfig } from './helpers'
import {
  DEFAULT_ROW_CAP,
  queryTeamDetail,
  queryGameDetail,
  queryPollRankings,
  queryLeaderboardTeams,
  queryTeamWepaSeason,
  callSituationalSplitRpc,
  callPlayerSearch,
  callPlayerDetail,
  callDataFreshness,
  SPLIT_RPC_NAMES,
} from '../mcp'

function mockClient(config: SupabaseMockConfig) {
  const mock = createSupabaseMock(config)
  vi.mocked(createClient).mockResolvedValue(mock as unknown as Awaited<ReturnType<typeof createClient>>)
  return mock
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('queryTeamDetail', () => {
  it('returns rows on success', async () => {
    mockClient({ apiTables: { team_detail: ok([{ school: 'Oklahoma', wins: 10 }]) } })
    const result = await queryTeamDetail('Oklahoma')
    expect(result.error).toBeNull()
    expect(result.rows).toEqual([{ school: 'Oklahoma', wins: 10 }])
  })

  it('returns [] with no error when the team has no row', async () => {
    mockClient({ apiTables: { team_detail: ok([]) } })
    const result = await queryTeamDetail('Nobody State')
    expect(result).toEqual({ rows: [], error: null })
  })

  it('returns a friendly "Error: ..." string (never throws) on PostgREST error', async () => {
    mockClient({ apiTables: { team_detail: dbError('connection refused') } })
    const result = await queryTeamDetail('Oklahoma')
    expect(result.rows).toEqual([])
    expect(result.error).toMatch(/^Error: api\.team_detail request failed: connection refused$/)
  })
})

describe('queryGameDetail', () => {
  it('returns rows on success', async () => {
    mockClient({ apiTables: { game_detail: ok([{ game_id: 1, season: 2024 }]) } })
    const result = await queryGameDetail({ season: 2024 })
    expect(result.error).toBeNull()
    expect(result.rows).toHaveLength(1)
  })

  it('returns "No games found" via the caller when rows is empty (query layer just returns [])', async () => {
    mockClient({ apiTables: { game_detail: ok([]) } })
    const result = await queryGameDetail({ season: 1899 })
    expect(result).toEqual({ rows: [], error: null })
  })

  it('propagates a friendly error string on failure', async () => {
    mockClient({ apiTables: { game_detail: dbError('timeout') } })
    const result = await queryGameDetail({ season: 2024 })
    expect(result.error).toMatch(/^Error: api\.game_detail request failed: timeout$/)
  })
})

describe('queryPollRankings', () => {
  it('returns rows on success', async () => {
    mockClient({
      apiTables: { poll_rankings: ok([{ season: 2024, season_type: 'regular', week: 8, poll: 'AP Top 25', rank: 1, school: 'Oklahoma' }]) },
    })
    const result = await queryPollRankings({ season: 2024, seasonType: 'regular' })
    expect(result.error).toBeNull()
    expect(result.rows).toHaveLength(1)
  })

  it('propagates a friendly error string on failure', async () => {
    mockClient({ apiTables: { poll_rankings: dbError('bad request') } })
    const result = await queryPollRankings({ season: 2024, seasonType: 'postseason' })
    expect(result.error).toMatch(/^Error: api\.poll_rankings request failed: bad request$/)
  })
})

describe('queryLeaderboardTeams', () => {
  it('returns rows for a non-wepa metric', async () => {
    mockClient({ apiTables: { leaderboard_teams: ok([{ team: 'Oklahoma', epa_rank: 1 }]) } })
    const result = await queryLeaderboardTeams(2024, 'epa')
    expect(result.error).toBeNull()
    expect(result.rows).toEqual([{ team: 'Oklahoma', epa_rank: 1 }])
  })

  it('propagates a friendly error string on failure', async () => {
    mockClient({ apiTables: { leaderboard_teams: dbError('nope') } })
    const result = await queryLeaderboardTeams(2024, 'wins')
    expect(result.error).toMatch(/^Error: api\.leaderboard_teams request failed: nope$/)
  })
})

describe('queryTeamWepaSeason', () => {
  it('returns rows on success (used for the wepa leaderboard metric)', async () => {
    mockClient({ apiTables: { team_wepa_season: ok([{ team: 'Oklahoma', epa_rank: 1 }]) } })
    const result = await queryTeamWepaSeason(2024)
    expect(result.error).toBeNull()
    expect(result.rows).toEqual([{ team: 'Oklahoma', epa_rank: 1 }])
  })

  it('propagates a friendly error string on failure', async () => {
    mockClient({ apiTables: { team_wepa_season: dbError('nope') } })
    const result = await queryTeamWepaSeason(2024)
    expect(result.error).toMatch(/^Error: api\.team_wepa_season request failed: nope$/)
  })
})

describe('callSituationalSplitRpc', () => {
  it('calls the correct RPC name per split_type and forwards p_team/p_season', async () => {
    const mock = mockClient({ rpc: { get_red_zone_splits: ok([{ side: 'offense', trips: 12 }]) } })
    const result = await callSituationalSplitRpc('red_zone', 'Oklahoma', 2023)

    expect(result.error).toBeNull()
    expect(result.rows).toEqual([{ side: 'offense', trips: 12 }])
    expect(mock.rpc).toHaveBeenCalledWith('get_red_zone_splits', { p_team: 'Oklahoma', p_season: 2023 })
  })

  it('maps every split_type to its documented RPC name', () => {
    expect(SPLIT_RPC_NAMES).toEqual({
      home_away: 'get_home_away_splits',
      conference: 'get_conference_splits',
      red_zone: 'get_red_zone_splits',
      down_distance: 'get_down_distance_splits',
      field_position: 'get_field_position_splits',
    })
  })

  it('propagates a friendly error string, naming the RPC, on failure', async () => {
    mockClient({ rpc: { get_home_away_splits: dbError('boom') } })
    const result = await callSituationalSplitRpc('home_away', 'Oklahoma', 2023)
    expect(result.error).toMatch(/^Error: public\.get_home_away_splits request failed: boom$/)
  })
})

describe('callPlayerSearch', () => {
  it('sends p_query/p_limit always, and p_team/p_season only when provided', async () => {
    const mock = mockClient({ rpc: { get_player_search: ok([{ player_id: '1', name: 'Caleb Williams' }]) } })
    await callPlayerSearch({ query: 'Caleb Williams' })

    expect(mock.rpc).toHaveBeenCalledWith('get_player_search', { p_query: 'Caleb Williams', p_limit: 25 })
  })

  it('includes p_team and p_season when given, and clamps p_limit to the 100-row cap', async () => {
    const mock = mockClient({ rpc: { get_player_search: ok([]) } })
    await callPlayerSearch({ query: 'Bijan', team: 'Texas', season: 2021, limit: 500 })

    expect(mock.rpc).toHaveBeenCalledWith('get_player_search', {
      p_query: 'Bijan',
      p_team: 'Texas',
      p_season: 2021,
      p_limit: DEFAULT_ROW_CAP,
    })
  })

  it('propagates a friendly error string on failure', async () => {
    mockClient({ rpc: { get_player_search: dbError('boom') } })
    const result = await callPlayerSearch({ query: 'x' })
    expect(result.error).toMatch(/^Error: public\.get_player_search request failed: boom$/)
  })
})

describe('callPlayerDetail', () => {
  it('omits p_season when not provided (RPC defaults to most recent season)', async () => {
    const mock = mockClient({ rpc: { get_player_detail: ok([{ player_id: '1' }]) } })
    await callPlayerDetail('1')
    expect(mock.rpc).toHaveBeenCalledWith('get_player_detail', { p_player_id: '1' })
  })

  it('includes p_season when provided', async () => {
    const mock = mockClient({ rpc: { get_player_detail: ok([{ player_id: '1' }]) } })
    await callPlayerDetail('1', 2022)
    expect(mock.rpc).toHaveBeenCalledWith('get_player_detail', { p_player_id: '1', p_season: 2022 })
  })

  it('propagates a friendly error string on failure', async () => {
    mockClient({ rpc: { get_player_detail: dbError('boom') } })
    const result = await callPlayerDetail('1')
    expect(result.error).toMatch(/^Error: public\.get_player_detail request failed: boom$/)
  })
})

describe('callDataFreshness', () => {
  it('returns rows with no arguments', async () => {
    const mock = mockClient({ rpc: { get_data_freshness: ok([{ table_name: 'games', is_stale: false }]) } })
    const result = await callDataFreshness()
    expect(result.error).toBeNull()
    expect(result.rows).toEqual([{ table_name: 'games', is_stale: false }])
    expect(mock.rpc).toHaveBeenCalledWith('get_data_freshness')
  })

  it('propagates a friendly error string on failure', async () => {
    mockClient({ rpc: { get_data_freshness: dbError('boom') } })
    const result = await callDataFreshness()
    expect(result.error).toMatch(/^Error: public\.get_data_freshness request failed: boom$/)
  })
})
