/**
 * /ask -- the conversational path. Checks the per-user cooldown/cap/budget
 * guards first (a fast, synchronous, in-memory check -- must happen before
 * deferReply so a refusal can be a plain immediate reply), then defers
 * (Claude + the server-side MCP tool loop routinely takes 10-30s, far past
 * Discord's 3s interaction deadline), then edits the deferred reply with the
 * first chunk and follows up with the rest.
 */
import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js'
import type { Command } from './index.js'
import { askClaude, ClaudeUnavailableError } from '../claude.js'
import { COLOR_INFO, errorEmbed } from '../format.js'
import { getHistory, appendTurns } from '../memory.js'
import { getFavoriteTeam } from '../profiles.js'
import { checkAllowance, recordUsage, refusalMessage } from '../limits.js'
import { buildAnswerPayloads } from '../render/answer.js'

const definition = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('Ask the CFB stats analyst anything (AI-powered)')
  .addStringOption(option =>
    option.setName('question').setDescription('Your college-football question').setRequired(true)
  )

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const question = interaction.options.getString('question', true)
  const userId = interaction.user.id
  const channelId = interaction.channelId

  const allowance = checkAllowance(userId)
  if (!allowance.ok) {
    await interaction.reply({ content: refusalMessage(allowance), flags: MessageFlags.Ephemeral })
    return
  }

  // MUST happen before any slow work -- the 3s interaction deadline applies
  // to gateway bots too.
  await interaction.deferReply()

  try {
    const history = getHistory(channelId)
    const favoriteTeam = await getFavoriteTeam(userId)
    const userContext = favoriteTeam ? `this user's favorite team is ${favoriteTeam}` : undefined

    const { text, usage, model } = await askClaude(question, { history, userContext })
    recordUsage(userId, usage, model)
    const payloads = buildAnswerPayloads(text, { accentColor: COLOR_INFO })

    if (payloads.length === 0) {
      await interaction.editReply({
        embeds: [errorEmbed('No answer', 'The stats brain came back empty — try rephrasing your question.')],
      })
      return
    }

    // The deferred reply may carry leftover content/embeds fields from
    // Discord's placeholder -- null them out explicitly alongside
    // components/flags. discord.js 14.27's InteractionEditReplyOptions types
    // `embeds` as an array (no `null` variant, unlike `content`) and has no
    // `poll`/`stickers` field at all, so `embeds: []` is the type-correct
    // equivalent and poll/stickers are omitted (neither is ever set on this
    // reply to begin with).
    await interaction.editReply({ ...payloads[0]!, content: null, embeds: [] })
    for (const payload of payloads.slice(1)) {
      await interaction.followUp(payload)
    }

    appendTurns(channelId, question, text)
  } catch (err) {
    if (err instanceof ClaudeUnavailableError) {
      await interaction.editReply({ embeds: [errorEmbed('Stats brain unavailable', err.message)] })
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    await interaction.editReply({ embeds: [errorEmbed('Something went wrong', message)] })
  }
}

export const askCommand: Command = { definition, execute }
