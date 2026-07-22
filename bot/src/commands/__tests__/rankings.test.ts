import { describe, it, expect, vi, beforeEach } from 'vitest'

const { callCfbToolMock } = vi.hoisted(() => ({ callCfbToolMock: vi.fn() }))
vi.mock('../../mcp-client.js', async () => {
  const actual = await vi.importActual<typeof import('../../mcp-client.js')>('../../mcp-client.js')
  return { ...actual, callCfbTool: callCfbToolMock }
})
vi.mock('../../config.js', () => ({ getDefaultSeason: vi.fn(() => 2025) }))

import { rankingsCommand } from '../rankings.js'
import { McpAuthError, McpTimeoutError } from '../../mcp-client.js'
import { fakeChatInputInteraction, firstEmbedJson } from './helpers.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('rankingsCommand option -> tool-arg mapping', () => {
  it('maps week/poll/top options and defaults season from config', async () => {
    callCfbToolMock.mockResolvedValue({ kind: 'rows', source: 'api.poll_rankings', count: 0, rows: [] })
    const interaction = fakeChatInputInteraction({
      integers: { week: 8, top: 10 },
      strings: { poll: 'AP' },
    })

    await rankingsCommand.execute(interaction)

    expect(callCfbToolMock).toHaveBeenCalledWith('get_rankings', {
      season: 2025,
      week: 8,
      poll: 'AP Top 25',
      limit: 10,
    })
  })

  it('defaults top to 25 and omits week/poll when not provided', async () => {
    callCfbToolMock.mockResolvedValue({ kind: 'rows', source: 'api.poll_rankings', count: 0, rows: [] })
    const interaction = fakeChatInputInteraction()

    await rankingsCommand.execute(interaction)

    expect(callCfbToolMock).toHaveBeenCalledWith('get_rankings', { season: 2025, limit: 25 })
  })

  it('maps the Coaches choice to the exact poll name', async () => {
    callCfbToolMock.mockResolvedValue({ kind: 'rows', source: 'api.poll_rankings', count: 0, rows: [] })
    const interaction = fakeChatInputInteraction({ strings: { poll: 'Coaches' } })

    await rankingsCommand.execute(interaction)

    expect(callCfbToolMock).toHaveBeenCalledWith('get_rankings', { season: 2025, poll: 'Coaches Poll', limit: 25 })
  })
})

describe('rankingsCommand replies', () => {
  it('replies with a rankings embed on success', async () => {
    callCfbToolMock.mockResolvedValue({
      kind: 'rows',
      source: 'api.poll_rankings',
      count: 1,
      rows: [{ season: 2025, season_type: 'regular', week: 8, poll: 'AP Top 25', rank: 1, school: 'Ohio State', conference: 'Big Ten', first_place_votes: 60, points: 1550 }],
    })
    const interaction = fakeChatInputInteraction()

    await rankingsCommand.execute(interaction)

    const json = firstEmbedJson(interaction.reply)
    expect(json.fields).toBeDefined()
  })

  it('replies with an info embed for a "No rankings found" message result', async () => {
    callCfbToolMock.mockResolvedValue({ kind: 'message', text: "No rankings found for season=2025, season_type=regular with the given filters." })
    const interaction = fakeChatInputInteraction()

    await rankingsCommand.execute(interaction)

    const json = firstEmbedJson(interaction.reply)
    expect(json.title).toBe('No rankings found')
    expect(json.description).toContain('No rankings found for season=2025')
  })

  it('replies with an auth-error embed and never throws when the MCP call fails auth', async () => {
    callCfbToolMock.mockRejectedValue(new McpAuthError())
    const interaction = fakeChatInputInteraction()

    await expect(rankingsCommand.execute(interaction)).resolves.toBeUndefined()

    const json = firstEmbedJson(interaction.reply)
    expect(json.title).toBe('Authentication error')
  })

  it('replies with a timeout-error embed and never throws when the MCP call times out', async () => {
    callCfbToolMock.mockRejectedValue(new McpTimeoutError())
    const interaction = fakeChatInputInteraction()

    await expect(rankingsCommand.execute(interaction)).resolves.toBeUndefined()

    const json = firstEmbedJson(interaction.reply)
    expect(json.title).toBe('Request timed out')
  })

  it('replies with a generic error embed and never throws on an unexpected error', async () => {
    callCfbToolMock.mockRejectedValue(new Error('boom'))
    const interaction = fakeChatInputInteraction()

    await expect(rankingsCommand.execute(interaction)).resolves.toBeUndefined()

    const json = firstEmbedJson(interaction.reply)
    expect(json.title).toBe('Something went wrong')
    expect(json.description).toContain('boom')
  })
})
