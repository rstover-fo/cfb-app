import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resetStorageForTests } from '../storage/index.js'
import {
  listPicks,
  listOpenPicks,
  recordPick,
  settlePick,
  voidPickByIndex,
  summarizeRecord,
  MAX_OPEN_PICKS_PER_USER,
} from '../pick-store.js'
import type { NewPick, Pick } from '../storage/backend.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cfb-bot-pickstore-'))
  resetStorageForTests({ picksPath: path.join(tmpDir, 'picks.json') })
})

afterEach(async () => {
  resetStorageForTests()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function gamePick(overrides: Partial<NewPick> = {}): NewPick {
  return {
    userId: 'u1',
    kind: 'game_winner',
    team: 'Oklahoma',
    opponent: 'Texas',
    gameId: 1,
    season: 2026,
    week: 6,
    direction: 'win',
    pickHome: false,
    statement: 'we beat Texas',
    ...overrides,
  }
}

describe('recordPick', () => {
  it('stores an open pick and returns it', async () => {
    const { stored, superseded } = await recordPick('u1', gamePick())
    expect(superseded).toBe(0)
    expect(stored).toMatchObject({ team: 'Oklahoma', status: 'open' })
  })

  it('supersedes an open pick on the same game with a different take', async () => {
    await recordPick('u1', gamePick())
    const { stored, superseded } = await recordPick('u1', gamePick({ team: 'Texas', opponent: 'Oklahoma', pickHome: true, statement: 'actually Texas wins' }))

    expect(superseded).toBe(1)
    expect(stored).toMatchObject({ team: 'Texas' })
    const all = await listPicks('u1')
    expect(all.find(p => p.team === 'Oklahoma')).toMatchObject({ status: 'void', settledDetail: 'superseded by a newer pick' })
    expect(await listOpenPicks('u1')).toHaveLength(1)
  })

  it('dedupes an identical re-statement (nothing stored)', async () => {
    await recordPick('u1', gamePick())
    const { stored, superseded } = await recordPick('u1', gamePick({ statement: 'we beat Texas, again I say' }))
    expect(stored).toBeNull()
    expect(superseded).toBe(0)
    expect(await listPicks('u1')).toHaveLength(1)
  })

  it('season totals key on team+season (a different team is a separate pick)', async () => {
    await recordPick('u1', { userId: 'u1', kind: 'season_total', team: 'Oklahoma', season: 2026, direction: 'over', line: 9.5, statement: 'OU wins 10' })
    await recordPick('u1', { userId: 'u1', kind: 'season_total', team: 'Texas', season: 2026, direction: 'under', line: 8.5, statement: 'Texas misses 9' })
    expect(await listOpenPicks('u1')).toHaveLength(2)
  })

  it('voids oldest past the open cap', async () => {
    for (let i = 0; i < MAX_OPEN_PICKS_PER_USER + 1; i++) {
      await recordPick('u1', gamePick({ gameId: 100 + i, statement: `pick ${i}` }))
      await new Promise(resolve => setTimeout(resolve, 2))
    }
    const open = await listOpenPicks('u1')
    expect(open).toHaveLength(MAX_OPEN_PICKS_PER_USER)
    expect(open.map(p => p.statement)).not.toContain('pick 0')
  })

  it('keeps users independent', async () => {
    await recordPick('u1', gamePick())
    await recordPick('u2', gamePick({ userId: 'u2' }))
    expect(await listOpenPicks('u1')).toHaveLength(1)
    expect(await listOpenPicks()).toHaveLength(2)
  })
})

describe('voidPickByIndex', () => {
  it('voids by 1-based open-pick index and echoes the statement', async () => {
    await recordPick('u1', gamePick({ gameId: 1, statement: 'first pick' }))
    await new Promise(resolve => setTimeout(resolve, 2))
    await recordPick('u1', gamePick({ gameId: 2, statement: 'second pick' }))

    await expect(voidPickByIndex('u1', 1)).resolves.toEqual({ voided: true, statement: 'first pick' })
    const open = await listOpenPicks('u1')
    expect(open.map(p => p.statement)).toEqual(['second pick'])
  })

  it('reports out-of-range without deleting anything', async () => {
    await recordPick('u1', gamePick())
    await expect(voidPickByIndex('u1', 5)).resolves.toEqual({ voided: false })
    expect(await listOpenPicks('u1')).toHaveLength(1)
  })
})

describe('summarizeRecord', () => {
  function settled(status: Pick['status'], settledAt: string): Pick {
    return {
      id: settledAt, userId: 'u1', kind: 'game_winner', team: 'Oklahoma', season: 2026,
      statement: 'x', status, createdAt: '2026-01-01', settledAt,
    }
  }

  it('counts W-L-P and reads streak/lastResults newest first', () => {
    const summary = summarizeRecord([
      settled('won', '2026-09-01'),
      settled('lost', '2026-09-08'),
      settled('won', '2026-09-15'),
      settled('push', '2026-09-22'),
      settled('won', '2026-09-29'),
    ])
    expect(summary).toMatchObject({ wins: 3, losses: 1, pushes: 1 })
    expect(summary.lastResults).toEqual(['W', 'P', 'W', 'L', 'W'])
    // Newest decisive results: W (09-29), W (09-15) -- push doesn't break it.
    expect(summary.streak).toBe('W2')
  })

  it('ignores open and voided picks and handles the empty case', () => {
    const open: Pick = { id: 'o', userId: 'u1', kind: 'game_winner', team: 'Oklahoma', season: 2026, statement: 'x', status: 'open', createdAt: 'now' }
    const voided: Pick = { ...open, id: 'v', status: 'void' }
    const summary = summarizeRecord([open, voided])
    expect(summary).toEqual({ wins: 0, losses: 0, pushes: 0, streak: undefined, lastResults: [] })
  })
})

describe('settlePick', () => {
  it('stamps status, detail, and settledAt', async () => {
    const { stored } = await recordPick('u1', gamePick())
    await expect(settlePick(stored!.id, 'won', 'OU 34-24 Texas')).resolves.toBe(true)
    const [pick] = await listPicks('u1')
    expect(pick).toMatchObject({ status: 'won', settledDetail: 'OU 34-24 Texas' })
    expect(typeof pick!.settledAt).toBe('string')
  })

  it('is a conditional transition: a stale settlement loses to a user void', async () => {
    const { stored } = await recordPick('u1', gamePick())
    await voidPickByIndex('u1', 1)

    // The settlement pass grabbed this pick while it was open; by the time
    // its result arrives the user has voided it -- the settle must no-op.
    await expect(settlePick(stored!.id, 'won', 'OU 34-24 Texas')).resolves.toBe(false)
    const [pick] = await listPicks('u1')
    expect(pick).toMatchObject({ status: 'void', settledDetail: 'voided by the user' })
  })

  it('serializes concurrent recordPick calls so dedup/supersede invariants hold', async () => {
    // Two overlapping captures of the same bet: without the per-user lock
    // both would read "no matching open pick" and both insert.
    await Promise.all([recordPick('u1', gamePick()), recordPick('u1', gamePick())])
    expect(await listOpenPicks('u1')).toHaveLength(1)

    // Overlapping contradictory captures on the same game: exactly one
    // open pick survives (the later one supersedes).
    await Promise.all([
      recordPick('u1', gamePick({ gameId: 9, team: 'Oklahoma', opponent: 'Texas', pickHome: false })),
      recordPick('u1', gamePick({ gameId: 9, team: 'Texas', opponent: 'Oklahoma', pickHome: true })),
    ])
    const openOnGame9 = (await listOpenPicks('u1')).filter(p => p.gameId === 9)
    expect(openOnGame9).toHaveLength(1)
  })
})
