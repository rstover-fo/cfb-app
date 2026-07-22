import { describe, it, expect, vi, beforeEach } from 'vitest'

const { callCfbToolMock } = vi.hoisted(() => ({ callCfbToolMock: vi.fn() }))
vi.mock('../../mcp-client.js', async () => {
  const actual = await vi.importActual<typeof import('../../mcp-client.js')>('../../mcp-client.js')
  return { ...actual, callCfbTool: callCfbToolMock }
})
vi.mock('../../config.js', () => ({ getDefaultSeason: vi.fn(() => 2025) }))

import { edgesCommand } from '../edges.js'
import { McpAuthError } from '../../mcp-client.js'
import { fakeChatInputInteraction, firstEmbedJson } from './helpers.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('edgesCommand option -> tool-arg mapping', () => {
  it('defaults limit to 5 and season from config, omitting week when unset', async () => {
    callCfbToolMock.mockResolvedValue({ kind: 'rows', source: 'api.scored_matchup_edges', count: 0, rows: [] })
    const interaction = fakeChatInputInteraction()

    await edgesCommand.execute(interaction)

    expect(callCfbToolMock).toHaveBeenCalledWith('get_matchup_edges', { season: 2025, limit: 5 })
  })

  it('caps limit at 10 even if a larger value somehow arrives', async () => {
    callCfbToolMock.mockResolvedValue({ kind: 'rows', source: 'api.scored_matchup_edges', count: 0, rows: [] })
    const interaction = fakeChatInputInteraction({ integers: { week: 9, limit: 25 } })

    await edgesCommand.execute(interaction)

    expect(callCfbToolMock).toHaveBeenCalledWith('get_matchup_edges', { season: 2025, week: 9, limit: 10 })
  })
})

describe('edgesCommand replies', () => {
  it('replies with an edges embed on success', async () => {
    callCfbToolMock.mockResolvedValue({ kind: 'rows', source: 'api.scored_matchup_edges', count: 0, rows: [] })
    const interaction = fakeChatInputInteraction()

    await edgesCommand.execute(interaction)

    const json = firstEmbedJson(interaction.reply)
    expect(json.description).toContain('No scored matchup edges')
  })

  it('never throws and replies with an auth-error embed', async () => {
    callCfbToolMock.mockRejectedValue(new McpAuthError())
    const interaction = fakeChatInputInteraction()

    await expect(edgesCommand.execute(interaction)).resolves.toBeUndefined()

    const json = firstEmbedJson(interaction.reply)
    expect(json.title).toBe('Authentication error')
  })
})
