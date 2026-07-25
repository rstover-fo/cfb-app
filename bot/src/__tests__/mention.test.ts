import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MessageFlags } from 'discord.js'

const { askClaudeMock, checkAllowanceMock, recordUsageMock, getFavoriteTeamMock } = vi.hoisted(() => ({
  askClaudeMock: vi.fn(),
  checkAllowanceMock: vi.fn(),
  recordUsageMock: vi.fn(),
  getFavoriteTeamMock: vi.fn(),
}))

vi.mock('../claude.js', () => {
  class ClaudeUnavailableError extends Error {
    constructor(message = "Couldn't reach the stats brain — try again in a minute.") {
      super(message)
      this.name = 'ClaudeUnavailableError'
    }
  }
  return { askClaude: askClaudeMock, ClaudeUnavailableError }
})

vi.mock('../limits.js', async () => {
  const actual = await vi.importActual<typeof import('../limits.js')>('../limits.js')
  return { ...actual, checkAllowance: checkAllowanceMock, recordUsage: recordUsageMock }
})

vi.mock('../profiles.js', () => ({ getFavoriteTeam: getFavoriteTeamMock, setFavoriteTeam: vi.fn() }))

import { loadConfig, resetConfigForTests } from '../config.js'
import { handleMention } from '../mention.js'
import { ClaudeUnavailableError } from '../claude.js'
import { COLOR_INFO } from '../format.js'
import { clearMemoryForTests, appendTurns } from '../memory.js'
import { firstComponentJson } from '../commands/__tests__/helpers.js'

const BOT_ID = '999888777'
const ALLOWED_GUILD_ID = 'allowed-guild'

const VALID_ENV = {
  DISCORD_TOKEN: 'token',
  DISCORD_APP_ID: 'app-id',
  DISCORD_GUILD_ID: ALLOWED_GUILD_ID,
  MCP_URL: 'https://example.com/api/mcp',
  MCP_AUTH_TOKEN: 'secret',
}

interface FakeMessageOptions {
  content?: string
  bot?: boolean
  mentionsBot?: boolean
  reference?: unknown
  referencedMessage?: { author: { username: string }; content: string }
  authorId?: string
  channelId?: string
  guildId?: string | null
}

function fakeMessage(options: FakeMessageOptions = {}) {
  return {
    content: options.content ?? '',
    author: { bot: options.bot ?? false, username: 'fan', id: options.authorId ?? 'fan-id' },
    channelId: options.channelId ?? 'test-channel',
    guildId: options.guildId === undefined ? ALLOWED_GUILD_ID : options.guildId,
    client: { user: { id: BOT_ID } },
    mentions: { users: { has: vi.fn((id: string) => (options.mentionsBot ?? false) && id === BOT_ID) } },
    reference: options.reference ?? null,
    fetchReference: vi.fn().mockResolvedValue(options.referencedMessage),
    channel: { sendTyping: vi.fn().mockResolvedValue(undefined) },
    reply: vi.fn().mockResolvedValue(undefined),
    // Intentionally `any`: hand-rolled structural stand-in for discord.js Message.
  } as any
}

function askResult(text: string, overrides: Partial<ReturnType<typeof rawResult>> = {}) {
  return { ...rawResult(text), ...overrides }
}

function rawResult(text: string) {
  return {
    text,
    tier: 'simple' as const,
    escalated: false,
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    model: 'claude-sonnet-5',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  clearMemoryForTests()
  checkAllowanceMock.mockReturnValue({ ok: true })
  getFavoriteTeamMock.mockResolvedValue(undefined)
  resetConfigForTests()
  loadConfig(VALID_ENV)
})

afterEach(() => {
  vi.useRealTimers()
  resetConfigForTests()
})

describe('handleMention guild allowlist', () => {
  it('answers as before in an allowed guild', async () => {
    askClaudeMock.mockResolvedValue(askResult('Georgia is good.'))
    const message = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> how good is Georgia?`, guildId: ALLOWED_GUILD_ID })

    await handleMention(message)

    expect(askClaudeMock).toHaveBeenCalledTimes(1)
    const json = firstComponentJson(message.reply)
    expect(json).toEqual({
      type: 17, // ContainerBuilder
      accent_color: COLOR_INFO,
      components: [{ type: 10, content: 'Georgia is good.' }], // TextDisplayBuilder
    })
    expect(message.reply.mock.calls[0]?.[0].flags).toBe(MessageFlags.IsComponentsV2)
  })

  it('silently ignores a mention from a disallowed guild', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const message = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> hi`, guildId: 'stranger-guild' })

    await handleMention(message)

    expect(askClaudeMock).not.toHaveBeenCalled()
    expect(checkAllowanceMock).not.toHaveBeenCalled()
    expect(message.channel.sendTyping).not.toHaveBeenCalled()
    expect(message.reply).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('stranger-guild'))
    warnSpy.mockRestore()
  })

  it('silently ignores a DM (guildId null)', async () => {
    const message = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> hi`, guildId: null })

    await handleMention(message)

    expect(askClaudeMock).not.toHaveBeenCalled()
    expect(checkAllowanceMock).not.toHaveBeenCalled()
    expect(message.reply).not.toHaveBeenCalled()
  })
})

describe('handleMention guards', () => {
  it('ignores messages from bots', async () => {
    const message = fakeMessage({ bot: true, mentionsBot: true, content: `<@${BOT_ID}> hi` })

    await handleMention(message)

    expect(askClaudeMock).not.toHaveBeenCalled()
    expect(message.reply).not.toHaveBeenCalled()
    expect(message.channel.sendTyping).not.toHaveBeenCalled()
  })

  it('ignores messages that do not mention the bot', async () => {
    const message = fakeMessage({ mentionsBot: false, content: 'just chatting' })

    await handleMention(message)

    expect(askClaudeMock).not.toHaveBeenCalled()
    expect(message.reply).not.toHaveBeenCalled()
  })

  it('replies with short help when the mention has no question', async () => {
    const message = fakeMessage({ mentionsBot: true, content: `  <@!${BOT_ID}>  ` })

    await handleMention(message)

    expect(askClaudeMock).not.toHaveBeenCalled()
    expect(message.channel.sendTyping).not.toHaveBeenCalled()
    expect(message.reply).toHaveBeenCalledTimes(1)
    expect(message.reply.mock.calls[0]?.[0]).toContain('college-football question')
    // Plain-string help reply -- never CV2 (message.reply was called with a bare
    // string, so there is no flags field to read at all).
    expect(message.reply.mock.calls[0]?.[0]).not.toHaveProperty('flags')
  })
})

describe('handleMention allowance guard', () => {
  it('replies with a refusal message and never calls askClaude when refused', async () => {
    checkAllowanceMock.mockReturnValue({ ok: false, reason: 'user_cap' })
    const message = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> anything` })

    await handleMention(message)

    expect(askClaudeMock).not.toHaveBeenCalled()
    expect(message.channel.sendTyping).not.toHaveBeenCalled()
    expect(message.reply).toHaveBeenCalledTimes(1)
    expect(message.reply.mock.calls[0]?.[0]).toContain("today's question limit")
    expect(message.reply.mock.calls[0]?.[0]).not.toHaveProperty('flags')
  })

  it('checks allowance for the message author', async () => {
    askClaudeMock.mockResolvedValue(askResult('answer'))
    const message = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> hi`, authorId: 'author-7' })

    await handleMention(message)

    expect(checkAllowanceMock).toHaveBeenCalledWith('author-7')
  })
})

describe('handleMention happy path', () => {
  it('strips the mention (both <@id> and <@!id> forms) before asking Claude', async () => {
    askClaudeMock.mockResolvedValue(askResult('Georgia is good.'))
    const message = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> how good is Georgia? <@!${BOT_ID}>` })

    await handleMention(message)

    expect(askClaudeMock).toHaveBeenCalledWith('how good is Georgia?', { history: [], userContext: undefined })
    const json = firstComponentJson(message.reply)
    expect(json.components).toEqual([{ type: 10, content: 'Georgia is good.' }])
  })

  it('replies with multiple chunks for a long answer', async () => {
    // Sized against the 3800-char CHUNK_MAX (src/format.ts): each paragraph
    // fits under the cap on its own but together they exceed it, so
    // splitMessage's paragraph-break preference produces exactly two chunks.
    const longText = `${'a'.repeat(2000)}\n\n${'b'.repeat(3000)}`
    askClaudeMock.mockResolvedValue(askResult(longText))
    const message = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> long one` })

    await handleMention(message)

    expect(message.reply).toHaveBeenCalledTimes(2)
    const first = firstComponentJson(message.reply, 0)
    const second = firstComponentJson(message.reply, 1)
    expect(first.components).toEqual([{ type: 10, content: 'a'.repeat(2000) }])
    expect(second.components).toEqual([{ type: 10, content: 'b'.repeat(3000) }])
    expect(message.reply.mock.calls[0]?.[0].flags).toBe(MessageFlags.IsComponentsV2)
    expect(message.reply.mock.calls[1]?.[0].flags).toBe(MessageFlags.IsComponentsV2)
  })

  it('starts typing immediately, re-fires every 8s, and stops once askClaude settles', async () => {
    vi.useFakeTimers()
    let resolveAsk!: (value: ReturnType<typeof askResult>) => void
    askClaudeMock.mockReturnValueOnce(new Promise(resolve => (resolveAsk = resolve)))
    const message = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> slow question` })

    const pending = handleMention(message)
    expect(message.channel.sendTyping).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(16_000)
    expect(message.channel.sendTyping).toHaveBeenCalledTimes(3)

    resolveAsk(askResult('finally'))
    await pending

    await vi.advanceTimersByTimeAsync(30_000)
    expect(message.channel.sendTyping).toHaveBeenCalledTimes(3) // interval cleared
    expect(firstComponentJson(message.reply).components).toEqual([{ type: 10, content: 'finally' }])
  })

  it('fetches the referenced message once and appends it after channel memory', async () => {
    askClaudeMock.mockResolvedValue(askResult('They are not overrated.'))
    const message = fakeMessage({
      mentionsBot: true,
      content: `<@${BOT_ID}> is that true?`,
      reference: { messageId: '123' },
      referencedMessage: { author: { username: 'joe' }, content: 'Ohio State is overrated' },
    })

    await handleMention(message)

    expect(message.fetchReference).toHaveBeenCalledTimes(1)
    expect(askClaudeMock).toHaveBeenCalledWith('is that true?', {
      history: [{ role: 'user', content: 'joe said: Ohio State is overrated' }],
      userContext: undefined,
    })
  })

  it('still answers when the referenced message cannot be fetched', async () => {
    askClaudeMock.mockResolvedValue(askResult('answer'))
    const message = fakeMessage({
      mentionsBot: true,
      content: `<@${BOT_ID}> is that true?`,
      reference: { messageId: '123' },
    })
    message.fetchReference.mockRejectedValue(new Error('Unknown Message'))

    await handleMention(message)

    expect(askClaudeMock).toHaveBeenCalledWith('is that true?', { history: [], userContext: undefined })
    expect(firstComponentJson(message.reply).components).toEqual([{ type: 10, content: 'answer' }])
  })
})

describe('handleMention memory wiring', () => {
  it('passes prior channel history from memory.ts through to askClaude', async () => {
    appendTurns('test-channel', 'earlier question', 'earlier answer')
    askClaudeMock.mockResolvedValue(askResult('answer'))
    const message = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> follow-up?`, channelId: 'test-channel' })

    await handleMention(message)

    expect(askClaudeMock).toHaveBeenCalledWith('follow-up?', {
      history: [
        { role: 'user', content: 'earlier question' },
        { role: 'assistant', content: 'earlier answer' },
      ],
      userContext: undefined,
    })
  })

  it('combines channel memory with the reply-reference context, memory first', async () => {
    appendTurns('test-channel', 'earlier question', 'earlier answer')
    askClaudeMock.mockResolvedValue(askResult('answer'))
    const message = fakeMessage({
      mentionsBot: true,
      content: `<@${BOT_ID}> is that true?`,
      channelId: 'test-channel',
      reference: { messageId: '123' },
      referencedMessage: { author: { username: 'joe' }, content: 'Ohio State is overrated' },
    })

    await handleMention(message)

    expect(askClaudeMock).toHaveBeenCalledWith('is that true?', {
      history: [
        { role: 'user', content: 'earlier question' },
        { role: 'assistant', content: 'earlier answer' },
        { role: 'user', content: 'joe said: Ohio State is overrated' },
      ],
      userContext: undefined,
    })
  })

  it('stores the question/answer pair in channel memory after a successful answer', async () => {
    askClaudeMock.mockResolvedValue(askResult('Georgia is 8-0.'))
    const message1 = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> how good is Georgia?`, channelId: 'chan-a' })
    await handleMention(message1)

    askClaudeMock.mockResolvedValue(askResult('answer 2'))
    const message2 = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> and their defense?`, channelId: 'chan-a' })
    await handleMention(message2)

    expect(askClaudeMock).toHaveBeenLastCalledWith('and their defense?', {
      history: [
        { role: 'user', content: 'how good is Georgia?' },
        { role: 'assistant', content: 'Georgia is 8-0.' },
      ],
      userContext: undefined,
    })
  })
})

describe('handleMention limits wiring', () => {
  it('records usage with the final model after a successful answer', async () => {
    askClaudeMock.mockResolvedValue(askResult('answer', { model: 'claude-opus-4-8' }))
    const message = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> hi`, authorId: 'author-7' })

    await handleMention(message)

    expect(recordUsageMock).toHaveBeenCalledWith(
      'author-7',
      { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      'claude-opus-4-8'
    )
  })

  it('does not record usage when the allowance check refuses', async () => {
    checkAllowanceMock.mockReturnValue({ ok: false, reason: 'budget' })
    const message = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> hi` })

    await handleMention(message)

    expect(recordUsageMock).not.toHaveBeenCalled()
  })
})

describe('handleMention profile injection', () => {
  it('passes userContext built from the saved favorite team', async () => {
    getFavoriteTeamMock.mockResolvedValue('Oklahoma')
    askClaudeMock.mockResolvedValue(askResult('answer'))
    const message = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> how will we do?`, authorId: 'author-9' })

    await handleMention(message)

    expect(getFavoriteTeamMock).toHaveBeenCalledWith('author-9')
    expect(askClaudeMock).toHaveBeenCalledWith('how will we do?', {
      history: [],
      userContext: "this user's favorite team is Oklahoma",
    })
  })
})

describe('handleMention error paths', () => {
  it('replies with the friendly message when Claude is unavailable, and never throws', async () => {
    askClaudeMock.mockRejectedValue(new ClaudeUnavailableError())
    const message = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> anything` })

    await expect(handleMention(message)).resolves.toBeUndefined()

    expect(message.reply).toHaveBeenCalledTimes(1)
    expect(message.reply.mock.calls[0]?.[0]).toContain("Couldn't reach the stats brain")
    expect(message.reply.mock.calls[0]?.[0]).not.toHaveProperty('flags')
  })

  it('replies with a generic apology on an unexpected error, and never throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    askClaudeMock.mockRejectedValue(new Error('boom'))
    const message = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> anything` })

    await expect(handleMention(message)).resolves.toBeUndefined()

    expect(message.reply).toHaveBeenCalledTimes(1)
    expect(message.reply.mock.calls[0]?.[0]).toContain('Something went wrong')
    expect(message.reply.mock.calls[0]?.[0]).not.toHaveProperty('flags')
    errorSpy.mockRestore()
  })

  it('never throws even when the error reply itself fails', async () => {
    askClaudeMock.mockRejectedValue(new ClaudeUnavailableError())
    const message = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> anything` })
    message.reply.mockRejectedValue(new Error('Missing Permissions'))

    await expect(handleMention(message)).resolves.toBeUndefined()
  })
})
