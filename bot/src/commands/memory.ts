/**
 * /memory -- transparency and control over the bot's long-term memory.
 * Memory is on by default; the deal with users is that everything the bot
 * remembers is inspectable (`show`), deletable (`forget`), and the whole
 * feature can be turned off per user (`off`). Every reply is ephemeral --
 * what the bot knows about you is yours to see, not the channel's.
 */
import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js'
import type { Command } from './index.js'
import { getFavoriteTeam, getMemoryEnabled, setMemoryEnabled } from '../profiles.js'
import { listAtoms, forgetAtoms } from '../memory-store.js'
import { errorEmbed } from '../format.js'

const definition = new SlashCommandBuilder()
  .setName('memory')
  .setDescription("See or control what the bot remembers about you long-term")
  .addSubcommand(sub => sub.setName('show').setDescription('Show everything the bot remembers about you'))
  .addSubcommand(sub =>
    sub
      .setName('forget')
      .setDescription('Delete memories: everything, or one by its /memory show number')
      .addIntegerOption(option =>
        option.setName('number').setDescription('The memory number from /memory show (omit to forget everything)').setMinValue(1)
      )
  )
  .addSubcommand(sub => sub.setName('on').setDescription('Turn long-term memory back on'))
  .addSubcommand(sub => sub.setName('off').setDescription('Stop the bot remembering new things about you'))

async function executeShow(interaction: ChatInputCommandInteraction, userId: string): Promise<void> {
  const [enabled, favoriteTeam, atoms] = await Promise.all([
    getMemoryEnabled(userId),
    getFavoriteTeam(userId),
    listAtoms(userId),
  ])

  const lines: string[] = [
    `Memory is **${enabled ? 'ON' : 'OFF'}**${enabled ? '' : ' — nothing new is being remembered or used'}.`,
    `Favorite team: ${favoriteTeam ? `**${favoriteTeam}**` : 'not set — use `/myteam`'}.`,
  ]
  if (atoms.length === 0) {
    lines.push('', 'No long-term memories stored yet.')
  } else {
    lines.push('', `What I remember about you (${atoms.length}):`)
    atoms.forEach((atom, i) => lines.push(`${i + 1}. [${atom.kind}] ${atom.content}`))
    lines.push('', '-# Forget one with `/memory forget number:<n>`, everything with `/memory forget`.')
  }
  await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral })
}

async function executeForget(interaction: ChatInputCommandInteraction, userId: string): Promise<void> {
  const index = interaction.options.getInteger('number') ?? undefined
  const { deleted, content } = await forgetAtoms(userId, index)

  if (index !== undefined && deleted === 0) {
    await interaction.reply({
      embeds: [errorEmbed('No such memory', `There's no memory #${index} — run \`/memory show\` for the current list.`)],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const message =
    index !== undefined
      ? `Forgot memory #${index}: "${content}"`
      : deleted === 0
        ? 'Nothing to forget — no long-term memories were stored.'
        : `Forgot all ${deleted} ${deleted === 1 ? 'memory' : 'memories'}.`
  await interaction.reply({ content: message, flags: MessageFlags.Ephemeral })
}

async function executeToggle(interaction: ChatInputCommandInteraction, userId: string, enabled: boolean): Promise<void> {
  await setMemoryEnabled(userId, enabled)
  await interaction.reply({
    content: enabled
      ? "Memory is on — I'll pick up durable preferences from our conversations again. `/memory show` any time."
      : "Memory is off — I'll stop remembering things about you. What's already stored stays but won't be used; run `/memory forget` to wipe it.",
    flags: MessageFlags.Ephemeral,
  })
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id
  const sub = interaction.options.getSubcommand()

  try {
    if (sub === 'show') await executeShow(interaction, userId)
    else if (sub === 'forget') await executeForget(interaction, userId)
    else if (sub === 'on') await executeToggle(interaction, userId, true)
    else await executeToggle(interaction, userId, false)
  } catch (err) {
    console.error('[memory] command failed:', err instanceof Error ? err.message : err)
    await interaction
      .reply({ embeds: [errorEmbed('Could not do that', 'The change did not persist — try again.')], flags: MessageFlags.Ephemeral })
      .catch(() => {})
  }
}

export const memoryCommand: Command = { definition, execute }
