import { describe, it, expect, vi, beforeEach } from 'vitest'

const { askClaudeMock } = vi.hoisted(() => ({ askClaudeMock: vi.fn() }))

vi.mock('../../claude.js', () => {
  class ClaudeUnavailableError extends Error {
    constructor(message = "Couldn't reach the stats brain — try again in a minute.") {
      super(message)
      this.name = 'ClaudeUnavailableError'
    }
  }
  return { askClaude: askClaudeMock, ClaudeUnavailableError }
})

import { askCommand } from '../ask.js'
import { ClaudeUnavailableError } from '../../claude.js'
import { fakeChatInputInteraction, firstEmbedJson } from './helpers.js'

function askResult(text: string) {
  return {
    text,
    tier: 'simple' as const,
    escalated: false,
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
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

  it('passes the question through to askClaude', async () => {
    askClaudeMock.mockResolvedValue(askResult('answer'))
    const interaction = fakeChatInputInteraction({ strings: { question: 'how good is Georgia?' } })

    await askCommand.execute(interaction)

    expect(askClaudeMock).toHaveBeenCalledWith('how good is Georgia?')
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
