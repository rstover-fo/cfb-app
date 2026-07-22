import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

import { handleMention } from '../mention.js'
import { ClaudeUnavailableError } from '../claude.js'
import { clearMemoryForTests, appendTurns } from '../memory.js'

const BOT_ID = '999888777'

interface FakeMessageOptions {
  content?: string
  bot?: boolean
  mentionsBot?: boolean
  reference?: unknown
  referencedMessage?: { author: { username: string }; content: string }
  authorId?: string
  channelId?: string
}

function fakeMessage(options: FakeMessageOptions = {}) {
  return {
    content: options.content ?? '',
    author: { bot: options.bot ?? false, username: 'fan', id: options.authorId ?? 'fan-id' },
    channelId: options.channelId ?? 'test-channel',
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
})

afterEach(() => {
  vi.useRealTimers()
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
    expect(message.reply).toHaveBeenCalledWith('Georgia is good.')
  })

  it('replies with multiple chunks for a long answer', async () => {
    const longText = `${'a'.repeat(1000)}\n\n${'b'.repeat(1500)}`
    askClaudeMock.mockResolvedValue(askResult(longText))
    const message = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> long one` })

    await handleMention(message)

    expect(message.reply).toHaveBeenNthCalledWith(1, 'a'.repeat(1000))
    expect(message.reply).toHaveBeenNthCalledWith(2, 'b'.repeat(1500))
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
    expect(message.reply).toHaveBeenCalledWith('finally')
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
    expect(message.reply).toHaveBeenCalledWith('answer')
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
  })

  it('replies with a generic apology on an unexpected error, and never throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    askClaudeMock.mockRejectedValue(new Error('boom'))
    const message = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> anything` })

    await expect(handleMention(message)).resolves.toBeUndefined()

    expect(message.reply).toHaveBeenCalledTimes(1)
    expect(message.reply.mock.calls[0]?.[0]).toContain('Something went wrong')
    errorSpy.mockRestore()
  })

  it('never throws even when the error reply itself fails', async () => {
    askClaudeMock.mockRejectedValue(new ClaudeUnavailableError())
    const message = fakeMessage({ mentionsBot: true, content: `<@${BOT_ID}> anything` })
    message.reply.mockRejectedValue(new Error('Missing Permissions'))

    await expect(handleMention(message)).resolves.toBeUndefined()
  })
})
