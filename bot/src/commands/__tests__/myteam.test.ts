import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MessageFlags } from 'discord.js'

const { setFavoriteTeamMock } = vi.hoisted(() => ({ setFavoriteTeamMock: vi.fn() }))
vi.mock('../../profiles.js', () => ({ setFavoriteTeam: setFavoriteTeamMock }))

import { myTeamCommand } from '../myteam.js'
import { fakeChatInputInteraction, fakeAutocompleteInteraction, firstEmbedJson } from './helpers.js'

beforeEach(() => {
  vi.clearAllMocks()
  setFavoriteTeamMock.mockResolvedValue(undefined)
})

describe('myTeamCommand execute', () => {
  it('saves a valid team and replies ephemerally with a confirmation', async () => {
    const interaction = fakeChatInputInteraction({ strings: { team: 'Oklahoma' } })
    interaction.user = { id: 'user-1' }

    await myTeamCommand.execute(interaction)

    expect(setFavoriteTeamMock).toHaveBeenCalledWith('user-1', 'Oklahoma')
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Oklahoma'), flags: MessageFlags.Ephemeral })
    )
  })

  it('rejects an unknown/free-text team without saving', async () => {
    const interaction = fakeChatInputInteraction({ strings: { team: 'Springfield State' } })
    interaction.user = { id: 'user-1' }

    await myTeamCommand.execute(interaction)

    expect(setFavoriteTeamMock).not.toHaveBeenCalled()
    const json = firstEmbedJson(interaction.reply)
    expect(json.title).toBe('Unknown team')
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral }))
  })

  it('is exact-match case-sensitive against the team list', async () => {
    const interaction = fakeChatInputInteraction({ strings: { team: 'oklahoma' } })
    interaction.user = { id: 'user-1' }

    await myTeamCommand.execute(interaction)

    expect(setFavoriteTeamMock).not.toHaveBeenCalled()
    const json = firstEmbedJson(interaction.reply)
    expect(json.title).toBe('Unknown team')
  })
})

describe('myTeamCommand autocomplete', () => {
  it('responds with exact-case team name choices', async () => {
    const interaction = fakeAutocompleteInteraction('okla')

    await myTeamCommand.autocomplete!(interaction)

    const choices = interaction.respond.mock.calls[0][0] as { name: string; value: string }[]
    expect(choices.some(c => c.value === 'Oklahoma')).toBe(true)
    expect(choices.length).toBeLessThanOrEqual(25)
  })
})
