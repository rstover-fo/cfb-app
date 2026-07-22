import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction } from 'discord.js'
import type { Command } from './index.js'
import { callCfbTool } from '../mcp-client.js'
import { buildPlayerEmbed, errorEmbed, type PlayerSearchRow, type PlayerDetailRow } from '../format.js'
import { getDefaultSeason } from '../config.js'
import { autocompleteTeams } from '../autocomplete.js'
import { mcpErrorEmbed, tryParseJson } from './errors.js'

const definition = new SlashCommandBuilder()
  .setName('player')
  .setDescription('Search for a player and see their season stats')
  .addStringOption(option => option.setName('name').setDescription('Player name (full or partial)').setRequired(true))
  .addStringOption(option =>
    option.setName('team').setDescription('Restrict the search to one team').setAutocomplete(true)
  )

interface SearchPlayersComposite {
  search?: { rows: PlayerSearchRow[] }
  top_hit_detail?: { rows: PlayerDetailRow[] }
  top_hit_detail_error?: string
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('name', true)
  const team = interaction.options.getString('team') ?? undefined
  const season = getDefaultSeason()

  try {
    const result = await callCfbTool('search_players', {
      query: name,
      ...(team ? { team } : {}),
      season,
    })

    if (result.kind === 'rows') {
      await interaction.reply({
        embeds: [errorEmbed('Unexpected response', 'The stats server returned an unexpected shape for this player search.')],
      })
      return
    }

    const parsed = tryParseJson<SearchPlayersComposite>(result.text)
    const search = parsed?.search?.rows ?? []
    if (!parsed || search.length === 0) {
      // Not JSON, or JSON without any search hits -- the tool's friendly
      // "No players found matching '...'" string.
      await interaction.reply({ embeds: [errorEmbed('No players found', result.text)] })
      return
    }

    const detail = parsed.top_hit_detail?.rows[0] ?? null
    await interaction.reply({ embeds: [buildPlayerEmbed(search, detail)] })
  } catch (err) {
    await interaction.reply({ embeds: [mcpErrorEmbed(err)] })
  }
}

async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused()
  const choices = autocompleteTeams(focused).map(name => ({ name, value: name }))
  await interaction.respond(choices)
}

export const playerCommand: Command = { definition, execute, autocomplete }
