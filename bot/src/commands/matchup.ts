import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction } from 'discord.js'
import type { Command } from './index.js'
import { callCfbTool } from '../mcp-client.js'
import { buildMatchupEmbed, errorEmbed, type MatchupRow, type MatchupGameRow } from '../format.js'
import { autocompleteTeams } from '../autocomplete.js'
import { mcpErrorEmbed, tryParseJson } from './errors.js'

const definition = new SlashCommandBuilder()
  .setName('matchup')
  .setDescription('Head-to-head history between two teams')
  .addStringOption(option =>
    option.setName('team1').setDescription('First team').setRequired(true).setAutocomplete(true)
  )
  .addStringOption(option =>
    option.setName('team2').setDescription('Second team').setRequired(true).setAutocomplete(true)
  )

interface QueryMatchupComposite {
  matchup?: { rows: MatchupRow[] }
  games?: { rows: MatchupGameRow[] }
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const teamA = interaction.options.getString('team1', true)
  const teamB = interaction.options.getString('team2', true)

  try {
    const result = await callCfbTool('query_matchup', { team_a: teamA, team_b: teamB })

    if (result.kind === 'rows') {
      await interaction.reply({
        embeds: [errorEmbed('Unexpected response', 'The stats server returned an unexpected shape for this matchup lookup.')],
      })
      return
    }

    const parsed = tryParseJson<QueryMatchupComposite>(result.text)
    const matchupRow = parsed?.matchup?.rows[0]
    if (!matchupRow) {
      // Not JSON, or JSON without a matchup row -- the tool's friendly
      // "No matchup history found..." string.
      await interaction.reply({ embeds: [errorEmbed('No matchup history found', result.text)] })
      return
    }

    const games = parsed?.games?.rows ?? []
    await interaction.reply({ embeds: [buildMatchupEmbed(matchupRow, games, teamA, teamB)] })
  } catch (err) {
    await interaction.reply({ embeds: [mcpErrorEmbed(err)] })
  }
}

async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused()
  const choices = autocompleteTeams(focused).map(name => ({ name, value: name }))
  await interaction.respond(choices)
}

export const matchupCommand: Command = { definition, execute, autocomplete }
