import { describe, it, expect, vi, beforeEach } from 'vitest'

const { callCfbToolMock } = vi.hoisted(() => ({ callCfbToolMock: vi.fn() }))
vi.mock('../../mcp-client.js', async () => {
  const actual = await vi.importActual<typeof import('../../mcp-client.js')>('../../mcp-client.js')
  return { ...actual, callCfbTool: callCfbToolMock }
})

import { scoresCommand } from '../scores.js'
import { McpTimeoutError } from '../../mcp-client.js'
import { fakeChatInputInteraction, firstEmbedJson } from './helpers.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('scoresCommand', () => {
  it('calls get_live_scoreboard with no arguments', async () => {
    callCfbToolMock.mockResolvedValue({ kind: 'rows', source: 'api.live_scoreboard', count: 0, rows: [] })
    const interaction = fakeChatInputInteraction()

    await scoresCommand.execute(interaction)

    expect(callCfbToolMock).toHaveBeenCalledWith('get_live_scoreboard', {})
  })

  it('renders the friendly empty-state message for zero live games', async () => {
    callCfbToolMock.mockResolvedValue({ kind: 'rows', source: 'api.live_scoreboard', count: 0, rows: [] })
    const interaction = fakeChatInputInteraction()

    await scoresCommand.execute(interaction)

    const json = firstEmbedJson(interaction.reply)
    expect(json.description).toBe('No live games right now — scoreboard fills up on game days.')
  })

  it('renders a scoreboard embed with games', async () => {
    callCfbToolMock.mockResolvedValue({
      kind: 'rows',
      source: 'api.live_scoreboard',
      count: 1,
      rows: [{ game_id: 1, status: 'in_progress', period: 2, clock: '10:00', home_team: 'Oklahoma', away_team: 'Texas', home_points: 14, away_points: 7, possession: 'Texas', house_live_home_wp: 0.4 }],
    })
    const interaction = fakeChatInputInteraction()

    await scoresCommand.execute(interaction)

    const json = firstEmbedJson(interaction.reply)
    expect(json.fields).toHaveLength(1)
  })

  it('never throws and replies with an error embed on an MCP timeout', async () => {
    callCfbToolMock.mockRejectedValue(new McpTimeoutError())
    const interaction = fakeChatInputInteraction()

    await expect(scoresCommand.execute(interaction)).resolves.toBeUndefined()

    const json = firstEmbedJson(interaction.reply)
    expect(json.title).toBe('Request timed out')
  })
})
