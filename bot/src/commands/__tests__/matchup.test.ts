import { describe, it, expect, vi, beforeEach } from 'vitest'

const { callCfbToolMock } = vi.hoisted(() => ({ callCfbToolMock: vi.fn() }))
vi.mock('../../mcp-client.js', async () => {
  const actual = await vi.importActual<typeof import('../../mcp-client.js')>('../../mcp-client.js')
  return { ...actual, callCfbTool: callCfbToolMock }
})

import { matchupCommand } from '../matchup.js'
import { McpTimeoutError } from '../../mcp-client.js'
import { fakeChatInputInteraction, firstEmbedJson } from './helpers.js'

beforeEach(() => {
  vi.clearAllMocks()
})

// query_matchup returns the composite {matchup, games} shape as kind: 'message'.
// Inner rows are camelCase (verified against a live response) -- keep these
// fixtures shaped like the real API, not like query_games' snake_case rows.
function compositeResult(matchupRows: unknown[], gameRows: unknown[]) {
  return {
    kind: 'message' as const,
    text: JSON.stringify({
      matchup: { _source: 'api.matchup', count: matchupRows.length, rows: matchupRows },
      games: { _source: 'api.game_detail', count: gameRows.length, rows: gameRows },
    }),
  }
}

describe('matchupCommand option -> tool-arg mapping', () => {
  it('maps team1/team2 options onto team_a/team_b args', async () => {
    callCfbToolMock.mockResolvedValue(compositeResult([{ teamA: 'Oklahoma', teamB: 'Texas', totalGames: 1 }], []))
    const interaction = fakeChatInputInteraction({ strings: { team1: 'Oklahoma', team2: 'Texas' } })

    await matchupCommand.execute(interaction)

    expect(callCfbToolMock).toHaveBeenCalledWith('query_matchup', { team_a: 'Oklahoma', team_b: 'Texas' })
  })
})

describe('matchupCommand replies', () => {
  it('renders matchup + recent games into an embed', async () => {
    callCfbToolMock.mockResolvedValue(
      compositeResult(
        [{ teamA: 'Oklahoma', teamB: 'Texas', totalGames: 101, teamAWins: 51, teamBWins: 45, ties: 5 }],
        [{ season: 2025, teamAScore: 24, teamBScore: 21, teamAHome: false, neutralSite: true, winner: 'Oklahoma' }]
      )
    )
    const interaction = fakeChatInputInteraction({ strings: { team1: 'Oklahoma', team2: 'Texas' } })

    await matchupCommand.execute(interaction)

    const json = firstEmbedJson(interaction.reply)
    expect(JSON.stringify(json)).toContain('Oklahoma')
  })

  it('replies with a no-history embed for the plain "No matchup" string', async () => {
    callCfbToolMock.mockResolvedValue({ kind: 'message', text: 'No matchup history found for these teams.' })
    const interaction = fakeChatInputInteraction({ strings: { team1: 'Oklahoma', team2: 'Delaware' } })

    await matchupCommand.execute(interaction)

    const json = firstEmbedJson(interaction.reply)
    expect(json.title).toBe('No matchup history found')
  })

  it('never throws and replies with a timeout embed', async () => {
    callCfbToolMock.mockRejectedValue(new McpTimeoutError())
    const interaction = fakeChatInputInteraction({ strings: { team1: 'Oklahoma', team2: 'Texas' } })

    await expect(matchupCommand.execute(interaction)).resolves.toBeUndefined()

    const json = firstEmbedJson(interaction.reply)
    expect(JSON.stringify(json).toLowerCase()).toContain('timed out')
  })
})
