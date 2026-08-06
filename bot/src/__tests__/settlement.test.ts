import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { callCfbToolMock } = vi.hoisted(() => ({ callCfbToolMock: vi.fn() }))
vi.mock('../mcp-client.js', () => ({ callCfbTool: callCfbToolMock }))

import { runSettlementOnce } from '../settlement.js'
import { listPicks, recordPick } from '../pick-store.js'
import { resetStorageForTests } from '../storage/index.js'
import type { NewPick } from '../storage/backend.js'

let tmpDir: string

beforeEach(async () => {
  vi.clearAllMocks()
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cfb-bot-settle-'))
  resetStorageForTests({ picksPath: path.join(tmpDir, 'picks.json') })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  vi.restoreAllMocks()
  resetStorageForTests()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function rowsResult(rows: unknown[]) {
  return { kind: 'rows' as const, source: 'api.game_detail', count: rows.length, rows }
}

/** A completed game row; override per test. */
function gameRow(overrides: Record<string, unknown> = {}) {
  return {
    game_id: 401,
    completed: true,
    home_team: 'Texas',
    away_team: 'Oklahoma',
    home_points: 17,
    away_points: 13,
    winner: 'Texas',
    home_spread: -3.5,
    ...overrides,
  }
}

async function insertGamePick(overrides: Partial<NewPick> = {}) {
  const { stored } = await recordPick(overrides.userId ?? 'u1', {
    userId: 'u1',
    kind: 'game_winner',
    team: 'Oklahoma',
    opponent: 'Texas',
    gameId: 401,
    season: 2025,
    week: 6,
    direction: 'win',
    pickHome: false,
    statement: 'we beat Texas',
    ...overrides,
  })
  return stored!
}

async function statusOf(id: string) {
  const all = await listPicks('u1')
  return all.find(p => p.id === id)
}

describe('idle case', () => {
  it('makes zero MCP calls when there are no open picks', async () => {
    await runSettlementOnce()
    expect(callCfbToolMock).not.toHaveBeenCalled()
  })
})

describe('game_winner settlement', () => {
  it('settles won/lost from the winner field', async () => {
    const losing = await insertGamePick()
    callCfbToolMock.mockResolvedValue(rowsResult([gameRow()]))

    await runSettlementOnce()

    expect(await statusOf(losing.id)).toMatchObject({ status: 'lost', settledDetail: 'Texas 17–13 Oklahoma' })
  })

  it('leaves the pick open when the game is not completed or winner is unstamped', async () => {
    const pick = await insertGamePick()
    callCfbToolMock.mockResolvedValueOnce(rowsResult([gameRow({ completed: false, winner: null, home_points: null, away_points: null })]))
    await runSettlementOnce()
    expect((await statusOf(pick.id))!.status).toBe('open')

    callCfbToolMock.mockResolvedValueOnce(rowsResult([gameRow({ winner: null })]))
    await runSettlementOnce()
    expect((await statusOf(pick.id))!.status).toBe('open')
  })

  it('a message envelope or a thrown MCP error leaves picks open and the run alive', async () => {
    const pick = await insertGamePick()
    callCfbToolMock.mockResolvedValueOnce({ kind: 'message', text: 'No games found matching the given filters.' })
    await runSettlementOnce()
    expect((await statusOf(pick.id))!.status).toBe('open')

    callCfbToolMock.mockRejectedValueOnce(new Error('timeout'))
    await expect(runSettlementOnce()).resolves.toBeUndefined()
    expect((await statusOf(pick.id))!.status).toBe('open')
  })
})

describe('ATS settlement — sign conventions locked to three verified real 2025 games', () => {
  it('OU -11.5 vs LSU, OU wins by 4: home did NOT cover (adj = 4 + -11.5 < 0)', async () => {
    // Real game: Oklahoma (home, -11.5) 17–13 LSU. spread_result: away_covered.
    const pick = await insertGamePick({ kind: 'ats', direction: 'cover', pickHome: true, team: 'Oklahoma', opponent: 'LSU', line: -11.5 })
    callCfbToolMock.mockResolvedValue(
      rowsResult([gameRow({ home_team: 'Oklahoma', away_team: 'LSU', home_points: 17, away_points: 13, winner: 'Oklahoma', home_spread: -11.5 })])
    )

    await runSettlementOnce()

    const settled = await statusOf(pick.id)
    expect(settled!.status).toBe('lost')
    expect(settled!.settledDetail).toContain('missed by 7.5')
  })

  it('OU -4.5 vs Missouri, OU wins by 11: home covered (adj = 11 + -4.5 > 0)', async () => {
    // Real game: Oklahoma (home, -4.5) beat Missouri by 11. spread_result: home_covered.
    const pick = await insertGamePick({ kind: 'ats', direction: 'cover', pickHome: true, team: 'Oklahoma', opponent: 'Missouri', line: -4.5 })
    callCfbToolMock.mockResolvedValue(
      rowsResult([gameRow({ home_team: 'Oklahoma', away_team: 'Missouri', home_points: 31, away_points: 20, winner: 'Oklahoma', home_spread: -4.5 })])
    )

    await runSettlementOnce()

    const settled = await statusOf(pick.id)
    expect(settled!.status).toBe('won')
    expect(settled!.settledDetail).toContain('covered by 6.5')
  })

  it('Bama -6.5 vs OU, Bama loses by 2: the away underdog covered', async () => {
    // Real game: Alabama (home, -6.5) 21–23 Oklahoma. spread_result: away_covered.
    const pick = await insertGamePick({ kind: 'ats', direction: 'cover', pickHome: false, team: 'Oklahoma', opponent: 'Alabama', line: -6.5 })
    callCfbToolMock.mockResolvedValue(
      rowsResult([gameRow({ home_team: 'Alabama', away_team: 'Oklahoma', home_points: 21, away_points: 23, winner: 'Oklahoma', home_spread: -6.5 })])
    )

    await runSettlementOnce()

    expect((await statusOf(pick.id))!.status).toBe('won')
  })

  it('pushes when the margin lands exactly on the line', async () => {
    const pick = await insertGamePick({ kind: 'ats', direction: 'cover', pickHome: true, team: 'Texas', opponent: 'Oklahoma', line: -4 })
    callCfbToolMock.mockResolvedValue(
      rowsResult([gameRow({ home_points: 24, away_points: 20, winner: 'Texas', home_spread: -4 })])
    )

    await runSettlementOnce()

    expect((await statusOf(pick.id))!.status).toBe('push')
  })

  it('backfills a pending line pregame, then voids if the game finishes with no line ever', async () => {
    const pending = await insertGamePick({ kind: 'ats', direction: 'cover', line: undefined })
    callCfbToolMock.mockResolvedValueOnce(
      rowsResult([gameRow({ completed: false, winner: null, home_points: null, away_points: null, home_spread: -3.5 })])
    )
    await runSettlementOnce()
    expect((await statusOf(pending.id))!.line).toBe(-3.5)
    expect((await statusOf(pending.id))!.status).toBe('open')

    const neverLined = await insertGamePick({ kind: 'ats', direction: 'cover', gameId: 402, line: undefined })
    callCfbToolMock.mockResolvedValueOnce(rowsResult([gameRow({ game_id: 402, home_spread: null }), gameRow()]))
    await runSettlementOnce()
    expect((await statusOf(neverLined.id))).toMatchObject({ status: 'void', settledDetail: 'no market line ever posted' })
  })

  it('memoizes the schedule fetch per (season, team) within a run', async () => {
    await insertGamePick({ gameId: 401 })
    await insertGamePick({ kind: 'ats', direction: 'cover', gameId: 402, line: -3, opponent: 'Kansas' })
    callCfbToolMock.mockResolvedValue(
      rowsResult([gameRow(), gameRow({ game_id: 402, home_team: 'Oklahoma', away_team: 'Kansas', home_points: 42, away_points: 10, winner: 'Oklahoma', home_spread: -3 })])
    )

    await runSettlementOnce()

    expect(callCfbToolMock).toHaveBeenCalledTimes(1)
  })
})

describe('season_total settlement', () => {
  function outlookMessage(row: Record<string, unknown>) {
    return {
      kind: 'message' as const,
      text: JSON.stringify({ season: 2025, rows: [row] }),
    }
  }

  async function insertSeasonPick(direction: 'over' | 'under', line: number) {
    const { stored } = await recordPick('u1', {
      userId: 'u1', kind: 'season_total', team: 'Oklahoma', season: 2025, direction, line,
      statement: 'OU wins 10 this year',
    })
    return stored!
  }

  it('early-settles the over as soon as actual wins clear the line, even mid-season', async () => {
    const pick = await insertSeasonPick('over', 9.5)
    callCfbToolMock.mockResolvedValue(
      outlookMessage({ season: 2025, team: 'Oklahoma', actual_wins: 10, schedule_complete: false, is_projection: true })
    )

    await runSettlementOnce()

    expect(await statusOf(pick.id)).toMatchObject({ status: 'won' })
  })

  it('early-settles the under as LOST when wins clear the line', async () => {
    const pick = await insertSeasonPick('under', 7.5)
    callCfbToolMock.mockResolvedValue(
      outlookMessage({ season: 2025, team: 'Oklahoma', actual_wins: 8, schedule_complete: false, is_projection: true })
    )

    await runSettlementOnce()

    expect(await statusOf(pick.id)).toMatchObject({ status: 'lost' })
  })

  it('does NOT settle the eliminated side early — waits for the final record', async () => {
    const pick = await insertSeasonPick('over', 9.5)
    // 6 wins, season not final: mathematically shaky but games can be added.
    callCfbToolMock.mockResolvedValue(
      outlookMessage({ season: 2025, team: 'Oklahoma', actual_wins: 6, schedule_complete: false, is_projection: true })
    )

    await runSettlementOnce()

    expect((await statusOf(pick.id))!.status).toBe('open')
  })

  it('settles from the final record when is_projection is false', async () => {
    const over = await insertSeasonPick('over', 9.5)
    callCfbToolMock.mockResolvedValue(
      outlookMessage({ season: 2025, team: 'Oklahoma', actual_wins: 8, schedule_complete: true, is_projection: false })
    )

    await runSettlementOnce()

    expect(await statusOf(over.id)).toMatchObject({ status: 'lost' })
    expect((await statusOf(over.id))!.settledDetail).toContain('finished with 8 wins')
  })

  it('unparseable outlook payloads leave the pick open', async () => {
    const pick = await insertSeasonPick('over', 9.5)
    callCfbToolMock.mockResolvedValue({ kind: 'message', text: 'Season outlook is unavailable.' })

    await runSettlementOnce()

    expect((await statusOf(pick.id))!.status).toBe('open')
  })
})
