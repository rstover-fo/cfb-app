import { describe, it, expect, vi, beforeEach } from 'vitest'

const { queryGamesToolMock } = vi.hoisted(() => ({ queryGamesToolMock: vi.fn() }))
vi.mock('@/lib/mcp/tools', () => ({ queryGamesTool: queryGamesToolMock }))

import { normalizeTeam, resolvePickCandidates } from '../pick-resolve'
import { CURRENT_SEASON } from '@/lib/queries/constants'

function gamesEnvelope(rows: unknown[]) {
  return JSON.stringify({ _source: 'api.game_detail', count: rows.length, rows })
}

const OU_TEXAS = {
  game_id: 401,
  season: CURRENT_SEASON,
  week: 6,
  start_date: `${CURRENT_SEASON}-10-10T17:00:00Z`,
  completed: false,
  home_team: 'Texas',
  away_team: 'Oklahoma',
  home_spread: -3.5,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('normalizeTeam', () => {
  it.each([
    ['Oklahoma', 'Oklahoma'], // exact
    ['oklahoma', 'Oklahoma'], // exact, case-insensitive
    ['OU', 'Oklahoma'], // alias
    ['sooners', 'Oklahoma'], // alias
    ['bama', 'Alabama'], // alias
    ['Ohio St', 'Ohio State'], // unique prefix
    ['osu', null], // deliberately ambiguous alias
    ['tigers', null], // deliberately ambiguous alias
    ['Okla', null], // ambiguous prefix (Oklahoma / Oklahoma State)
    ['Springfield Tech', null], // no match
    ['', null],
  ])('normalizeTeam(%j) -> %j', (input, expected) => {
    expect(normalizeTeam(input)).toBe(expected)
  })
})

describe('resolvePickCandidates: game picks', () => {
  it('resolves a winner pick to the scheduled game against the named opponent', async () => {
    queryGamesToolMock.mockResolvedValue(gamesEnvelope([OU_TEXAS]))

    const resolved = await resolvePickCandidates('u1', [
      { type: 'game_winner', team: 'OU', opponent: 'texas', quote: 'we beat Texas' },
    ])

    expect(queryGamesToolMock).toHaveBeenCalledWith({ season: CURRENT_SEASON, team: 'Oklahoma', limit: 100 })
    expect(resolved).toHaveLength(1)
    expect(resolved[0]).toMatchObject({
      userId: 'u1',
      kind: 'game_winner',
      team: 'Oklahoma',
      opponent: 'Texas',
      gameId: 401,
      week: 6,
      pickHome: false,
      direction: 'win',
      season: CURRENT_SEASON,
    })
  })

  it('stamps guildId onto the resolved pick', async () => {
    queryGamesToolMock.mockResolvedValue(gamesEnvelope([OU_TEXAS]))
    const resolved = await resolvePickCandidates(
      'u1',
      [{ type: 'game_winner', team: 'OU', opponent: 'texas', quote: 'we beat Texas' }],
      'guild-1'
    )
    expect(resolved[0]).toMatchObject({ guildId: 'guild-1' })
  })

  it('an ATS pick without an opponent takes the next uncompleted game and captures the line', async () => {
    const earlier = {
      ...OU_TEXAS,
      game_id: 400,
      week: 5,
      start_date: `${CURRENT_SEASON}-10-03T17:00:00Z`,
      home_team: 'Oklahoma',
      away_team: 'Kansas',
      home_spread: -21,
    }
    const played = { ...OU_TEXAS, game_id: 399, week: 1, start_date: `${CURRENT_SEASON}-09-01T17:00:00Z`, completed: true }
    queryGamesToolMock.mockResolvedValue(gamesEnvelope([OU_TEXAS, earlier, played]))

    const resolved = await resolvePickCandidates('u1', [{ type: 'ats', team: 'sooners', quote: 'we cover' }])

    expect(resolved[0]).toMatchObject({ kind: 'ats', gameId: 400, line: -21, pickHome: true, direction: 'cover' })
  })

  it('stores a pending (undefined) line when the game has no spread yet', async () => {
    queryGamesToolMock.mockResolvedValue(gamesEnvelope([{ ...OU_TEXAS, home_spread: null }]))
    const resolved = await resolvePickCandidates('u1', [{ type: 'ats', team: 'OU', opponent: 'Texas', quote: 'we cover' }])
    expect(resolved[0]!.line).toBeUndefined()
  })

  it('drops when the schedule has no matching uncompleted game', async () => {
    queryGamesToolMock.mockResolvedValue(gamesEnvelope([{ ...OU_TEXAS, completed: true }]))
    const resolved = await resolvePickCandidates('u1', [{ type: 'game_winner', team: 'OU', opponent: 'Texas', quote: 'x' }])
    expect(resolved).toEqual([])
  })

  it('drops when query_games returns the "no games found" plain-text envelope', async () => {
    queryGamesToolMock.mockResolvedValue('No games found matching the given filters.')
    const resolved = await resolvePickCandidates('u1', [{ type: 'game_winner', team: 'OU', opponent: 'Texas', quote: 'x' }])
    expect(resolved).toEqual([])
  })

  it('drops when query_games returns a friendly "Error: ..." string', async () => {
    queryGamesToolMock.mockResolvedValue('Error: api.game_detail request failed: timeout')
    const resolved = await resolvePickCandidates('u1', [{ type: 'game_winner', team: 'OU', opponent: 'Texas', quote: 'x' }])
    expect(resolved).toEqual([])
  })

  it('drops on unresolvable team or opponent without calling the MCP tool for the team case', async () => {
    const resolved = await resolvePickCandidates('u1', [
      { type: 'game_winner', team: 'osu', opponent: 'Texas', quote: 'x' },
      { type: 'game_winner', team: 'OU', opponent: 'tigers', quote: 'y' },
    ])
    expect(resolved).toEqual([])
    expect(queryGamesToolMock).not.toHaveBeenCalled()
  })

  it('never throws when the MCP tool call itself rejects', async () => {
    queryGamesToolMock.mockRejectedValue(new Error('timeout'))
    await expect(
      resolvePickCandidates('u1', [{ type: 'game_winner', team: 'OU', opponent: 'Texas', quote: 'x' }])
    ).resolves.toEqual([])
  })

  it('seasonRef next bumps the season', async () => {
    const nextSeason = CURRENT_SEASON + 1
    queryGamesToolMock.mockResolvedValue(gamesEnvelope([{ ...OU_TEXAS, season: nextSeason }]))
    await resolvePickCandidates('u1', [{ type: 'game_winner', team: 'OU', opponent: 'Texas', seasonRef: 'next', quote: 'x' }])
    expect(queryGamesToolMock).toHaveBeenCalledWith({ season: nextSeason, team: 'Oklahoma', limit: 100 })
  })
})

describe('resolvePickCandidates: season totals', () => {
  it('normalizes an integer threshold to a half-point line, no MCP call', async () => {
    const resolved = await resolvePickCandidates('u1', [
      { type: 'season_total', team: 'OU', direction: 'over', threshold: 10, quote: 'OU wins 10 this year' },
    ])
    expect(queryGamesToolMock).not.toHaveBeenCalled()
    expect(resolved[0]).toMatchObject({ kind: 'season_total', team: 'Oklahoma', season: CURRENT_SEASON, direction: 'over', line: 9.5 })
  })

  it('under keeps the half-point convention and spoken halves pass through', async () => {
    const resolved = await resolvePickCandidates('u1', [
      { type: 'season_total', team: 'horns', direction: 'under', threshold: 8, quote: 'no way Texas gets to 8' },
      { type: 'season_total', team: 'bama', direction: 'over', threshold: 9.5, quote: 'Bama over 9.5' },
    ])
    expect(resolved[0]).toMatchObject({ team: 'Texas', direction: 'under', line: 7.5 })
    expect(resolved[1]).toMatchObject({ team: 'Alabama', direction: 'over', line: 9.5 })
  })

  it('drops a season total without a threshold', async () => {
    const resolved = await resolvePickCandidates('u1', [{ type: 'season_total', team: 'OU', quote: 'great season coming' }])
    expect(resolved).toEqual([])
  })
})
