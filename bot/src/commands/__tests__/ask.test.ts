import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MessageFlags } from 'discord.js'

const { askClaudeMock, checkAllowanceMock, recordUsageMock, getFavoriteTeamMock } = vi.hoisted(() => ({
  askClaudeMock: vi.fn(),
  checkAllowanceMock: vi.fn(),
  recordUsageMock: vi.fn(),
  getFavoriteTeamMock: vi.fn(),
}))

vi.mock('../../claude.js', () => {
  class ClaudeUnavailableError extends Error {
    constructor(message = "Couldn't reach the stats brain — try again in a minute.") {
      super(message)
      this.name = 'ClaudeUnavailableError'
    }
  }
  return { askClaude: askClaudeMock, ClaudeUnavailableError }
})

vi.mock('../../limits.js', async () => {
  const actual = await vi.importActual<typeof import('../../limits.js')>('../../limits.js')
  return { ...actual, checkAllowance: checkAllowanceMock, recordUsage: recordUsageMock }
})

vi.mock('../../profiles.js', () => ({ getFavoriteTeam: getFavoriteTeamMock, setFavoriteTeam: vi.fn() }))

import { askCommand } from '../ask.js'
import { ClaudeUnavailableError } from '../../claude.js'
import { clearMemoryForTests, appendTurns } from '../../memory.js'
import { fakeChatInputInteraction, firstEmbedJson } from './helpers.js'

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

describe('askCommand allowance guard', () => {
  it('replies ephemerally without deferring or calling askClaude when refused', async () => {
    checkAllowanceMock.mockReturnValue({ ok: false, reason: 'cooldown', retryAfterSec: 7 })
    const interaction = fakeChatInputInteraction({ strings: { question: 'anything' } })

    await askCommand.execute(interaction)

    expect(askClaudeMock).not.toHaveBeenCalled()
    expect(interaction.deferReply).not.toHaveBeenCalled()
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral }))
    expect(interaction.reply.mock.calls[0]?.[0].content).toContain('7s')
  })

  it('checks allowance for the interacting user', async () => {
    askClaudeMock.mockResolvedValue(askResult('answer'))
    const interaction = fakeChatInputInteraction({ strings: { question: 'q' } })
    interaction.user = { id: 'user-42' }

    await askCommand.execute(interaction)

    expect(checkAllowanceMock).toHaveBeenCalledWith('user-42')
  })
})

describe('askCommand', () => {
  it('defers the reply before calling askClaude (3s interaction deadline)', async () => {
    askClaudeMock.mockResolvedValue(askResult('answer'))
    const interaction = fakeChatInputInteraction({ strings: { question: 'who is #1?' } })

    await askCommand.execute(interaction)

    expect(interaction.deferReply).toHaveBeenCalledTimes(1)
    expect(askClaudeMock).toHaveBeenCalledTimes(1)
    const deferOrder = interaction.deferReply.mock.invocationCallOrder[0]
    const askOrder = askClaudeMock.mock.invocationCallOrder[0]
    expect(deferOrder).toBeLessThan(askOrder!)
  })

  it('passes the question and empty history/no userContext through to askClaude by default', async () => {
    askClaudeMock.mockResolvedValue(askResult('answer'))
    const interaction = fakeChatInputInteraction({ strings: { question: 'how good is Georgia?' } })

    await askCommand.execute(interaction)

    expect(askClaudeMock).toHaveBeenCalledWith('how good is Georgia?', { history: [], userContext: undefined })
  })

  it('editReplies a short answer as a single chunk with no followUps', async () => {
    askClaudeMock.mockResolvedValue(askResult('Ohio State is #1.'))
    const interaction = fakeChatInputInteraction({ strings: { question: 'who is #1?' } })

    await askCommand.execute(interaction)

    expect(interaction.editReply).toHaveBeenCalledWith('Ohio State is #1.')
    expect(interaction.followUp).not.toHaveBeenCalled()
  })

  it('sends the first chunk via editReply and the rest via followUp for a long answer', async () => {
    const longText = `${'a'.repeat(1000)}\n\n${'b'.repeat(1500)}`
    askClaudeMock.mockResolvedValue(askResult(longText))
    const interaction = fakeChatInputInteraction({ strings: { question: 'long one' } })

    await askCommand.execute(interaction)

    expect(interaction.editReply).toHaveBeenCalledWith('a'.repeat(1000))
    expect(interaction.followUp).toHaveBeenCalledTimes(1)
    expect(interaction.followUp).toHaveBeenCalledWith('b'.repeat(1500))
  })

  it('editReplies an error embed when Claude is unavailable, and never throws', async () => {
    askClaudeMock.mockRejectedValue(new ClaudeUnavailableError())
    const interaction = fakeChatInputInteraction({ strings: { question: 'anything' } })

    await expect(askCommand.execute(interaction)).resolves.toBeUndefined()

    const json = firstEmbedJson(interaction.editReply)
    expect(json.title).toBe('Stats brain unavailable')
    expect(json.description).toContain("Couldn't reach the stats brain")
  })

  it('editReplies a generic error embed on an unexpected error, and never throws', async () => {
    askClaudeMock.mockRejectedValue(new Error('boom'))
    const interaction = fakeChatInputInteraction({ strings: { question: 'anything' } })

    await expect(askCommand.execute(interaction)).resolves.toBeUndefined()

    const json = firstEmbedJson(interaction.editReply)
    expect(json.title).toBe('Something went wrong')
    expect(json.description).toContain('boom')
  })

  it('editReplies a "No answer" embed when the model returns empty text', async () => {
    askClaudeMock.mockResolvedValue(askResult('   '))
    const interaction = fakeChatInputInteraction({ strings: { question: 'anything' } })

    await askCommand.execute(interaction)

    const json = firstEmbedJson(interaction.editReply)
    expect(json.title).toBe('No answer')
    expect(interaction.followUp).not.toHaveBeenCalled()
  })
})

describe('askCommand limits wiring', () => {
  it('records usage with the final model after a successful answer', async () => {
    askClaudeMock.mockResolvedValue(askResult('answer', { model: 'claude-opus-4-8' }))
    const interaction = fakeChatInputInteraction({ strings: { question: 'q' } })
    interaction.user = { id: 'user-1' }

    await askCommand.execute(interaction)

    expect(recordUsageMock).toHaveBeenCalledWith(
      'user-1',
      { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      'claude-opus-4-8'
    )
  })

  it('does not record usage when the allowance check refuses', async () => {
    checkAllowanceMock.mockReturnValue({ ok: false, reason: 'budget' })
    const interaction = fakeChatInputInteraction({ strings: { question: 'q' } })

    await askCommand.execute(interaction)

    expect(recordUsageMock).not.toHaveBeenCalled()
  })
})

describe('askCommand memory wiring', () => {
  it('passes prior channel history from memory.ts through to askClaude', async () => {
    appendTurns('test-channel', 'earlier question', 'earlier answer')
    askClaudeMock.mockResolvedValue(askResult('answer'))
    const interaction = fakeChatInputInteraction({ strings: { question: 'follow-up?' } })

    await askCommand.execute(interaction)

    expect(askClaudeMock).toHaveBeenCalledWith('follow-up?', {
      history: [
        { role: 'user', content: 'earlier question' },
        { role: 'assistant', content: 'earlier answer' },
      ],
      userContext: undefined,
    })
  })

  it('stores the question/answer pair in channel memory after a successful answer', async () => {
    askClaudeMock.mockResolvedValue(askResult('Georgia is 8-0.'))
    const interaction = fakeChatInputInteraction({ strings: { question: 'how good is Georgia?' } })

    await askCommand.execute(interaction)

    askClaudeMock.mockResolvedValue(askResult('answer 2'))
    const interaction2 = fakeChatInputInteraction({ strings: { question: 'and their defense?' } })
    await askCommand.execute(interaction2)

    expect(askClaudeMock).toHaveBeenLastCalledWith('and their defense?', {
      history: [
        { role: 'user', content: 'how good is Georgia?' },
        { role: 'assistant', content: 'Georgia is 8-0.' },
      ],
      userContext: undefined,
    })
  })
})

describe('askCommand profile injection', () => {
  it('passes userContext built from the saved favorite team', async () => {
    getFavoriteTeamMock.mockResolvedValue('Oklahoma')
    askClaudeMock.mockResolvedValue(askResult('answer'))
    const interaction = fakeChatInputInteraction({ strings: { question: 'how will we do?' } })
    interaction.user = { id: 'user-1' }

    await askCommand.execute(interaction)

    expect(getFavoriteTeamMock).toHaveBeenCalledWith('user-1')
    expect(askClaudeMock).toHaveBeenCalledWith('how will we do?', {
      history: [],
      userContext: "this user's favorite team is Oklahoma",
    })
  })

  it('omits userContext when the user has no saved favorite team', async () => {
    getFavoriteTeamMock.mockResolvedValue(undefined)
    askClaudeMock.mockResolvedValue(askResult('answer'))
    const interaction = fakeChatInputInteraction({ strings: { question: 'q' } })

    await askCommand.execute(interaction)

    expect(askClaudeMock).toHaveBeenCalledWith('q', { history: [], userContext: undefined })
  })
})
