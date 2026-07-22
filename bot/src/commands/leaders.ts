import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import type { Command } from './index.js'
import { callCfbTool } from '../mcp-client.js'
import { buildLeadersEmbed, errorEmbed, type LeaderRow, type LeaderboardMetric } from '../format.js'
import { getDefaultSeason } from '../config.js'
import { mcpErrorEmbed } from './errors.js'

const DEFAULT_LIMIT = 10

const METRIC_CHOICES: { name: string; value: LeaderboardMetric }[] = [
  { name: 'Wins', value: 'wins' },
  { name: 'Points Per Game', value: 'ppg' },
  { name: 'Scoring Defense', value: 'scoring_defense' },
  { name: 'EPA/Play', value: 'epa' },
  { name: 'SP+ Rating', value: 'sp_rating' },
  { name: 'Opponent-Adjusted EPA (wepa)', value: 'wepa' },
]

const definition = new SlashCommandBuilder()
  .setName('leaders')
  .setDescription('Team leaderboard by a chosen metric')
  .addStringOption(option =>
    option.setName('metric').setDescription('Ranking metric').setRequired(true).addChoices(...METRIC_CHOICES)
  )
  .addIntegerOption(option =>
    option.setName('limit').setDescription('How many teams to show (default 10)').setMinValue(1).setMaxValue(100)
  )

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const metric = interaction.options.getString('metric', true) as LeaderboardMetric
  const limit = interaction.options.getInteger('limit') ?? DEFAULT_LIMIT
  const season = getDefaultSeason()

  try {
    const result = await callCfbTool('get_leaderboard', { season, metric, limit })

    if (result.kind === 'rows') {
      await interaction.reply({
        embeds: [buildLeadersEmbed(result.rows as LeaderRow[], { season, metric, source: result.source })],
      })
      return
    }

    await interaction.reply({ embeds: [errorEmbed('No leaderboard data found', result.text)] })
  } catch (err) {
    await interaction.reply({ embeds: [mcpErrorEmbed(err)] })
  }
}

export const leadersCommand: Command = { definition, execute }
