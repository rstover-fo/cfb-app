/**
 * The single per-user context builder for the conversational paths -- ask.ts
 * and mention.ts both call this instead of assembling context inline, so the
 * two can never drift. The result is passed to askClaude() as
 * opts.userContext, which appends it to the FINAL user message only -- never
 * the cached system prompt (the cache_control prefix must stay byte-stable).
 *
 * Composition: the /myteam favorite team (always, when set -- it is
 * user-declared and not governed by the memory toggle), then, when memory
 * is enabled, up to CONTEXT_MAX_CHARS of memory atoms preferring the most
 * recently updated ones.
 */
import { getFavoriteTeam, getMemoryEnabled } from './profiles.js'
import { listAtoms } from './memory-store.js'
import { listPicks, summarizeRecord } from './pick-store.js'
import type { Pick } from './storage/backend.js'

export const USER_CONTEXT_MAX_CHARS = 600
/** The picks block's slice of the budget; atoms get what's left. */
export const PICKS_CONTEXT_MAX_CHARS = 220

function describePickShort(pick: Pick): string {
  if (pick.kind === 'season_total') return `${pick.team} ${pick.direction} ${pick.line} wins (${pick.season})`
  if (pick.kind === 'game_winner') return `${pick.team} beats ${pick.opponent}${pick.week != null ? ` (wk ${pick.week})` : ''}`
  const spread = pick.line === undefined ? 'line TBD' : `${(pick.pickHome ? pick.line : -pick.line!) > 0 ? '+' : ''}${pick.pickHome ? pick.line : -pick.line!}`
  return `${pick.team} ${spread} vs ${pick.opponent}`
}

/**
 * The user's public ledger summary: record + streak + up to 2 newest open
 * picks, capped at PICKS_CONTEXT_MAX_CHARS. NOT gated on memoryEnabled --
 * picks are public ledger data; only capture rides the memory toggle.
 */
function buildPicksBlock(picks: Pick[]): string | undefined {
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
 * question was asked in (matching the /picks views there).
 */
export async function buildUserContext(userId: string, guildId?: string): Promise<string | undefined> {
  const favoriteTeam = await getFavoriteTeam(userId)
  const parts: string[] = []
  if (favoriteTeam) parts.push(`this user's favorite team is ${favoriteTeam}`)

  const picksBlock = buildPicksBlock(await listPicks(userId, guildId))
  if (picksBlock) parts.push(picksBlock)

  if (await getMemoryEnabled(userId)) {
    const atoms = await listAtoms(userId)
    if (atoms.length > 0) {
      const budget = USER_CONTEXT_MAX_CHARS - parts.join('. ').length
      // Newest-updated first: when the budget forces a cut, keep what the
      // user most recently gave us a reason to believe.
      const ranked = [...atoms].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      const kept: string[] = []
      let used = 0
      for (const atom of ranked) {
        const cost = atom.content.length + 2 // '; ' separator
        if (used + cost > budget) break
        kept.push(atom.content)
        used += cost
      }
      if (kept.length > 0) parts.push(`known about this user: ${kept.join('; ')}`)
    }
  }

  return parts.length > 0 ? parts.join('. ') : undefined
}
