import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import type { Command } from './index.js'
import { callCfbTool } from '../mcp-client.js'
import { buildRankingsEmbed, errorEmbed, type PollRankingRow } from '../format.js'
import { getDefaultSeason } from '../config.js'
import { mcpErrorEmbed } from './errors.js'

const DEFAULT_TOP = 25

// Maps the command's short choice values to api.poll_rankings' exact,
// case-sensitive `poll` column values (see queryPollRankings in the parent
// app's src/lib/queries/mcp.ts -- exact-match .eq('poll', ...)).
const POLL_CHOICE_TO_NAME: Record<string, string> = {
  AP: 'AP Top 25',
  Coaches: 'Coaches Poll',
}

const definition = new SlashCommandBuilder()
  .setName('rankings')
  .setDescription('Poll rankings (AP Top 25 / Coaches Poll)')
  .addIntegerOption(option => option.setName('week').setDescription('Week number').setMinValue(1))
  .addStringOption(option =>
    option
      .setName('poll')
      .setDescription('Which poll (omit for all polls)')
      .addChoices({ name: 'AP Top 25', value: 'AP' }, { name: 'Coaches Poll', value: 'Coaches' })
  )
  .addIntegerOption(option =>
    option.setName('top').setDescription('How many rows to show (default 25)').setMinValue(1).setMaxValue(100)
  )

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const week = interaction.options.getInteger('week') ?? undefined
  const pollChoice = interaction.options.getString('poll') ?? undefined
  const top = interaction.options.getInteger('top') ?? DEFAULT_TOP
  const season = getDefaultSeason()
  const poll = pollChoice ? POLL_CHOICE_TO_NAME[pollChoice] : undefined

  try {
    const result = await callCfbTool('get_rankings', {
      season,
      ...(week != null ? { week } : {}),
      ...(poll ? { poll } : {}),
      limit: top,
    })

    if (result.kind === 'rows') {
      await interaction.reply({
        embeds: [buildRankingsEmbed(result.rows as PollRankingRow[], { season, week, poll, source: result.source })],
      })
      return
    }

    await interaction.reply({ embeds: [errorEmbed('No rankings found', result.text)] })
  } catch (err) {
    await interaction.reply({ embeds: [mcpErrorEmbed(err)] })
  }
}

export const rankingsCommand: Command = { definition, execute }
