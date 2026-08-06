/**
 * Policy layer over the storage backend for the prediction ledger: the
 * open-pick cap, supersede/dedup semantics, index-based voiding for /picks,
 * and the record summary shared by /picks and buildUserContext(). The
 * backends stay dumb CRUD; every rule lives here so the JSON and Supabase
 * paths can't drift (the memory-store.ts pattern).
 */
import { getStorage } from './storage/index.js'
import type { NewPick, Pick } from './storage/backend.js'

export const MAX_OPEN_PICKS_PER_USER = 15

/**
 * Serializes recordPick per user. The dedup/supersede/cap invariants rest on
 * a read-then-write, so two overlapping captures for the same user (e.g. an
 * /ask and a mention finishing together) must not interleave. An in-process
 * lock is sufficient by design: the single bot process is the schema's only
 * writer (a documented invariant of the whole storage layer) -- a database
 * transaction would only add value if multiple bot processes ever wrote
 * concurrently, which nothing here supports anyway.
 */
const userLocks = new Map<string, Promise<unknown>>()

function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const previous = userLocks.get(userId) ?? Promise.resolve()
  const run = previous.then(fn, fn)
  userLocks.set(userId, run.catch(() => {}))
  return run
}

/** All of the user's picks, every status, oldest first. `guildId` scopes to one server's ledger. */
export async function listPicks(userId: string, guildId?: string): Promise<Pick[]> {
  return getStorage().listPicks({ userId, guildId })
}

/** Open picks, oldest first -- all users when userId is omitted (settlement). */
export async function listOpenPicks(userId?: string): Promise<Pick[]> {
  return getStorage().listPicks({ userId, status: 'open' })
}

/**
 * Two picks are "the same bet" when they target the same thing: game picks
 * key on kind+game, season totals on team+season.
 */
function pickKey(pick: { kind: Pick['kind']; gameId?: number; team: string; season: number }): string {
  return pick.kind === 'season_total' ? `season:${pick.team}:${pick.season}` : `${pick.kind}:${pick.gameId}`
}

/**
 * Inserts a pick with supersede semantics: an existing OPEN pick on the same
 * key is voided ("I changed my mind") and replaced -- unless the new pick is
 * identical (same direction and line), in which case nothing is stored:
 * repeating your take isn't a second bet. Past the open cap, oldest open
 * picks are voided (anti-spam). Returns what was stored (null when deduped)
 * for the capture acknowledgment. Throws on storage write failure.
 */
export async function recordPick(userId: string, pick: NewPick): Promise<{ stored: Pick | null; superseded: number }> {
  return withUserLock(userId, async () => {
    const storage = getStorage()
    const open = await storage.listPicks({ userId, status: 'open' })

    let superseded = 0
    const key = pickKey(pick)
    for (const existing of open) {
      if (pickKey(existing) !== key) continue
      // Identical = same side backed, same direction, same line: a repeat of
      // the take, not a new bet. Anything else on the same key (flipped side,
      // moved number) supersedes.
      if (existing.team === pick.team && existing.direction === pick.direction && (existing.line ?? null) === (pick.line ?? null)) {
        return { stored: null, superseded: 0 }
      }
      await storage.updatePick(
        existing.id,
        { status: 'void', settledDetail: 'superseded by a newer pick', settledAt: new Date().toISOString() },
        'open'
      )
      superseded++
    }

    await storage.insertPick(pick)

    // Enforce the open cap AFTER insert, voiding oldest first.
    const openNow = await storage.listPicks({ userId, status: 'open' })
    if (openNow.length > MAX_OPEN_PICKS_PER_USER) {
      for (const overflow of openNow.slice(0, openNow.length - MAX_OPEN_PICKS_PER_USER)) {
        await storage.updatePick(
          overflow.id,
          { status: 'void', settledDetail: 'voided: too many open picks', settledAt: new Date().toISOString() },
          'open'
        )
      }
    }

    // Re-read by key rather than trusting position: same-key open picks were
    // just voided above, so the one open pick on this key is the insert.
    const stored = (await storage.listPicks({ userId, status: 'open' })).find(p => pickKey(p) === key) ?? null
    return { stored, superseded }
  })
}

/**
 * Settles (or voids) one pick -- a conditional open->settled transition.
 * Returns false without writing when the pick is no longer open (e.g. the
 * user voided it while a settlement pass was in flight); a stale settlement
 * must lose to a void, never overwrite it. Throws on storage write failure.
 */
export async function settlePick(id: string, status: 'won' | 'lost' | 'push' | 'void', detail: string): Promise<boolean> {
  return getStorage().updatePick(id, { status, settledDetail: detail, settledAt: new Date().toISOString() }, 'open')
}

/** Backfills a pending ATS line (only while the pick is still open). Throws on write failure. */
export async function backfillLine(id: string, line: number): Promise<boolean> {
  return getStorage().updatePick(id, { line }, 'open')
}

/**
 * /picks void: `index` is 1-based over the user's OPEN picks in this guild,
 * oldest first (the same numbering /picks me displays). Returns the voided
 * pick's statement for the confirmation reply.
 */
export async function voidPickByIndex(
  userId: string,
  index: number,
  guildId?: string
): Promise<{ voided: boolean; statement?: string }> {
  const open = await getStorage().listPicks({ userId, guildId, status: 'open' })
  const target = open[index - 1]
  if (!target) return { voided: false }
  const voided = await settlePick(target.id, 'void', 'voided by the user')
  return voided ? { voided: true, statement: target.statement } : { voided: false }
}

export interface PickRecordSummary {
  wins: number
  losses: number
  pushes: number
  /** e.g. 'W3' | 'L2'; undefined with no settled picks. Pushes/voids don't break a streak. */
  streak?: string
  /** Newest first, max 5. */
  lastResults: ('W' | 'L' | 'P')[]
}

/** Pure summary over a user's picks (any statuses; voids ignored). */
export function summarizeRecord(picks: Pick[]): PickRecordSummary {
  const settled = picks
    .filter(pick => pick.status === 'won' || pick.status === 'lost' || pick.status === 'push')
    .sort((a, b) => (a.settledAt ?? '').localeCompare(b.settledAt ?? ''))

  const wins = settled.filter(pick => pick.status === 'won').length
  const losses = settled.filter(pick => pick.status === 'lost').length
  const pushes = settled.filter(pick => pick.status === 'push').length

  const newestFirst = [...settled].reverse()
  const lastResults = newestFirst.slice(0, 5).map(pick => (pick.status === 'won' ? 'W' : pick.status === 'lost' ? 'L' : 'P') as 'W' | 'L' | 'P')

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
