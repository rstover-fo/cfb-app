import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import type { Command } from './index.js'
import { buildHelpEmbed } from '../format.js'

const definition = new SlashCommandBuilder().setName('help').setDescription('List available CFB Bot commands')

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ embeds: [buildHelpEmbed()] })
}

export const helpCommand: Command = { definition, execute }
