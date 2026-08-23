/**
 * Per-turn user context for the eve agent -- the port of the bot's
 * bot/src/user-context.ts, kept behavior-compatible on composition and caps
 * so the two brains answer alike until the bot path is retired.
 *
 * Composition: the /myteam favorite team (always, when set -- user-declared,
 * not governed by the memory toggle), the public picks-ledger receipts block
 * (also never gated), then either the memory context or the literal
 * memory-off marker the persona rules branch on.
 *
 * Phase 1: the memory branch is favorite-team/picks only -- graph memory
 * arrives in Phase 2 and slots into the `memoryEnabled` else-branch below.
 */
import { getUserProfile, listUserPicks, type AgentPick } from './bot-data'
import { getMemories } from '@/lib/memory/client'

export const USER_CONTEXT_MAX_CHARS = 600
/** The picks block's slice of the budget; memory gets what's left. */
export const PICKS_CONTEXT_MAX_CHARS = 220

/** The persona rules branch on this exact string -- do not reword. */
export const MEMORY_OFF_MARKER = 'this user has turned long-term memory OFF via /memory off'

interface PickRecordSummary {
  wins: number
  losses: number
  pushes: number
  streak?: string
  lastResults: ('W' | 'L' | 'P')[]
}

function summarizeRecord(picks: AgentPick[]): PickRecordSummary {
  const settled = picks
    .filter(pick => pick.status === 'won' || pick.status === 'lost' || pick.status === 'push')
    .sort((a, b) => (a.settledAt ?? '').localeCompare(b.settledAt ?? ''))

  const wins = settled.filter(pick => pick.status === 'won').length
  const losses = settled.filter(pick => pick.status === 'lost').length
  const pushes = settled.filter(pick => pick.status === 'push').length

  const newestFirst = [...settled].reverse()
  const lastResults = newestFirst
    .slice(0, 5)
    .map(pick => (pick.status === 'won' ? 'W' : pick.status === 'lost' ? 'L' : 'P') as 'W' | 'L' | 'P')

  let streak: string | undefined
  const decisive = newestFirst.filter(pick => pick.status !== 'push')
  if (decisive.length > 0) {
    const side = decisive[0]!.status
    let run = 0
    for (const pick of decisive) {
      if (pick.status !== side) break
      run++
    }
    streak = `${side === 'won' ? 'W' : 'L'}${run}`
  }

  return { wins, losses, pushes, streak, lastResults }
}

function describePickShort(pick: AgentPick): string {
  if (pick.kind === 'season_total') return `${pick.team} ${pick.direction} ${pick.line} wins (${pick.season})`
  if (pick.kind === 'game_winner') return `${pick.team} beats ${pick.opponent}${pick.week != null ? ` (wk ${pick.week})` : ''}`
  const spread =
    pick.line === undefined
      ? 'line TBD'
      : `${(pick.pickHome ? pick.line : -pick.line!) > 0 ? '+' : ''}${pick.pickHome ? pick.line : -pick.line!}`
  return `${pick.team} ${spread} vs ${pick.opponent}`
}

/**
 * The user's public ledger summary: record + streak + up to 2 newest open
 * picks, capped at PICKS_CONTEXT_MAX_CHARS. NOT gated on memoryEnabled --
 * picks are public ledger data; only capture rides the memory toggle.
 */
function buildPicksBlock(picks: AgentPick[]): string | undefined {
  const record = summarizeRecord(picks)
  const settledCount = record.wins + record.losses + record.pushes
  const open = picks.filter(pick => pick.status === 'open')
  if (settledCount === 0 && open.length === 0) return undefined

  const parts: string[] = []
  if (settledCount > 0) {
    const recordBits = [`${record.wins}-${record.losses}${record.pushes > 0 ? `-${record.pushes}` : ''}`]
    if (record.streak) recordBits.push(`streak ${record.streak}`)
    if (record.lastResults.length > 0) recordBits.push(`last: ${record.lastResults.join(' ')}`)
    parts.push(`pick record: ${recordBits.join(', ')}`)
  }
  const newestOpen = [...open].reverse().slice(0, 2)
  if (newestOpen.length > 0) {
    parts.push(`open picks: ${newestOpen.map(describePickShort).join('; ')}`)
  }
  const block = parts.join('; ')
  return block.length > PICKS_CONTEXT_MAX_CHARS ? block.slice(0, PICKS_CONTEXT_MAX_CHARS) : block
}

/**
 * Builds the per-turn user context string, or undefined when there is
 * nothing to say. `guildId` scopes the receipts block to the guild the
 * question was asked in (undefined on the web surface: all picks).
 */
export async function buildUserContext(userId: string, guildId?: string): Promise<string | undefined> {
  const profile = await getUserProfile(userId)
  const parts: string[] = []
  if (profile.favoriteTeam) parts.push(`this user's favorite team is ${profile.favoriteTeam}`)

  const picksBlock = buildPicksBlock(await listUserPicks(userId, guildId))
  if (picksBlock) parts.push(picksBlock)

  if (!profile.memoryEnabled) {
    // The persona's memory rule branches on this: without it the model
    // would promise "it will stick" to the very users who opted out.
    parts.push(MEMORY_OFF_MARKER)
  } else {
    const memories = await getMemories(userId)
    if (memories.length > 0) {
      const budget = USER_CONTEXT_MAX_CHARS - parts.join('. ').length
      // Newest-updated first: when the budget forces a cut, keep what the
      // user most recently gave us a reason to believe. Same greedy fill
      // as the bot's atom injection.
      const ranked = [...memories].sort((a, b) =>
        (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? '')
      )
      const kept: string[] = []
      let used = 0
      for (const memory of ranked) {
        const cost = memory.content.length + 2 // '; ' separator
        if (used + cost > budget) break
        kept.push(memory.content)
        used += cost
      }
      if (kept.length > 0) parts.push(`known about this user: ${kept.join('; ')}`)
    }
  }

  return parts.length > 0 ? parts.join('. ') : undefined
}
