/**
 * Unit tests for the two penalty-analytics MCP tools (get_penalty_profile,
 * get_penalty_log) in src/lib/mcp/tools.ts, with the query layer mocked out.
 *
 * Unlike the phase-2/3 query modules, penalties.ts keeps mcp.ts's McpResult
 * error-passthrough contract ({rows, error}), so these tools DO have real
 * error-string branches to exercise -- including get_penalty_profile's
 * partial-failure path, which degrades a failed penalty_log fetch to an
 * "..._error" key instead of discarding the good team_penalties summary
 * (search_players' precedent).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/queries/penalties', () => ({
  queryTeamPenaltyGames: vi.fn(),
  queryTeamSeasonPenaltyPlays: vi.fn(),
  queryPenaltyLog: vi.fn(),
}))

import {
  queryTeamPenaltyGames,
  queryTeamSeasonPenaltyPlays,
  queryPenaltyLog,
  type PenaltySide,
} from '@/lib/queries/penalties'
import { getPenaltyProfileTool, getPenaltyLogTool } from '../tools'

const empty = { rows: [], error: null }

const GAME_ROWS = [
  {
    game_id: 1, season: 2024, week: 1, season_type: 'regular', team: 'Oklahoma', opponent: 'Tulane',
    home_away: 'home', penalties: 7, penalty_yards: 60, opponent_penalties: 5, opponent_penalty_yards: 40,
  },
  {
    game_id: 2, season: 2024, week: 2, season_type: 'regular', team: 'Oklahoma', opponent: 'Houston',
    home_away: 'away', penalties: 8, penalty_yards: 73, opponent_penalties: 8, opponent_penalty_yards: 63,
  },
]

function play(overrides: Record<string, unknown>) {
  return {
    game_id: 1, week: 1, season_type: 'regular', period: 1, down: 1, distance: 10,
    penalized_team: 'Oklahoma', benefiting_team: 'Tulane', infraction: 'Holding',
    penalty_yards: 10, declined: false, offsetting: false, no_play: true, ppa: -0.8,
    play_text: 'holding penalty', ...overrides,
  }
}

const COMMITTED_PLAYS = [
  play({ infraction: 'Holding', penalty_yards: 10, ppa: -1.2 }),
  play({ infraction: 'Holding', penalty_yards: 10, declined: true }),
  play({ infraction: 'False Start', penalty_yards: 5 }),
  play({ infraction: null, penalty_yards: 15 }),
  play({ infraction: 'Personal Foul', penalty_yards: 15, offsetting: true }),
]

const DRAWN_PLAYS = [
  play({ penalized_team: 'Tulane', benefiting_team: 'Oklahoma', infraction: 'Holding', penalty_yards: 10 }),
]

function mockProfileQueries({
  games = { rows: GAME_ROWS, error: null as string | null },
  committed = { rows: COMMITTED_PLAYS, error: null as string | null },
  drawn = { rows: DRAWN_PLAYS, error: null as string | null },
} = {}) {
  vi.mocked(queryTeamPenaltyGames).mockResolvedValue(games as never)
  vi.mocked(queryTeamSeasonPenaltyPlays).mockImplementation(
    async (_team: string, _season: number, side: PenaltySide) =>
      (side === 'committed' ? committed : drawn) as never
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getPenaltyProfileTool', () => {
  it('aggregates the season summary from the per-game rows, rounding rates to 1 decimal', async () => {
    mockProfileQueries()

    const parsed = JSON.parse(await getPenaltyProfileTool({ team: 'Oklahoma', season: 2024 }))

    expect(parsed.team).toBe('Oklahoma')
    expect(parsed.season).toBe(2024)
    expect(parsed.summary).toEqual({
      _source: 'api.team_penalties (aggregated)',
      games: 2,
      penalties: 15,
      penalty_yards: 133,
      penalties_per_game: 7.5,
      penalty_yards_per_game: 66.5,
      opponent_penalties: 13,
      opponent_penalty_yards: 103,
      opponent_penalties_per_game: 6.5,
      opponent_penalty_yards_per_game: 51.5,
      // opponent minus own: Oklahoma commits more than its opponents here,
      // so both margins are negative (less disciplined).
      penalty_margin_per_game: -1,
      penalty_yards_margin_per_game: -15,
    })
    expect(parsed.game_log).toEqual({ _source: 'api.team_penalties', count: 2, rows: GAME_ROWS })
    expect(queryTeamPenaltyGames).toHaveBeenCalledWith('Oklahoma', 2024)
    expect(queryTeamSeasonPenaltyPlays).toHaveBeenCalledWith('Oklahoma', 2024, 'committed')
    expect(queryTeamSeasonPenaltyPlays).toHaveBeenCalledWith('Oklahoma', 2024, 'drawn')
  })

  it('groups committed infractions with disjoint accepted/declined/offsetting counts, null label as Unknown', async () => {
    mockProfileQueries()

    const parsed = JSON.parse(await getPenaltyProfileTool({ team: 'Oklahoma', season: 2024 }))

    expect(parsed.infraction_breakdown._source).toBe('api.penalty_log (aggregated: penalized_team = team)')
    // Sorted by total descending, then alphabetically among ties.
    expect(parsed.infraction_breakdown.rows).toEqual([
      { infraction: 'Holding', total: 2, accepted: 1, declined: 1, offsetting: 0, accepted_yards: 10 },
      { infraction: 'False Start', total: 1, accepted: 1, declined: 0, offsetting: 0, accepted_yards: 5 },
      { infraction: 'Personal Foul', total: 1, accepted: 0, declined: 0, offsetting: 1, accepted_yards: 0 },
      { infraction: 'Unknown', total: 1, accepted: 1, declined: 0, offsetting: 0, accepted_yards: 15 },
    ])
    expect(parsed.drawn_breakdown._source).toBe('api.penalty_log (aggregated: benefiting_team = team)')
    expect(parsed.drawn_breakdown.rows).toEqual([
      { infraction: 'Holding', total: 1, accepted: 1, declined: 0, offsetting: 0, accepted_yards: 10 },
    ])
  })

  it('lists most_costly as accepted penalties only, ordered by yardage descending', async () => {
    mockProfileQueries()

    const parsed = JSON.parse(await getPenaltyProfileTool({ team: 'Oklahoma', season: 2024 }))

    // The declined Holding and offsetting Personal Foul are excluded.
    expect(parsed.most_costly.count).toBe(3)
    expect(parsed.most_costly.rows.map((r: { penalty_yards: number }) => r.penalty_yards)).toEqual([15, 10, 5])
  })

  it('defaults season to the current season when omitted', async () => {
    mockProfileQueries()

    const parsed = JSON.parse(await getPenaltyProfileTool({ team: 'Oklahoma' }))

    expect(parsed.season).toBe(2025)
    expect(queryTeamPenaltyGames).toHaveBeenCalledWith('Oklahoma', 2025)
  })

  it('returns a friendly string when the team-season has no penalty data at all', async () => {
    mockProfileQueries({ games: empty, committed: empty, drawn: empty })

    const result = await getPenaltyProfileTool({ team: 'Nobody State', season: 2024 })

    expect(result).toMatch(/^No penalty data found for 'Nobody State' in 2024/)
  })

  it('passes a game-log query error through unchanged', async () => {
    mockProfileQueries({ games: { rows: [], error: 'Error: api.team_penalties request failed: boom' } })

    const result = await getPenaltyProfileTool({ team: 'Oklahoma', season: 2024 })

    expect(result).toBe('Error: api.team_penalties request failed: boom')
  })

  it('degrades a failed penalty_log fetch to an error key without discarding the summary', async () => {
    mockProfileQueries({ committed: { rows: [], error: 'Error: api.penalty_log request failed: boom' } })

    const parsed = JSON.parse(await getPenaltyProfileTool({ team: 'Oklahoma', season: 2024 }))

    expect(parsed.infraction_breakdown_error).toBe('Error: api.penalty_log request failed: boom')
    expect(parsed.infraction_breakdown).toBeUndefined()
    expect(parsed.most_costly).toBeUndefined()
    expect(parsed.summary.penalties).toBe(15)
    expect(parsed.drawn_breakdown.count).toBe(1)
  })

  it('never throws (resolves to a string) even when every query fails', async () => {
    mockProfileQueries({
      games: { rows: [], error: 'Error: api.team_penalties request failed: boom' },
      committed: { rows: [], error: 'Error: api.penalty_log request failed: boom' },
      drawn: { rows: [], error: 'Error: api.penalty_log request failed: boom' },
    })

    await expect(getPenaltyProfileTool({ team: 'Oklahoma', season: 2024 })).resolves.toEqual(expect.any(String))
  })
})

describe('getPenaltyLogTool', () => {
  it('forwards all filters to the query layer (game_id maps to gameId)', async () => {
    vi.mocked(queryPenaltyLog).mockResolvedValue(empty as never)

    await getPenaltyLogTool({ team: 'Oklahoma', season: 2024, week: 5, game_id: 42, infraction: 'Holding', limit: 10 })

    expect(queryPenaltyLog).toHaveBeenCalledWith({
      team: 'Oklahoma',
      season: 2024,
      week: 5,
      gameId: 42,
      infraction: 'Holding',
      limit: 10,
    })
  })

  it('requires at least one selective filter and never hits the query layer without one', async () => {
    const result = await getPenaltyLogTool({ week: 5, limit: 10 })

    expect(result).toMatch(/^Provide at least one of team, game_id, season, or infraction/)
    expect(queryPenaltyLog).not.toHaveBeenCalled()
  })

  it('returns the standard envelope on success', async () => {
    const rows = [{ play_id: 'p1', infraction: 'Targeting', penalized_team: 'Oklahoma' }]
    vi.mocked(queryPenaltyLog).mockResolvedValue({ rows, error: null } as never)

    const parsed = JSON.parse(await getPenaltyLogTool({ season: 2024, infraction: 'Targeting' }))

    expect(parsed).toEqual({ _source: 'api.penalty_log', count: 1, rows })
  })

  it('returns a friendly string when nothing matches', async () => {
    vi.mocked(queryPenaltyLog).mockResolvedValue(empty as never)

    const result = await getPenaltyLogTool({ season: 1899 })

    expect(result).toMatch(/^No penalties found matching the given filters/)
  })

  it('passes a query-layer error string through unchanged (never throws)', async () => {
    vi.mocked(queryPenaltyLog).mockResolvedValue({
      rows: [],
      error: 'Error: api.penalty_log request failed: boom',
    } as never)

    const result = await getPenaltyLogTool({ season: 2024 })

    expect(result).toBe('Error: api.penalty_log request failed: boom')
  })
})
