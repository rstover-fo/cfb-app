import { describe, it, expect, vi, beforeEach } from 'vitest'

const { callCfbToolMock } = vi.hoisted(() => ({ callCfbToolMock: vi.fn() }))
vi.mock('../../mcp-client.js', async () => {
  const actual = await vi.importActual<typeof import('../../mcp-client.js')>('../../mcp-client.js')
  return { ...actual, callCfbTool: callCfbToolMock }
})
vi.mock('../../config.js', () => ({ getDefaultSeason: vi.fn(() => 2025) }))

import { playerCommand } from '../player.js'
import { fakeChatInputInteraction, firstEmbedJson } from './helpers.js'

beforeEach(() => {
  vi.clearAllMocks()
})

// search_players returns the composite {search, top_hit_detail} shape as kind: 'message'.
function compositeResult(searchRows: unknown[], detailRows: unknown[]) {
  return {
    kind: 'message' as const,
    text: JSON.stringify({
      search: { _source: 'public.get_player_search', count: searchRows.length, rows: searchRows },
      top_hit_detail: { _source: 'public.get_player_detail', count: detailRows.length, rows: detailRows },
    }),
  }
}

describe('playerCommand option -> tool-arg mapping', () => {
  it('defaults season from config and omits team when unset', async () => {
    callCfbToolMock.mockResolvedValue(compositeResult([{ name: 'John Mateer' }], []))
    const interaction = fakeChatInputInteraction({ strings: { name: 'Mateer' } })

    await playerCommand.execute(interaction)

    expect(callCfbToolMock).toHaveBeenCalledWith('search_players', { query: 'Mateer', season: 2025 })
  })

  it('passes team through when provided', async () => {
    callCfbToolMock.mockResolvedValue(compositeResult([{ name: 'John Mateer' }], []))
    const interaction = fakeChatInputInteraction({ strings: { name: 'Mateer', team: 'Oklahoma' } })

    await playerCommand.execute(interaction)

    expect(callCfbToolMock).toHaveBeenCalledWith('search_players', {
      query: 'Mateer',
      team: 'Oklahoma',
      season: 2025,
    })
  })
})

describe('playerCommand replies', () => {
  it('renders search hits + top-hit detail into an embed', async () => {
    callCfbToolMock.mockResolvedValue(
      compositeResult(
        [{ name: 'John Mateer', team: 'Oklahoma', position: 'QB' }],
        [{ name: 'John Mateer', passing_yards: 3200 }]
      )
    )
    const interaction = fakeChatInputInteraction({ strings: { name: 'Mateer' } })

    await playerCommand.execute(interaction)

    const json = firstEmbedJson(interaction.reply)
    expect(JSON.stringify(json)).toContain('Mateer')
  })

  it('replies with a no-players embed when search has zero hits', async () => {
    callCfbToolMock.mockResolvedValue(compositeResult([], []))
    const interaction = fakeChatInputInteraction({ strings: { name: 'Nobody Real' } })

    await playerCommand.execute(interaction)

    const json = firstEmbedJson(interaction.reply)
    expect(json.title).toBe('No players found')
  })

  it('replies with a no-players embed for the plain "No players found" string', async () => {
    callCfbToolMock.mockResolvedValue({ kind: 'message', text: "No players found matching 'zzz'." })
    const interaction = fakeChatInputInteraction({ strings: { name: 'zzz' } })

    await playerCommand.execute(interaction)

    const json = firstEmbedJson(interaction.reply)
    expect(json.title).toBe('No players found')
  })
})
