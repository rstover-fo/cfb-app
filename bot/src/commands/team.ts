import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction } from 'discord.js'
import type { Command } from './index.js'
import { callCfbTool } from '../mcp-client.js'
import { buildTeamEmbed, errorEmbed, type TeamDetailRow, type TeamHistoryRow } from '../format.js'
import { autocompleteTeams } from '../autocomplete.js'
import { mcpErrorEmbed, tryParseJson } from './errors.js'

const definition = new SlashCommandBuilder()
  .setName('team')
  .setDescription("A team's current-season snapshot and recent history")
  .addStringOption(option =>
    option.setName('team').setDescription('Exact school name').setRequired(true).setAutocomplete(true)
  )

interface QueryTeamComposite {
  team_detail?: { rows: TeamDetailRow[] }
  team_history?: { rows: TeamHistoryRow[] }
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const team = interaction.options.getString('team', true)

  try {
    const result = await callCfbTool('query_team', { team })

    if (result.kind === 'rows') {
      // query_team's response is always the composite {team_detail, team_history}
      // shape (kind: 'message'), never the flat envelope -- a 'rows' result here
      // means something unexpected happened server-side.
      await interaction.reply({
        embeds: [errorEmbed('Unexpected response', 'The stats server returned an unexpected shape for this team lookup.')],
      })
      return
    }

    const parsed = tryParseJson<QueryTeamComposite>(result.text)
    if (!parsed) {
      // Not JSON -- the tool's friendly "No team found matching '...'" string.
      await interaction.reply({ embeds: [errorEmbed('Team not found', result.text)] })
      return
    }

    const detail = parsed.team_detail?.rows[0] ?? null
    const history = parsed.team_history?.rows ?? []
    await interaction.reply({ embeds: [buildTeamEmbed(detail, history, team)] })
  } catch (err) {
    await interaction.reply({ embeds: [mcpErrorEmbed(err)] })
  }
}

async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused()
  const choices = autocompleteTeams(focused).map(name => ({ name, value: name }))
  await interaction.respond(choices)
}

export const teamCommand: Command = { definition, execute, autocomplete }
