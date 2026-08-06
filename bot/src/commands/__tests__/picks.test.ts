import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MessageFlags } from 'discord.js'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { picksCommand } from '../picks.js'
import { recordPick, settlePick, listOpenPicks } from '../../pick-store.js'
import { resetStorageForTests } from '../../storage/index.js'
import type { NewPick } from '../../storage/backend.js'
import { fakeChatInputInteraction, firstEmbedJson } from './helpers.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cfb-bot-pickscmd-'))
  resetStorageForTests({ picksPath: path.join(tmpDir, 'picks.json') })
})

afterEach(async () => {
  vi.restoreAllMocks()
  resetStorageForTests()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function newPick(userId: string, overrides: Partial<NewPick> = {}): NewPick {
  return {
    userId,
    kind: 'season_total',
    team: 'Oklahoma',
    season: 2026,
    direction: 'over',
    line: 9.5,
    statement: 'OU wins 10 this year',
    ...overrides,
  }
}

async function seedSettled(userId: string, results: ('won' | 'lost' | 'push')[]): Promise<void> {
  for (let i = 0; i < results.length; i++) {
    const { stored } = await recordPick(userId, newPick(userId, { gameId: 1000 + i, kind: 'game_winner', direction: 'win', opponent: 'Texas', statement: `pick ${i}` }))
    await settlePick(stored!.id, results[i]!, 'detail')
  }
}

describe('/picks me', () => {
  it('shows the record, numbered open picks, and results publicly', async () => {
    await seedSettled('test-user', ['won', 'won', 'lost'])
    await recordPick('test-user', newPick('test-user'))
    const interaction = fakeChatInputInteraction({ subcommand: 'me' })
    interaction.user = { id: 'test-user', username: 'tester' }

    await picksCommand.execute(interaction)

    const embed = firstEmbedJson(interaction.reply)
    expect(embed.title).toContain("tester's picks — 2-1")
    expect(embed.description).toContain('**1.** Oklahoma over 9.5 wins (2026)')
    expect(embed.description).toContain('✅')
    // Public: no ephemeral flag on the reply payload.
    const payload = interaction.reply.mock.calls[0]![0] as { flags?: number }
    expect(payload.flags).toBeUndefined()
  })

  it('handles the empty ledger', async () => {
    const interaction = fakeChatInputInteraction({ subcommand: 'me' })
    interaction.user = { id: 'test-user', username: 'tester' }
    await picksCommand.execute(interaction)
    expect(firstEmbedJson(interaction.reply).description).toContain('No picks yet')
  })
})

describe('/picks user', () => {
  it("shows another user's ledger", async () => {
    await recordPick('other-user', newPick('other-user'))
    const interaction = fakeChatInputInteraction({ subcommand: 'user', users: { who: { id: 'other-user', username: 'grimlock' } } })
    interaction.user = { id: 'test-user', username: 'tester' }

    await picksCommand.execute(interaction)

    const embed = firstEmbedJson(interaction.reply)
    expect(embed.title).toContain("grimlock's picks")
    expect(embed.description).toContain('Oklahoma over 9.5 wins')
  })
})

describe('/picks board', () => {
  it('lists only users with enough settled picks, best win% first', async () => {
    await seedSettled('hot-user', ['won', 'won', 'won'])
    await seedSettled('cold-user', ['lost', 'lost', 'won'])
    await seedSettled('new-user', ['won']) // below the min, excluded
    const interaction = fakeChatInputInteraction({ subcommand: 'board' })
    interaction.user = { id: 'test-user', username: 'tester' }

    await picksCommand.execute(interaction)

    const description = firstEmbedJson(interaction.reply).description as string
    expect(description).toContain('**1.** <@hot-user> — 3-0')
    expect(description).toContain('**2.** <@cold-user> — 1-2')
    expect(description).not.toContain('new-user')
  })

  it('handles an empty board', async () => {
    const interaction = fakeChatInputInteraction({ subcommand: 'board' })
    await picksCommand.execute(interaction)
    expect(firstEmbedJson(interaction.reply).description).toContain('Nobody qualifies yet')
  })
})

describe('/picks void', () => {
  it('voids your own open pick by number, ephemerally, echoing the statement', async () => {
    await recordPick('test-user', newPick('test-user'))
    const interaction = fakeChatInputInteraction({ subcommand: 'void', integers: { number: 1 } })
    interaction.user = { id: 'test-user', username: 'tester' }

    await picksCommand.execute(interaction)

    const payload = interaction.reply.mock.calls[0]![0] as { content: string; flags: number }
    expect(payload.content).toContain('Voided pick #1: "OU wins 10 this year"')
    expect(payload.flags).toBe(MessageFlags.Ephemeral)
    await expect(listOpenPicks('test-user')).resolves.toEqual([])
  })

  it('cannot void another user\'s picks (index is scoped to your own)', async () => {
    await recordPick('other-user', newPick('other-user'))
    const interaction = fakeChatInputInteraction({ subcommand: 'void', integers: { number: 1 } })
    interaction.user = { id: 'test-user', username: 'tester' }

    await picksCommand.execute(interaction)

    expect(firstEmbedJson(interaction.reply).title).toBe('No such pick')
    await expect(listOpenPicks('other-user')).resolves.toHaveLength(1)
  })
})

describe('registration', () => {
  it('is a subcommands-only definition named picks', () => {
    const json = picksCommand.definition.toJSON()
    expect(json.name).toBe('picks')
    expect(json.options?.map(o => o.name).sort()).toEqual(['board', 'me', 'user', 'void'])
  })
})
