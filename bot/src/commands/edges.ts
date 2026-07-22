import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import type { Command } from './index.js'
import { callCfbTool } from '../mcp-client.js'
import { buildEdgesEmbed, errorEmbed, type MatchupEdgeRow } from '../format.js'
import { getDefaultSeason } from '../config.js'
import { mcpErrorEmbed } from './errors.js'

const DEFAULT_LIMIT = 5
const MAX_LIMIT = 10

const definition = new SlashCommandBuilder()
  .setName('edges')
  .setDescription("Where the house model's predictions diverge most from the market line")
  .addIntegerOption(option => option.setName('week').setDescription('Week number').setMinValue(1))
  .addIntegerOption(option =>
    option.setName('limit').setDescription('How many games to show (default 5, max 10)').setMinValue(1).setMaxValue(MAX_LIMIT)
  )

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const week = interaction.options.getInteger('week') ?? undefined
  const limit = Math.min(interaction.options.getInteger('limit') ?? DEFAULT_LIMIT, MAX_LIMIT)
  const season = getDefaultSeason()

  try {
    const result = await callCfbTool('get_matchup_edges', {
      season,
      ...(week != null ? { week } : {}),
      limit,
    })

    if (result.kind === 'rows') {
      await interaction.reply({ embeds: [buildEdgesEmbed(result.rows as MatchupEdgeRow[], { season, week })] })
      return
    }

    await interaction.reply({ embeds: [errorEmbed('Matchup edges unavailable', result.text)] })
  } catch (err) {
    await interaction.reply({ embeds: [mcpErrorEmbed(err)] })
  }
}

export const edgesCommand: Command = { definition, execute }
