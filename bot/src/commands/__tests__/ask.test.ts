import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MessageFlags } from 'discord.js'

const { askClaudeMock, checkAllowanceMock, recordUsageMock, buildUserContextMock, extractMemoriesMock } = vi.hoisted(() => ({
  askClaudeMock: vi.fn(),
  checkAllowanceMock: vi.fn(),
  recordUsageMock: vi.fn(),
  buildUserContextMock: vi.fn(),
  extractMemoriesMock: vi.fn(),
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

vi.mock('../../user-context.js', () => ({ buildUserContext: buildUserContextMock }))
vi.mock('../../memory-extract.js', () => ({ extractMemories: extractMemoriesMock }))

import { askCommand } from '../ask.js'
import { ClaudeUnavailableError } from '../../claude.js'
import { COLOR_INFO } from '../../format.js'
import { clearMemoryForTests, appendTurns } from '../../memory.js'
import { fakeChatInputInteraction, firstEmbedJson, firstComponentJson } from './helpers.js'

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
  buildUserContextMock.mockResolvedValue(undefined)
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
    // Ephemeral refusal is a plain-string reply -- never CV2.
    expect(interaction.reply.mock.calls[0]?.[0].components).toBeUndefined()
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
    // deferReply must NOT carry the CV2 flag -- it takes no flag param for this;
    // the flag is applied on the later editReply call instead.
    expect(interaction.deferReply).toHaveBeenCalledWith()
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

  it('editReplies a short answer as a single CV2 container with no followUps', async () => {
    askClaudeMock.mockResolvedValue(askResult('Ohio State is #1.'))
    const interaction = fakeChatInputInteraction({ strings: { question: 'who is #1?' } })

    await askCommand.execute(interaction)

    const json = firstComponentJson(interaction.editReply)
    expect(json).toEqual({
      type: 17, // ContainerBuilder
      accent_color: COLOR_INFO,
      components: [{ type: 10, content: 'Ohio State is #1.' }], // TextDisplayBuilder
    })
    expect(interaction.followUp).not.toHaveBeenCalled()
  })

  it('nulls content/embeds on the deferred editReply alongside components/flags', async () => {
    askClaudeMock.mockResolvedValue(askResult('answer'))
    const interaction = fakeChatInputInteraction({ strings: { question: 'q' } })

    await askCommand.execute(interaction)

    const payload = interaction.editReply.mock.calls[0]?.[0]
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2)
    expect(payload.content).toBeNull()
    expect(payload.embeds).toEqual([])
    expect(Array.isArray(payload.components)).toBe(true)
  })

  it('sends the first chunk via editReply and the rest via followUp for a long answer', async () => {
    // Sized against the 3800-char CHUNK_MAX (src/format.ts): each paragraph
    // fits under the cap on its own but together they exceed it, so
    // splitMessage's paragraph-break preference produces exactly two chunks.
    const longText = `${'a'.repeat(2000)}\n\n${'b'.repeat(3000)}`
    askClaudeMock.mockResolvedValue(askResult(longText))
    const interaction = fakeChatInputInteraction({ strings: { question: 'long one' } })

    await askCommand.execute(interaction)

    const editJson = firstComponentJson(interaction.editReply)
    expect(editJson.components).toEqual([{ type: 10, content: 'a'.repeat(2000) }])
    expect(interaction.editReply.mock.calls[0]?.[0].flags).toBe(MessageFlags.IsComponentsV2)

    expect(interaction.followUp).toHaveBeenCalledTimes(1)
    const followUpJson = firstComponentJson(interaction.followUp)
    expect(followUpJson.components).toEqual([{ type: 10, content: 'b'.repeat(3000) }])
    expect(interaction.followUp.mock.calls[0]?.[0].flags).toBe(MessageFlags.IsComponentsV2)
  })

  it('editReplies an error embed when Claude is unavailable, and never throws', async () => {
    askClaudeMock.mockRejectedValue(new ClaudeUnavailableError())
    const interaction = fakeChatInputInteraction({ strings: { question: 'anything' } })

    await expect(askCommand.execute(interaction)).resolves.toBeUndefined()

    const json = firstEmbedJson(interaction.editReply)
    expect(json.title).toBe('Stats brain unavailable')
    expect(json.description).toContain("Couldn't reach the stats brain")
    // Error paths stay plain embeds -- never opt into CV2.
    const payload = interaction.editReply.mock.calls[0]?.[0]
    expect(payload.flags).toBeUndefined()
    expect(payload.components).toBeUndefined()
  })

  it('editReplies a generic error embed on an unexpected error, and never throws', async () => {
    askClaudeMock.mockRejectedValue(new Error('boom'))
    const interaction = fakeChatInputInteraction({ strings: { question: 'anything' } })

    await expect(askCommand.execute(interaction)).resolves.toBeUndefined()

    const json = firstEmbedJson(interaction.editReply)
    expect(json.title).toBe('Something went wrong')
    expect(json.description).toContain('boom')
    const payload = interaction.editReply.mock.calls[0]?.[0]
    expect(payload.flags).toBeUndefined()
    expect(payload.components).toBeUndefined()
  })

  it('editReplies a "No answer" embed when the model returns empty text', async () => {
    askClaudeMock.mockResolvedValue(askResult('   '))
    const interaction = fakeChatInputInteraction({ strings: { question: 'anything' } })

    await askCommand.execute(interaction)

    const json = firstEmbedJson(interaction.editReply)
    expect(json.title).toBe('No answer')
    expect(interaction.followUp).not.toHaveBeenCalled()
    const payload = interaction.editReply.mock.calls[0]?.[0]
    expect(payload.flags).toBeUndefined()
    expect(payload.components).toBeUndefined()
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

describe('askCommand user-context injection', () => {
  it('passes the shared builder\'s userContext through to askClaude', async () => {
    buildUserContextMock.mockResolvedValue("this user's favorite team is Oklahoma")
    askClaudeMock.mockResolvedValue(askResult('answer'))
    const interaction = fakeChatInputInteraction({ strings: { question: 'how will we do?' } })
    interaction.user = { id: 'user-1' }

    await askCommand.execute(interaction)

    expect(buildUserContextMock).toHaveBeenCalledWith('user-1', 'test-guild')
    expect(askClaudeMock).toHaveBeenCalledWith('how will we do?', {
      history: [],
      userContext: "this user's favorite team is Oklahoma",
    })
  })

  it('omits userContext when the builder has nothing to say', async () => {
    buildUserContextMock.mockResolvedValue(undefined)
    askClaudeMock.mockResolvedValue(askResult('answer'))
    const interaction = fakeChatInputInteraction({ strings: { question: 'q' } })

    await askCommand.execute(interaction)

    expect(askClaudeMock).toHaveBeenCalledWith('q', { history: [], userContext: undefined })
  })
})

describe('askCommand memory extraction', () => {
  it('fires extractMemories after a successful answer, with an ephemeral pick-ack hook', async () => {
    askClaudeMock.mockResolvedValue(askResult('the answer'))
    const interaction = fakeChatInputInteraction({ strings: { question: 'how good is OU?' } })
    interaction.user = { id: 'user-1' }

    await askCommand.execute(interaction)

    expect(extractMemoriesMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', question: 'how good is OU?', answer: 'the answer', onPicksRecorded: expect.any(Function) })
    )

    // The ack hook posts an ephemeral followUp quoting the stored pick.
    const { onPicksRecorded } = extractMemoriesMock.mock.calls[0]![0] as { onPicksRecorded: (picks: unknown[]) => Promise<void> }
    await onPicksRecorded([{ statement: 'OU wins 10 this year' }])
    const followUp = interaction.followUp.mock.calls.at(-1)![0] as { content: string; flags: number }
    expect(followUp.content).toContain('📒 Logged your pick: "OU wins 10 this year"')
    expect(followUp.flags).toBe(MessageFlags.Ephemeral)
  })

  it('does not fire extractMemories when askClaude fails', async () => {
    askClaudeMock.mockRejectedValue(new ClaudeUnavailableError())
    const interaction = fakeChatInputInteraction({ strings: { question: 'q' } })

    await askCommand.execute(interaction)

    expect(extractMemoriesMock).not.toHaveBeenCalled()
  })
})
