import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js'
import type { Command } from './index.js'
import { setLoreEnabled } from '../settings.js'
import { errorEmbed } from '../format.js'

const definition = new SlashCommandBuilder()
  .setName('lore')
  .setDescription("Turn the bot's server-lore jokes on or off (off = it stops, for real, across restarts)")
  .addStringOption(option =>
    option
      .setName('state')
      .setDescription('on or off')
      .setRequired(true)
      .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' })
  )

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const state = interaction.options.getString('state', true)

  try {
    const enabled = state === 'on'
    await setLoreEnabled(enabled)
    // Public (not ephemeral) on purpose: whoever asked it to stop deserves a
    // visible acknowledgment the whole channel can see.
    await interaction.reply(
      enabled
        ? 'Server-lore jokes are back on. 🎭'
        : "Server-lore jokes are off — and that's persisted, not a pinky promise. Turn them back with `/lore on`."
    )
  } catch (err) {
    console.error('[lore] failed to persist toggle:', err instanceof Error ? err.message : err)
    await interaction
      .reply({ embeds: [errorEmbed('Could not save that', 'The toggle did not persist — try again.')], flags: MessageFlags.Ephemeral })
      .catch(() => {})
  }
}

export const loreCommand: Command = { definition, execute }
