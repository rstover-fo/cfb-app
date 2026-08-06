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

export const USER_CONTEXT_MAX_CHARS = 600

/** Builds the per-turn user context string, or undefined when there is nothing to say. */
export async function buildUserContext(userId: string): Promise<string | undefined> {
  const favoriteTeam = await getFavoriteTeam(userId)
  const parts: string[] = []
  if (favoriteTeam) parts.push(`this user's favorite team is ${favoriteTeam}`)

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
