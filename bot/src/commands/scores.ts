import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import type { Command } from './index.js'
import { callCfbTool } from '../mcp-client.js'
import { buildScoresEmbed, errorEmbed, type LiveScoreboardRow } from '../format.js'
import { mcpErrorEmbed } from './errors.js'

const definition = new SlashCommandBuilder().setName('scores').setDescription('Live scoreboard for games in progress today')

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const result = await callCfbTool('get_live_scoreboard', {})

    if (result.kind === 'rows') {
      // buildScoresEmbed itself renders the "no live games" friendly copy for count 0.
      await interaction.reply({ embeds: [buildScoresEmbed(result.rows as LiveScoreboardRow[])] })
      return
    }

    // get_live_scoreboard's contract always returns the flat envelope, never
    // a "No ... found" string -- a message result here means something
    // unexpected happened server-side.
    await interaction.reply({ embeds: [errorEmbed('Scoreboard unavailable', result.text)] })
  } catch (err) {
    await interaction.reply({ embeds: [mcpErrorEmbed(err)] })
  }
}

export const scoresCommand: Command = { definition, execute }
