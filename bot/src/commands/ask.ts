/**
 * /ask -- the conversational path. Defers immediately (Claude + the
 * server-side MCP tool loop routinely takes 10-30s, far past Discord's 3s
 * interaction deadline), then edits the deferred reply with the first chunk
 * and follows up with the rest.
 */
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import type { Command } from './index.js'
import { askClaude, ClaudeUnavailableError } from '../claude.js'
import { errorEmbed, splitMessage } from '../format.js'

const definition = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('Ask the CFB stats analyst anything (AI-powered)')
  .addStringOption(option =>
    option.setName('question').setDescription('Your college-football question').setRequired(true)
  )

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const question = interaction.options.getString('question', true)

  // MUST happen before any slow work -- the 3s interaction deadline applies
  // to gateway bots too.
  await interaction.deferReply()

  try {
    const { text } = await askClaude(question)
    const chunks = splitMessage(text)

    if (chunks.length === 0) {
      await interaction.editReply({
        embeds: [errorEmbed('No answer', 'The stats brain came back empty — try rephrasing your question.')],
      })
      return
    }

    await interaction.editReply(chunks[0]!)
    for (const chunk of chunks.slice(1)) {
      await interaction.followUp(chunk)
    }
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
