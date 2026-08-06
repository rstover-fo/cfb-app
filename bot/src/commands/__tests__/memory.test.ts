import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MessageFlags } from 'discord.js'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { memoryCommand } from '../memory.js'
import { setFavoriteTeam, getMemoryEnabled, setMemoryEnabled } from '../../profiles.js'
import { applyExtraction, listAtoms } from '../../memory-store.js'
import { resetStorageForTests, setStorageForTests } from '../../storage/index.js'
import type { StorageBackend } from '../../storage/backend.js'
import { fakeChatInputInteraction, firstEmbedJson } from './helpers.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cfb-bot-memcmd-'))
  resetStorageForTests({
    profilesPath: path.join(tmpDir, 'profiles.json'),
    memoryPath: path.join(tmpDir, 'memory.json'),
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  resetStorageForTests()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function replyContent(interaction: ReturnType<typeof fakeChatInputInteraction>): string {
  return (interaction.reply.mock.calls[0]?.[0] as { content: string }).content
}

function replyFlags(interaction: ReturnType<typeof fakeChatInputInteraction>): number {
  return (interaction.reply.mock.calls[0]?.[0] as { flags: number }).flags
}

describe('/memory show', () => {
  it('shows status, favorite team, and a numbered atom list, ephemerally', async () => {
    await setFavoriteTeam('test-user', 'Oklahoma')
    await applyExtraction('test-user', [{ content: 'Hates Texas', kind: 'preference' }])
    const interaction = fakeChatInputInteraction({ subcommand: 'show' })

    await memoryCommand.execute(interaction)

    const content = replyContent(interaction)
    expect(content).toContain('Memory is **ON**')
    expect(content).toContain('**Oklahoma**')
    expect(content).toContain('1. [preference] Hates Texas')
    expect(replyFlags(interaction)).toBe(MessageFlags.Ephemeral)
  })

  it('handles the empty state', async () => {
    const interaction = fakeChatInputInteraction({ subcommand: 'show' })
    await memoryCommand.execute(interaction)
    const content = replyContent(interaction)
    expect(content).toContain('No long-term memories stored yet')
    expect(content).toContain('not set — use `/myteam`')
  })

  it('says OFF when the user has opted out', async () => {
    await setMemoryEnabled('test-user', false)
    const interaction = fakeChatInputInteraction({ subcommand: 'show' })
    await memoryCommand.execute(interaction)
    expect(replyContent(interaction)).toContain('Memory is **OFF**')
  })
})

describe('/memory forget', () => {
  it('wipes everything without a number', async () => {
    await applyExtraction('test-user', [
      { content: 'a', kind: 'fact' },
      { content: 'b', kind: 'fact' },
    ])
    const interaction = fakeChatInputInteraction({ subcommand: 'forget' })

    await memoryCommand.execute(interaction)

    expect(replyContent(interaction)).toContain('Forgot all 2 memories')
    await expect(listAtoms('test-user')).resolves.toEqual([])
  })

  it('deletes one memory by number and echoes it', async () => {
    await applyExtraction('test-user', [{ content: 'Hates Texas', kind: 'preference' }])
    const interaction = fakeChatInputInteraction({ subcommand: 'forget', integers: { number: 1 } })

    await memoryCommand.execute(interaction)

    expect(replyContent(interaction)).toContain('Forgot memory #1: "Hates Texas"')
    await expect(listAtoms('test-user')).resolves.toEqual([])
  })

  it('replies with an error embed for an out-of-range number', async () => {
    const interaction = fakeChatInputInteraction({ subcommand: 'forget', integers: { number: 7 } })

    await memoryCommand.execute(interaction)

    const embed = firstEmbedJson(interaction.reply)
    expect(embed.title).toBe('No such memory')
    expect(replyFlags(interaction)).toBe(MessageFlags.Ephemeral)
  })

  it('handles wiping when nothing is stored', async () => {
    const interaction = fakeChatInputInteraction({ subcommand: 'forget' })
    await memoryCommand.execute(interaction)
    expect(replyContent(interaction)).toContain('Nothing to forget')
  })
})

describe('/memory on|off', () => {
  it('off persists the toggle and explains that stored atoms remain', async () => {
    const interaction = fakeChatInputInteraction({ subcommand: 'off' })

    await memoryCommand.execute(interaction)

    await expect(getMemoryEnabled('test-user')).resolves.toBe(false)
    expect(replyContent(interaction)).toContain("What's already stored stays")
    expect(replyFlags(interaction)).toBe(MessageFlags.Ephemeral)
  })

  it('on re-enables memory', async () => {
    await setMemoryEnabled('test-user', false)
    const interaction = fakeChatInputInteraction({ subcommand: 'on' })

    await memoryCommand.execute(interaction)

    await expect(getMemoryEnabled('test-user')).resolves.toBe(true)
  })
})

describe('failure handling', () => {
  it('replies with an ephemeral error embed when storage writes fail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing: StorageBackend = {
      name: 'json',
      getProfile: async () => undefined,
      upsertProfile: async () => {
        throw new Error('disk full')
      },
      getSettings: async () => ({ loreEnabled: true }),
      saveSettings: async () => {},
      listAtoms: async () => [],
      insertAtom: async () => {},
      deleteAtoms: async () => 0,
      listPicks: async () => [],
      insertPick: async () => {},
      updatePick: async () => {},
    }
    setStorageForTests(failing)
    const interaction = fakeChatInputInteraction({ subcommand: 'off' })

    await memoryCommand.execute(interaction)

    const embed = firstEmbedJson(interaction.reply)
    expect(embed.title).toBe('Could not do that')
    expect(replyFlags(interaction)).toBe(MessageFlags.Ephemeral)
  })
})

describe('registration', () => {
  it('is a subcommands-only definition named memory', () => {
    const json = memoryCommand.definition.toJSON()
    expect(json.name).toBe('memory')
    expect(json.options?.map(o => o.name).sort()).toEqual(['forget', 'off', 'on', 'show'])
  })
})
