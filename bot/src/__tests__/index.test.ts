/**
 * Covers handleInteraction (the interactionCreate dispatcher: command
 * lookup, the runtime guild allowlist gate, and the last-resort error
 * backstop) and handleMessageCreate (the messageCreate -> handleMention
 * wrapper). Importing src/index.ts is safe in tests -- main() only runs
 * when the module is the CLI entry point (see index.ts's isEntryPoint
 * check), so importing it here never logs in to Discord.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MessageFlags } from 'discord.js'

const { executeMock, errorExecuteMock, autocompleteMock, handleMentionMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  errorExecuteMock: vi.fn(),
  autocompleteMock: vi.fn(),
  handleMentionMock: vi.fn(),
}))

vi.mock('../commands/index.js', () => ({
  commandsByName: new Map([
    ['ping', { definition: { name: 'ping' }, execute: executeMock, autocomplete: autocompleteMock }],
    ['boom', { definition: { name: 'boom' }, execute: errorExecuteMock }],
  ]),
}))

vi.mock('../mention.js', () => ({ handleMention: handleMentionMock }))

import { loadConfig, resetConfigForTests } from '../config.js'
import { handleInteraction, handleMessageCreate } from '../index.js'
import { fakeChatInputInteraction, fakeAutocompleteInteraction, TEST_GUILD_ID } from '../commands/__tests__/helpers.js'

const VALID_ENV = {
  DISCORD_TOKEN: 'token',
  DISCORD_APP_ID: 'app-id',
  DISCORD_GUILD_ID: TEST_GUILD_ID,
  MCP_URL: 'https://example.com/api/mcp',
  MCP_AUTH_TOKEN: 'secret',
}

/** fakeChatInputInteraction() plus the isChatInputCommand()/isAutocomplete()
 * type-guard methods and commandName that handleInteraction dispatches on. */
function chatInputInteraction(commandName: string, guildId?: string | null) {
  return {
    ...fakeChatInputInteraction({ guildId }),
    commandName,
    isChatInputCommand: () => true,
    isAutocomplete: () => false,
  } as any
}

function autocompleteInteraction(commandName: string, guildId?: string | null) {
  return {
    ...fakeAutocompleteInteraction('', guildId),
    commandName,
    isChatInputCommand: () => false,
    isAutocomplete: () => true,
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  resetConfigForTests()
  loadConfig(VALID_ENV)
})

afterEach(() => {
  resetConfigForTests()
})

describe('handleInteraction guild allowlist', () => {
  it('dispatches a chat-input command in an allowed guild', async () => {
    const interaction = chatInputInteraction('ping')

    await handleInteraction(interaction)

    expect(executeMock).toHaveBeenCalledWith(interaction)
    expect(interaction.reply).not.toHaveBeenCalled()
  })

  it('replies ephemerally and never calls execute for a chat-input command in a disallowed guild', async () => {
    const interaction = chatInputInteraction('ping', 'stranger-guild')

    await handleInteraction(interaction)

    expect(executeMock).not.toHaveBeenCalled()
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('home server'), flags: MessageFlags.Ephemeral })
    )
  })

  it('dispatches autocomplete in an allowed guild', async () => {
    const interaction = autocompleteInteraction('ping')

    await handleInteraction(interaction)

    expect(autocompleteMock).toHaveBeenCalledWith(interaction)
    expect(interaction.respond).not.toHaveBeenCalled()
  })

  it('responds with an empty list and never calls autocomplete in a disallowed guild', async () => {
    const interaction = autocompleteInteraction('ping', 'stranger-guild')

    await handleInteraction(interaction)

    expect(autocompleteMock).not.toHaveBeenCalled()
    expect(interaction.respond).toHaveBeenCalledWith([])
  })
})

describe('handleInteraction command dispatch', () => {
  it('ignores an unknown command name', async () => {
    const interaction = chatInputInteraction('nonexistent')

    await expect(handleInteraction(interaction)).resolves.toBeUndefined()

    expect(executeMock).not.toHaveBeenCalled()
    expect(interaction.reply).not.toHaveBeenCalled()
  })

  it('falls back to an ephemeral error embed when a command execute() throws', async () => {
    errorExecuteMock.mockRejectedValue(new Error('boom'))
    const interaction = chatInputInteraction('boom')

    await expect(handleInteraction(interaction)).resolves.toBeUndefined()

    expect(interaction.reply).toHaveBeenCalledTimes(1)
    const payload = interaction.reply.mock.calls[0]?.[0]
    expect(payload.flags).toBe(MessageFlags.Ephemeral)
    expect(payload.embeds[0].toJSON().description).toContain('boom')
  })
})

describe('handleMessageCreate', () => {
  it('delegates to handleMention', async () => {
    const message = { content: 'hi' } as any

    await handleMessageCreate(message)

    expect(handleMentionMock).toHaveBeenCalledWith(message)
  })

  it('never throws even when handleMention rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    handleMentionMock.mockRejectedValue(new Error('boom'))

    await expect(handleMessageCreate({} as any)).resolves.toBeUndefined()

    errorSpy.mockRestore()
  })
})
