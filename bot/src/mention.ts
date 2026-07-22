/**
 * @-mention conversational handling for messageCreate. Strips the bot
 * mention, keeps a typing indicator alive while Claude works (Discord's
 * typing state lasts ~10s, so re-fire every 8s), optionally pulls in the
 * replied-to message as context, and replies in splitMessage chunks.
 * Never throws -- every failure path ends in a friendly reply attempt.
 */
import type { Message } from 'discord.js'
import { askClaude, ClaudeUnavailableError, type HistoryTurn } from './claude.js'
import { splitMessage } from './format.js'

const TYPING_INTERVAL_MS = 8_000

const EMPTY_MENTION_HELP =
  "Ask me a college-football question! e.g. `@CFB Bot how good is Ohio State's defense this year?` " +
  'Or use `/help` to see the slash commands.'

const GENERIC_ERROR_REPLY = 'Something went wrong answering that — try again in a minute.'

function stripBotMention(content: string, botUserId: string): string {
  // Discord renders user mentions as <@id> or <@!id> (nickname form); the
  // mention can appear anywhere in the message, so remove every occurrence.
  return content.replaceAll(new RegExp(`<@!?${botUserId}>`, 'g'), '').trim()
}

function startTypingLoop(message: Message): () => void {
  const sendTyping = (): void => {
    // sendTyping exists on every text-based channel the bot can read; guard
    // and swallow failures -- a typing blip must never take down the reply.
    if ('sendTyping' in message.channel) {
      void message.channel.sendTyping().catch(() => {})
    }
  }
  sendTyping()
  const interval = setInterval(sendTyping, TYPING_INTERVAL_MS)
  return () => clearInterval(interval)
}

export async function handleMention(message: Message): Promise<void> {
  if (message.author.bot) return

  const botUser = message.client.user
  if (!botUser || !message.mentions.users.has(botUser.id)) return

  const question = stripBotMention(message.content, botUser.id)
  if (question.length === 0) {
    await message.reply(EMPTY_MENTION_HELP).catch(() => {})
    return
  }

  const stopTyping = startTypingLoop(message)
  try {
    const history: HistoryTurn[] = []

    // If this mention replies to another message, fetch it once and prepend
    // it as labelled context so "what about them?" style questions resolve.
    if (message.reference) {
      try {
        const referenced = await message.fetchReference()
        if (referenced.content) {
          history.push({ role: 'user', content: `${referenced.author.username} said: ${referenced.content}` })
        }
      } catch {
        // Referenced message deleted/unfetchable -- answer without it.
      }
    }

    const { text } = await askClaude(question, { history })
    const chunks = splitMessage(text)

    if (chunks.length === 0) {
      await message.reply('The stats brain came back empty — try rephrasing your question.')
      return
    }
    for (const chunk of chunks) {
      await message.reply(chunk)
    }
  } catch (err) {
    const friendly = err instanceof ClaudeUnavailableError ? err.message : GENERIC_ERROR_REPLY
    if (!(err instanceof ClaudeUnavailableError)) {
      console.error('[mention] unexpected error:', err instanceof Error ? err.message : err)
    }
    await message.reply(friendly).catch(() => {})
  } finally {
    stopTyping()
  }
}
