/**
 * /myteam -- saves the caller's favorite team (explicit, never inferred) so
 * the conversational path (claude.ts's userContext) can ground answers like
 * "how'd we look Saturday?" without the user having to name their team every
 * time. Ephemeral: this is per-user bookkeeping, not chat content.
 */
import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from 'discord.js'
import type { Command } from './index.js'
import { autocompleteTeams } from '../autocomplete.js'
import { setFavoriteTeam } from '../profiles.js'
import { errorEmbed } from '../format.js'
import teams from '../data/teams.json' with { type: 'json' }

const TEAM_NAMES: ReadonlySet<string> = new Set(teams as readonly string[])

const definition = new SlashCommandBuilder()
  .setName('myteam')
  .setDescription('Save your favorite team so the bot can use it as context in chat')
  .addStringOption(option =>
    option.setName('team').setDescription('Exact school name').setRequired(true).setAutocomplete(true)
  )

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const team = interaction.options.getString('team', true)

  // Autocomplete only *suggests* exact-case names -- a user can still type a
  // free-text value, so validate against the same list before saving.
  if (!TEAM_NAMES.has(team)) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          'Unknown team',
          `"${team}" isn't in the FBS team list. Pick one of the autocomplete suggestions as you type.`
        ),
      ],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await setFavoriteTeam(interaction.user.id, team)
  await interaction.reply({ content: `Saved -- your favorite team is now **${team}**.`, flags: MessageFlags.Ephemeral })
}

async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused()
  const choices = autocompleteTeams(focused).map(name => ({ name, value: name }))
  await interaction.respond(choices)
}

export const myTeamCommand: Command = { definition, execute, autocomplete }
