import { defineHook } from 'eve/hooks'
import { storeTurn } from '@/lib/memory/client'
import { runTurnExtraction } from '@/lib/agent/extraction'
import { getUserProfile } from '@/lib/agent/bot-data'

/**
 * Post-turn memory capture: the eve twin of the bot's fire-and-forget
 * extraction (bot/src/memory-extract.ts). Hooks are observe-only and
 * at-least-once, so this buffers each turn's question/answer from the
 * message events (message.received carries the user text, message.completed
 * the assistant text) and flushes ONCE on turn.completed:
 *
 *   1. store the Q&A pair in user-scoped conversation memory
 *   2. run the Haiku extraction (durable memories + ledger picks)
 *
 * Failure contract ported intact: nothing here may throw, delay, or affect
 * the answer the user already received; errors are logged and swallowed,
 * logs carry counts only, never user text. Identity comes strictly from
 * auth.current -- in a multi-user Discord channel session the captured turn
 * belongs to whoever sent THIS message.
 */

interface PendingTurn {
  userId?: string
  guildId?: string
  question?: string
  answer?: string
  processed: boolean
  at: number
}

const TURN_TTL_MS = 30 * 60 * 1000
const pending = new Map<string, PendingTurn>()

function turnEntry(turnId: string): PendingTurn {
  const now = Date.now()
  for (const [id, entry] of pending) {
    if (now - entry.at > TURN_TTL_MS) pending.delete(id)
  }
  const existing = pending.get(turnId)
  if (existing) return existing
  const fresh: PendingTurn = { processed: false, at: now }
  pending.set(turnId, fresh)
  return fresh
}

export default defineHook({
  events: {
    'message.received': (event, ctx) => {
      const caller = ctx.session.auth.current
      if (!caller || caller.principalType !== 'user') return
      const entry = turnEntry(event.data.turnId)
      entry.userId = caller.principalId
      const guildId = caller.attributes.guildId
      entry.guildId = typeof guildId === 'string' ? guildId : undefined
      // First user message of the turn wins -- retries/continuations must
      // not overwrite the question with follow-up machinery.
      entry.question ??= event.data.message
    },

    'message.completed': event => {
      if (event.data.message === null) return
      const entry = turnEntry(event.data.turnId)
      // Last completed assistant message wins: multi-step turns emit one
      // per model step and the final one is the visible answer.
      entry.answer = event.data.message
    },

    'turn.completed': (event, ctx) => {
      const entry = pending.get(event.data.turnId)
      if (!entry || entry.processed) return
      entry.processed = true
      const { userId, guildId, question, answer } = entry
      pending.delete(event.data.turnId)
      if (!userId || !question || !answer) return

      const sessionId = ctx.session.id
      // AWAITED, not fire-and-forget: on serverless the runtime may freeze
      // the function the moment its response completes, killing detached
      // work. Hooks accept a returned promise and turn.completed fires after
      // the visible answer, so awaiting here costs the user nothing and
      // guarantees capture runs to completion. Both callees swallow their
      // own errors; this catch is the belt-and-suspenders backstop.
      return (async () => {
        // The /memory off promise covers the raw transcript, not just the
        // extracted atoms: check the toggle BEFORE storeTurn so an opted-out
        // user's verbatim Q&A never reaches the graph. (Extraction re-checks
        // internally; profile reads fail open to enabled, per bot-data.)
        const profile = await getUserProfile(userId)
        if (profile.memoryEnabled === false) return
        await storeTurn({ userId, sessionId, question, answer })
        await runTurnExtraction({ userId, guildId, question, answer })
      })().catch(err => {
        console.error('[post-turn] capture failed:', err instanceof Error ? err.message : err)
      })
    },
  },
})
