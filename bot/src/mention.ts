/**
 * @-mention conversational handling for messageCreate. Checks the per-user
 * cooldown/cap/budget guards first, strips the bot mention, keeps a typing
 * indicator alive while Claude works (Discord's typing state lasts ~10s, so
 * re-fire every 8s), pulls in per-channel memory plus (optionally) the
 * replied-to message as context, and replies with one Components V2 message
 * per chunk (see src/render/answer.ts, shared with /ask). Never throws --
 * every failure path ends in a friendly reply attempt.
 */
import type { Message } from 'discord.js'
import { askClaude, ClaudeUnavailableError, type HistoryTurn } from './claude.js'
import { isAllowedGuild } from './config.js'
import { COLOR_INFO } from './format.js'
import { getHistory, appendTurns } from './memory.js'
import { buildUserContext } from './user-context.js'
import { extractMemories } from './memory-extract.js'
import { checkAllowance, recordUsage, refusalMessage } from './limits.js'
import { buildAnswerPayloads } from './render/answer.js'

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

  // Public Bot is enabled on the Discord application, so anyone with the
  // (public) Application ID can add this bot to their own server. Gate on the
  // runtime allowlist before checkAllowance, the typing loop, and anything
  // that reaches the Anthropic budget -- DMs (guildId === null) are refused
  // too. Silent: replying would make the bot a spam amplifier for whoever
  // added it to an unapproved server.
  //
  // Deliberately placed AFTER the bot/mention filters above, which are free
  // and non-I/O: handleMention runs on EVERY message the bot can see, so
  // gating first would emit a warn line per message in a busy unapproved
  // guild. Here it only fires when someone actually mentioned the bot.
  if (!isAllowedGuild(message.guildId)) {
    if (message.guildId) {
      console.warn(`[mention] ignoring mention from disallowed guild ${message.guildId}`)
    }
    return
  }

  const question = stripBotMention(message.content, botUser.id)
  if (question.length === 0) {
    await message.reply(EMPTY_MENTION_HELP).catch(() => {})
    return
  }

  const userId = message.author.id
  const channelId = message.channelId

  const allowance = checkAllowance(userId)
  if (!allowance.ok) {
    await message.reply(refusalMessage(allowance)).catch(() => {})
    return
  }

  const stopTyping = startTypingLoop(message)
  try {
    // Per-channel memory first (older context), then -- if this mention
    // replies to another message -- that message's content as immediate,
    // per-turn context. The reply reference is deliberately NOT stored in
    // memory: it only applies to this one question.
    const history: HistoryTurn[] = [...getHistory(channelId)]

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

    const userContext = await buildUserContext(userId)

    const { text, usage, model, charts } = await askClaude(question, { history, userContext })
    recordUsage(userId, usage, model)
    const payloads = buildAnswerPayloads(text, { accentColor: COLOR_INFO, charts })

    if (payloads.length === 0) {
      await message.reply('The stats brain came back empty — try rephrasing your question.')
      return
    }
    // Each payload is a CV2-flagged container -- one Discord message per
    // payload. MessageReplyOptions extends MessageCreateOptions, so
    // components/flags need no special handling here (contrast ask.ts's
    // deferred editReply, which must null out the fields CV2 disables).
    for (const payload of payloads) {
      await message.reply(payload)
    }

    appendTurns(channelId, question, text)
    // Fire-and-forget: never awaited, never throws -- the answer is already
    // delivered, so a memory hiccup must not surface to the user. The pick
    // ack is a 📒 reaction on the user's own message: the leanest "heard
    // you", zero channel noise (needs only Add Reactions permission).
    extractMemories({
      userId,
      question,
      answer: text,
      onPicksRecorded: async () => {
        await message.react('📒')
      },
    })
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
