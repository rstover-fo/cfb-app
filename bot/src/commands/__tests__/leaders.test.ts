import { describe, it, expect, vi, beforeEach } from 'vitest'

const { callCfbToolMock } = vi.hoisted(() => ({ callCfbToolMock: vi.fn() }))
vi.mock('../../mcp-client.js', async () => {
  const actual = await vi.importActual<typeof import('../../mcp-client.js')>('../../mcp-client.js')
  return { ...actual, callCfbTool: callCfbToolMock }
})
vi.mock('../../config.js', () => ({ getDefaultSeason: vi.fn(() => 2025) }))

import { leadersCommand } from '../leaders.js'
import { fakeChatInputInteraction, firstEmbedJson } from './helpers.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('leadersCommand option -> tool-arg mapping', () => {
  it('maps metric and defaults limit to 10 and season from config', async () => {
    callCfbToolMock.mockResolvedValue({ kind: 'rows', source: 'api.leaderboard_teams', count: 0, rows: [] })
    const interaction = fakeChatInputInteraction({ strings: { metric: 'epa' } })

    await leadersCommand.execute(interaction)

    expect(callCfbToolMock).toHaveBeenCalledWith('get_leaderboard', { season: 2025, metric: 'epa', limit: 10 })
  })

  it('forwards an explicit limit', async () => {
    callCfbToolMock.mockResolvedValue({ kind: 'rows', source: 'api.leaderboard_teams', count: 0, rows: [] })
    const interaction = fakeChatInputInteraction({ strings: { metric: 'wepa' }, integers: { limit: 3 } })

    await leadersCommand.execute(interaction)

    expect(callCfbToolMock).toHaveBeenCalledWith('get_leaderboard', { season: 2025, metric: 'wepa', limit: 3 })
  })
})

describe('leadersCommand replies', () => {
  it('replies with a leaders embed on success', async () => {
    callCfbToolMock.mockResolvedValue({
      kind: 'rows',
      source: 'api.leaderboard_teams',
      count: 1,
      rows: [{ team: 'Ohio State', conference: 'Big Ten', wins: 10, losses: 0, ppg: 41, opp_ppg: 10, epa_per_play: 0.3, sp_rating: 30, sp_rank: 1, epa_total: 100, epa_rank: 1 }],
    })
    const interaction = fakeChatInputInteraction({ strings: { metric: 'wins' } })

    await leadersCommand.execute(interaction)

    const json = firstEmbedJson(interaction.reply)
    expect(json.description).toContain('Ohio State')
  })

  it('replies with an info embed for an empty result', async () => {
    callCfbToolMock.mockResolvedValue({ kind: 'message', text: 'No leaderboard data found for season=2025.' })
    const interaction = fakeChatInputInteraction({ strings: { metric: 'wins' } })

    await leadersCommand.execute(interaction)

    const json = firstEmbedJson(interaction.reply)
    expect(json.title).toBe('No leaderboard data found')
  })
})
