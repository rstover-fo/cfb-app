import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildUserContext, USER_CONTEXT_MAX_CHARS, PICKS_CONTEXT_MAX_CHARS } from '../user-context.js'
import { setFavoriteTeam, setMemoryEnabled } from '../profiles.js'
import { applyExtraction } from '../memory-store.js'
import { recordPick, settlePick } from '../pick-store.js'
import { resetStorageForTests } from '../storage/index.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cfb-bot-context-'))
  resetStorageForTests({
    profilesPath: path.join(tmpDir, 'profiles.json'),
    memoryPath: path.join(tmpDir, 'memory.json'),
    picksPath: path.join(tmpDir, 'picks.json'),
  })
})

afterEach(async () => {
  resetStorageForTests()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('buildUserContext', () => {
  it('returns undefined when nothing is known', async () => {
    await expect(buildUserContext('u1')).resolves.toBeUndefined()
  })

  it('returns the favorite-team sentence alone (byte-compatible with the old inline build)', async () => {
    await setFavoriteTeam('u1', 'Oklahoma')
    await expect(buildUserContext('u1')).resolves.toBe("this user's favorite team is Oklahoma")
  })

  it('returns atoms alone when there is no favorite team', async () => {
    await applyExtraction('u1', [{ content: 'Hates Texas', kind: 'preference' }])
    await expect(buildUserContext('u1')).resolves.toBe('known about this user: Hates Texas')
  })

  it('combines team and atoms', async () => {
    await setFavoriteTeam('u1', 'Oklahoma')
    await applyExtraction('u1', [{ content: 'Hates Texas', kind: 'preference' }])
    await expect(buildUserContext('u1')).resolves.toBe(
      "this user's favorite team is Oklahoma. known about this user: Hates Texas"
    )
  })

  it('excludes atoms when memory is off, and says so (keeps the team)', async () => {
    await setFavoriteTeam('u1', 'Oklahoma')
    await applyExtraction('u1', [{ content: 'Hates Texas', kind: 'preference' }])
    await setMemoryEnabled('u1', false)

    const context = await buildUserContext('u1')
    expect(context).toContain("this user's favorite team is Oklahoma")
    // The persona's "it will stick" promise branches on this marker -- a
    // memory-off user must never get a false persistence promise.
    expect(context).toContain('turned long-term memory OFF')
    expect(context).not.toContain('Hates Texas')
  })

  it('surfaces the memory-off marker even when nothing else is known', async () => {
    await setMemoryEnabled('u1', false)
    await expect(buildUserContext('u1')).resolves.toContain('turned long-term memory OFF')
  })

  it('includes the pick record and open picks', async () => {
    const { stored } = await recordPick('u1', {
      userId: 'u1', kind: 'game_winner', team: 'Oklahoma', opponent: 'Texas', gameId: 1,
      season: 2026, week: 6, direction: 'win', pickHome: false, statement: 'we win',
    })
    await settlePick(stored!.id, 'won', 'OU 34-24')
    await recordPick('u1', {
      userId: 'u1', kind: 'season_total', team: 'Oklahoma', season: 2026,
      direction: 'over', line: 9.5, statement: 'OU wins 10',
    })

    const context = await buildUserContext('u1')
    expect(context).toContain('pick record: 1-0, streak W1, last: W')
    expect(context).toContain('open picks: Oklahoma over 9.5 wins (2026)')
  })

  it('injects the picks block even when memory is OFF (public ledger data)', async () => {
    await setMemoryEnabled('u1', false)
    await applyExtraction('u1', [{ content: 'Hates Texas', kind: 'preference' }])
    await recordPick('u1', {
      userId: 'u1', kind: 'season_total', team: 'Oklahoma', season: 2026,
      direction: 'over', line: 9.5, statement: 'OU wins 10',
    })

    const context = await buildUserContext('u1')
    expect(context).toContain('open picks: Oklahoma over 9.5 wins')
    expect(context).not.toContain('Hates Texas')
  })

  it('caps the picks block at its budget slice', async () => {
    for (let i = 0; i < 10; i++) {
      await recordPick('u1', {
        userId: 'u1', kind: 'season_total', team: 'Oklahoma', season: 2000 + i,
        direction: 'over', line: 9.5, statement: `pick ${i}`,
      })
    }
    const context = await buildUserContext('u1')
    expect(context).toBeDefined()
    expect(context!.length).toBeLessThanOrEqual(PICKS_CONTEXT_MAX_CHARS)
  })

  it('stays within the character budget, preferring newer atoms', async () => {
    const filler = 'x'.repeat(110)
    for (let i = 0; i < 10; i++) {
      await applyExtraction('u1', [{ content: `${i}-${filler}`, kind: 'fact' }])
      await new Promise(resolve => setTimeout(resolve, 2))
    }
    const context = await buildUserContext('u1')
    expect(context).toBeDefined()
    expect(context!.length).toBeLessThanOrEqual(USER_CONTEXT_MAX_CHARS + 'known about this user: '.length)
    expect(context).toContain('9-') // newest kept
    expect(context).not.toContain('0-') // oldest dropped
  })
})
