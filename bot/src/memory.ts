/**
 * Per-channel conversation memory: a short ring buffer of the last few
 * user/assistant turn pairs, expiring after a period of channel inactivity.
 * Both ask.ts and mention.ts read this before calling askClaude and write to
 * it after a successful answer, so a conversation flows across turns in the
 * same Discord channel without the caller having to thread state itself.
 *
 * In-memory only (one process, per the plan) -- counters/history reset on
 * restart, which is accepted at this scale.
 */
import type { HistoryTurn } from './claude.js'

const TTL_MS = 30 * 60 * 1000 // 30 minutes of channel inactivity
const MAX_PAIRS = 6 // keep the last 6 user/assistant pairs (12 turns)

interface ChannelMemory {
  turns: HistoryTurn[]
  lastActivity: number
}

const channels = new Map<string, ChannelMemory>()

let clock: () => number = () => Date.now()

/**
 * Returns the stored turns for `channelId`, oldest first. Returns [] both
 * when there's no history yet and when the existing entry has gone stale
 * (>30min since its last activity) -- staleness also deletes the entry so it
 * doesn't linger in memory.
 */
export function getHistory(channelId: string): HistoryTurn[] {
  const entry = channels.get(channelId)
  if (!entry) return []
  if (clock() - entry.lastActivity > TTL_MS) {
    channels.delete(channelId)
    return []
  }
  // A copy, not the live array -- callers (and mocks capturing call args in
  // tests) must never observe a later appendTurns() mutate history in place.
  return [...entry.turns]
}

/**
 * Appends one user/assistant turn pair to `channelId`'s history, trimming
 * to the last MAX_PAIRS pairs and refreshing the channel's lastActivity
 * (which also un-expires it).
 */
export function appendTurns(channelId: string, userContent: string, assistantContent: string): void {
  const entry = channels.get(channelId) ?? { turns: [], lastActivity: clock() }
  entry.turns.push({ role: 'user', content: userContent }, { role: 'assistant', content: assistantContent })

  const maxTurns = MAX_PAIRS * 2
  if (entry.turns.length > maxTurns) {
    entry.turns = entry.turns.slice(entry.turns.length - maxTurns)
  }
  entry.lastActivity = clock()
  channels.set(channelId, entry)
}

/**
 * Test-only: clears all channel memory. Pass `now` to install a fake clock
 * for TTL/lastActivity bookkeeping (e.g. `vi.fn(() => currentMs)`); omit it
 * to restore the real `Date.now`.
 */
export function clearMemoryForTests(now?: () => number): void {
  channels.clear()
  clock = now ?? (() => Date.now())
}
