import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { callCfbToolMock } = vi.hoisted(() => ({ callCfbToolMock: vi.fn() }))
vi.mock('../mcp-client.js', () => ({ callCfbTool: callCfbToolMock }))

vi.mock('../config.js', () => ({
  loadConfig: vi.fn(() => ({})),
  getDefaultSeason: vi.fn(() => 2026),
}))

import { normalizeTeam, resolveAndRecordPicks } from '../pick-resolve.js'
import { listOpenPicks } from '../pick-store.js'
import { resetStorageForTests } from '../storage/index.js'

let tmpDir: string

beforeEach(async () => {
  vi.clearAllMocks()
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cfb-bot-resolve-'))
  resetStorageForTests({ picksPath: path.join(tmpDir, 'picks.json') })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  vi.restoreAllMocks()
  resetStorageForTests()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function scheduleRows(rows: unknown[]) {
  return { kind: 'rows' as const, source: 'api.game_detail', count: rows.length, rows }
}

const OU_TEXAS = {
  game_id: 401,
  season: 2026,
  week: 6,
  start_date: '2026-10-10T17:00:00Z',
  completed: false,
  home_team: 'Texas',
  away_team: 'Oklahoma',
  home_spread: -3.5,
}

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

describe('game picks', () => {
  it('resolves a winner pick to the scheduled game against the named opponent', async () => {
    callCfbToolMock.mockResolvedValue(scheduleRows([OU_TEXAS]))

    const stored = await resolveAndRecordPicks('u1', [
      { type: 'game_winner', team: 'OU', opponent: 'texas', quote: 'we beat Texas' },
    ])

    expect(callCfbToolMock).toHaveBeenCalledWith('query_games', { season: 2026, team: 'Oklahoma', limit: 100 })
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      kind: 'game_winner', team: 'Oklahoma', opponent: 'Texas', gameId: 401, week: 6,
      pickHome: false, direction: 'win', season: 2026,
    })
  })

  it('an ATS pick without an opponent takes the next uncompleted game and captures the line', async () => {
    const earlier = { ...OU_TEXAS, game_id: 400, week: 5, start_date: '2026-10-03T17:00:00Z', home_team: 'Oklahoma', away_team: 'Kansas', home_spread: -21 }
    const played = { ...OU_TEXAS, game_id: 399, week: 1, start_date: '2026-09-01T17:00:00Z', completed: true }
    callCfbToolMock.mockResolvedValue(scheduleRows([OU_TEXAS, earlier, played]))

    const stored = await resolveAndRecordPicks('u1', [{ type: 'ats', team: 'sooners', quote: 'we cover' }])

    expect(stored[0]).toMatchObject({ kind: 'ats', gameId: 400, line: -21, pickHome: true, direction: 'cover' })
  })

  it('stores a pending line when the game has no spread yet', async () => {
    callCfbToolMock.mockResolvedValue(scheduleRows([{ ...OU_TEXAS, home_spread: null }]))
    const stored = await resolveAndRecordPicks('u1', [{ type: 'ats', team: 'OU', opponent: 'Texas', quote: 'we cover' }])
    expect(stored[0]!.line).toBeUndefined()
  })

  it('drops when the schedule has no matching uncompleted game', async () => {
    callCfbToolMock.mockResolvedValue(scheduleRows([{ ...OU_TEXAS, completed: true }]))
    const stored = await resolveAndRecordPicks('u1', [{ type: 'game_winner', team: 'OU', opponent: 'Texas', quote: 'x' }])
    expect(stored).toEqual([])
    expect(await listOpenPicks('u1')).toEqual([])
  })

  it('drops when query_games returns a message envelope (no schedule)', async () => {
    callCfbToolMock.mockResolvedValue({ kind: 'message', text: 'No games found matching the given filters.' })
    const stored = await resolveAndRecordPicks('u1', [{ type: 'game_winner', team: 'OU', opponent: 'Texas', quote: 'x' }])
    expect(stored).toEqual([])
  })

  it('drops on unresolvable team or opponent without calling MCP for the team case', async () => {
    const stored = await resolveAndRecordPicks('u1', [
      { type: 'game_winner', team: 'osu', opponent: 'Texas', quote: 'x' },
      { type: 'game_winner', team: 'OU', opponent: 'tigers', quote: 'y' },
    ])
    expect(stored).toEqual([])
  })

  it('never throws when the MCP call itself rejects', async () => {
    callCfbToolMock.mockRejectedValue(new Error('timeout'))
    await expect(
      resolveAndRecordPicks('u1', [{ type: 'game_winner', team: 'OU', opponent: 'Texas', quote: 'x' }])
    ).resolves.toEqual([])
  })

  it('seasonRef next bumps the season', async () => {
    callCfbToolMock.mockResolvedValue(scheduleRows([{ ...OU_TEXAS, season: 2027 }]))
    await resolveAndRecordPicks('u1', [{ type: 'game_winner', team: 'OU', opponent: 'Texas', seasonRef: 'next', quote: 'x' }])
    expect(callCfbToolMock).toHaveBeenCalledWith('query_games', { season: 2027, team: 'Oklahoma', limit: 100 })
  })
})

describe('season totals', () => {
  it('normalizes an integer threshold to a half-point line, no MCP call', async () => {
    const stored = await resolveAndRecordPicks('u1', [
      { type: 'season_total', team: 'OU', direction: 'over', threshold: 10, quote: 'OU wins 10 this year' },
    ])
    expect(callCfbToolMock).not.toHaveBeenCalled()
    expect(stored[0]).toMatchObject({ kind: 'season_total', team: 'Oklahoma', season: 2026, direction: 'over', line: 9.5 })
  })

  it('under keeps the half-point convention and spoken halves pass through', async () => {
    const stored = await resolveAndRecordPicks('u1', [
      { type: 'season_total', team: 'horns', direction: 'under', threshold: 8, quote: 'no way Texas gets to 8' },
      { type: 'season_total', team: 'bama', direction: 'over', threshold: 9.5, quote: 'Bama over 9.5' },
    ])
    expect(stored[0]).toMatchObject({ team: 'Texas', direction: 'under', line: 7.5 })
    expect(stored[1]).toMatchObject({ team: 'Alabama', direction: 'over', line: 9.5 })
  })

  it('drops a season total without a threshold', async () => {
    const stored = await resolveAndRecordPicks('u1', [{ type: 'season_total', team: 'OU', quote: 'great season coming' }])
    expect(stored).toEqual([])
  })
})
