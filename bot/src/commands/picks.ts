/**
 * /picks -- the public prediction ledger. Picks are captured automatically
 * from conversation (memory-extract.ts -> pick-resolve.ts); this command is
 * the viewing surface (me / user / board, all public replies by design --
 * receipts are the point) plus the misextraction escape hatch (void, own
 * picks only, ephemeral). Storage-only: no LLM, no MCP calls.
 */
import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction, type User } from 'discord.js'
import type { Command } from './index.js'
import { listPicks, summarizeRecord, voidPickByIndex } from '../pick-store.js'
import { getStorage } from '../storage/index.js'
import { buildPicksEmbed, buildPickBoardEmbed, errorEmbed, type PickBoardEntry } from '../format.js'

const BOARD_MIN_SETTLED = 3
const BOARD_MAX_ROWS = 15

const definition = new SlashCommandBuilder()
  .setName('picks')
  .setDescription("The server's prediction ledger — records, receipts, leaderboard")
  .addSubcommand(sub => sub.setName('me').setDescription('Your pick record and open picks'))
  .addSubcommand(sub =>
    sub
      .setName('user')
      .setDescription("Someone else's pick record")
      .addUserOption(option => option.setName('who').setDescription('Whose picks to show').setRequired(true))
  )
  .addSubcommand(sub => sub.setName('board').setDescription(`Leaderboard (min ${BOARD_MIN_SETTLED} settled picks)`))
  .addSubcommand(sub =>
    sub
      .setName('void')
      .setDescription('Void one of your own open picks (bad auto-detection?)')
      .addIntegerOption(option =>
        option.setName('number').setDescription('The pick number from /picks me').setRequired(true).setMinValue(1)
      )
  )

async function showLedger(interaction: ChatInputCommandInteraction, user: { id: string; displayName: string }): Promise<void> {
  // Guild-scoped: this server's ledger only, so multi-guild deployments
  // (test + real server share one DISCORD_GUILD_ID list) never cross streams.
  const picks = await listPicks(user.id, interaction.guildId ?? undefined)
  const record = summarizeRecord(picks)
  await interaction.reply({ embeds: [buildPicksEmbed(picks, { displayName: user.displayName, record })] })
}

async function executeBoard(interaction: ChatInputCommandInteraction): Promise<void> {
  const all = await getStorage().listPicks({ guildId: interaction.guildId ?? undefined })
  const byUser = new Map<string, typeof all>()
  for (const pick of all) {
    byUser.set(pick.userId, [...(byUser.get(pick.userId) ?? []), pick])
  }

  const entries: PickBoardEntry[] = []
  for (const [userId, picks] of byUser) {
    const record = summarizeRecord(picks)
    const settled = record.wins + record.losses + record.pushes
    if (settled < BOARD_MIN_SETTLED) continue
    // Best-effort display name; a mention renders fine even uncached.
    const name = interaction.guild?.members.cache.get(userId)?.displayName ?? `<@${userId}>`
    entries.push({ name, record })
  }

  entries.sort((a, b) => {
    const decisiveA = a.record.wins + a.record.losses
    const decisiveB = b.record.wins + b.record.losses
    const pctA = decisiveA === 0 ? 0 : a.record.wins / decisiveA
    const pctB = decisiveB === 0 ? 0 : b.record.wins / decisiveB
    return pctB - pctA || b.record.wins - a.record.wins
  })

  await interaction.reply({ embeds: [buildPickBoardEmbed(entries.slice(0, BOARD_MAX_ROWS))] })
}

async function executeVoid(interaction: ChatInputCommandInteraction): Promise<void> {
  const index = interaction.options.getInteger('number', true)
  // Same guild scoping as /picks me, so the numbers line up with that view.
  const { voided, statement } = await voidPickByIndex(interaction.user.id, index, interaction.guildId ?? undefined)
  if (!voided) {
    await interaction.reply({
      embeds: [errorEmbed('No such pick', `You have no open pick #${index} — check the numbers in \`/picks me\`.`)],
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  await interaction.reply({ content: `Voided pick #${index}: "${statement}"`, flags: MessageFlags.Ephemeral })
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand()

  try {
    if (sub === 'me') {
      const displayName = interaction.guild?.members.cache.get(interaction.user.id)?.displayName ?? interaction.user.username
      await showLedger(interaction, { id: interaction.user.id, displayName })
    } else if (sub === 'user') {
      const who: User = interaction.options.getUser('who', true)
      const displayName = interaction.guild?.members.cache.get(who.id)?.displayName ?? who.username
      await showLedger(interaction, { id: who.id, displayName })
    } else if (sub === 'board') {
      await executeBoard(interaction)
    } else {
      await executeVoid(interaction)
    }
  } catch (err) {
    console.error('[picks] command failed:', err instanceof Error ? err.message : err)
    await interaction
      .reply({ embeds: [errorEmbed('Could not do that', 'Something went wrong reading the ledger — try again.')], flags: MessageFlags.Ephemeral })
      .catch(() => {})
  }
}

export const picksCommand: Command = { definition, execute }
