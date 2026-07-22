import { describe, it, expect, vi, beforeEach } from 'vitest'

const { callCfbToolMock } = vi.hoisted(() => ({ callCfbToolMock: vi.fn() }))
vi.mock('../../mcp-client.js', async () => {
  const actual = await vi.importActual<typeof import('../../mcp-client.js')>('../../mcp-client.js')
  return { ...actual, callCfbTool: callCfbToolMock }
})

import { teamCommand } from '../team.js'
import { McpAuthError } from '../../mcp-client.js'
import { fakeChatInputInteraction, fakeAutocompleteInteraction, firstEmbedJson } from './helpers.js'

beforeEach(() => {
  vi.clearAllMocks()
})

// query_team returns the composite {team_detail, team_history} shape, which
// mcp-client deliberately hands back as kind: 'message' raw text.
function compositeResult(detailRows: unknown[], historyRows: unknown[]) {
  return {
    kind: 'message' as const,
    text: JSON.stringify({
      team_detail: { _source: 'api.team_detail', count: detailRows.length, rows: detailRows },
      team_history: { _source: 'api.team_history', count: historyRows.length, rows: historyRows },
    }),
  }
}

describe('teamCommand option -> tool-arg mapping', () => {
  it('passes the exact team name through to query_team', async () => {
    callCfbToolMock.mockResolvedValue(compositeResult([], []))
    const interaction = fakeChatInputInteraction({ strings: { team: 'Miami (OH)' } })

    await teamCommand.execute(interaction)

    expect(callCfbToolMock).toHaveBeenCalledWith('query_team', { team: 'Miami (OH)' })
  })
})

describe('teamCommand replies', () => {
  it('renders the composite detail + history into a team embed', async () => {
    callCfbToolMock.mockResolvedValue(
      compositeResult(
        [{ school: 'Oklahoma', conference: 'SEC', wins: 10, losses: 2 }],
        [{ season: 2024, wins: 10, losses: 3 }]
      )
    )
    const interaction = fakeChatInputInteraction({ strings: { team: 'Oklahoma' } })

    await teamCommand.execute(interaction)

    const json = firstEmbedJson(interaction.reply)
    expect(JSON.stringify(json)).toContain('Oklahoma')
  })

  it('replies with a not-found embed for the plain "No team found" string', async () => {
    callCfbToolMock.mockResolvedValue({ kind: 'message', text: "No team found matching 'Oklahmoa'." })
    const interaction = fakeChatInputInteraction({ strings: { team: 'Oklahmoa' } })

    await teamCommand.execute(interaction)

    const json = firstEmbedJson(interaction.reply)
    expect(json.title).toBe('Team not found')
  })

  it('never throws and replies with an auth-error embed', async () => {
    callCfbToolMock.mockRejectedValue(new McpAuthError())
    const interaction = fakeChatInputInteraction({ strings: { team: 'Oklahoma' } })

    await expect(teamCommand.execute(interaction)).resolves.toBeUndefined()

    const json = firstEmbedJson(interaction.reply)
    expect(json.title).toBe('Authentication error')
  })
})

describe('teamCommand autocomplete', () => {
  it('responds with exact-case team name choices', async () => {
    const interaction = fakeAutocompleteInteraction('okla')

    await teamCommand.autocomplete!(interaction)

    const choices = interaction.respond.mock.calls[0][0] as { name: string; value: string }[]
    expect(choices.some(c => c.value === 'Oklahoma')).toBe(true)
    expect(choices.length).toBeLessThanOrEqual(25)
  })
})
