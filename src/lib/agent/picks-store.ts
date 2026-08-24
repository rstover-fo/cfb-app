/**
 * bot.picks read/write for the eve agent's post-turn extraction pipeline.
 * Column mapping is a direct port of bot/src/storage/supabase-backend.ts's
 * insertPick/listPicks/updatePick (same table, same snake_case columns, same
 * PostgREST numeric-string normalization for `line`). recordPick() ports the
 * bot's pick-store.ts policy layer -- same-bet supersede, identical-repeat
 * dedup, and the open-pick cap -- so a /chat pick obeys the same ledger
 * rules as a Discord pick. extraction.ts adds one more guard on top (the
 * statement-based re-delivery dedup eve's at-least-once hook needs).
 *
 * Error contract mirrors src/lib/agent/bot-data.ts: getBotSchemaClient()
 * returns null when SUPABASE_SERVICE_ROLE_KEY is unset, and every function
 * degrades to a logged no-op (reads return [], writes return false) rather
 * than throwing -- an extraction turn must never blow up on storage.
 */
import { getBotSchemaClient } from '@/lib/agent/bot-data'

export type PickKind = 'game_winner' | 'ats' | 'season_total'
export type PickDirection = 'win' | 'cover' | 'over' | 'under'
export type PickStatus = 'open' | 'won' | 'lost' | 'push' | 'void'

/** One ledger entry, as read back from bot.picks. */
export interface Pick {
  id: string
  userId: string
  guildId?: string
  kind: PickKind
  team: string
  opponent?: string
  gameId?: number
  season: number
  week?: number
  direction?: PickDirection
  line?: number
  pickHome?: boolean
  statement: string
  status: PickStatus
  createdAt: string
}

/** Shape accepted by insertPick -- id/status/createdAt are DB-assigned. */
export type NewPick = Omit<Pick, 'id' | 'status' | 'createdAt'>

const PICK_COLUMNS =
  'id, user_id, guild_id, kind, team, opponent, game_id, season, week, direction, line, pick_home, statement, status, created_at'

interface PickRow {
  id: string
  user_id: string
  guild_id: string | null
  kind: PickKind
  team: string
  opponent: string | null
  game_id: number | null
  season: number
  week: number | null
  direction: PickDirection | null
  line: number | string | null
  pick_home: boolean | null
  statement: string
  status: PickStatus
  created_at: string
}

/** PostgREST returns numeric columns as strings; normalize once here. */
function rowToPick(row: PickRow): Pick {
  return {
    id: row.id,
    userId: row.user_id,
    guildId: row.guild_id ?? undefined,
    kind: row.kind,
    team: row.team,
    opponent: row.opponent ?? undefined,
    gameId: row.game_id ?? undefined,
    season: row.season,
    week: row.week ?? undefined,
    direction: row.direction ?? undefined,
    line: row.line === null ? undefined : Number(row.line),
    pickHome: row.pick_home ?? undefined,
    statement: row.statement,
    status: row.status,
    createdAt: row.created_at,
  }
}

export interface ListPicksOptions {
  /** Only picks created at or after this ISO timestamp. */
  createdAfter?: string
  /** Only picks in this status (e.g. 'open' for the policy layer). */
  status?: PickStatus
  /** Oldest first (the ledger's display/cap order); default newest first. */
  oldestFirst?: boolean
}

/**
 * All of the user's picks (any status), newest first. Never throws --
 * returns [] when the bot-schema client is unconfigured or the read fails
 * (logged either way).
 */
export async function listPicks(userId: string, options: ListPicksOptions = {}): Promise<Pick[]> {
  const client = getBotSchemaClient()
  if (!client) {
    console.warn('[agent/picks-store] no bot-schema client; returning no picks')
    return []
  }
  try {
    let query = client.from('picks').select(PICK_COLUMNS).eq('user_id', userId)
    if (options.createdAfter) query = query.gte('created_at', options.createdAfter)
    if (options.status) query = query.eq('status', options.status)
    const { data, error } = await query.order('created_at', { ascending: options.oldestFirst === true })
    if (error) throw new Error(error.message)
    return ((data ?? []) as PickRow[]).map(rowToPick)
  } catch (err) {
    console.error('[agent/picks-store] picks read failed:', err instanceof Error ? err.message : err)
    return []
  }
}

export type InsertPickResult = 'inserted' | 'duplicate' | 'failed'

/**
 * Inserts one open pick (id/status/created_at assigned by the DB defaults).
 * Never throws -- 'failed' (logged) when the bot-schema client is
 * unconfigured or the write fails. 'duplicate' when the database's
 * one-open-pick-per-statement constraint rejects the row
 * (bot/supabase/migrations/0005: unique on (user_id, statement) WHERE
 * status = 'open') -- another writer stored this open statement first,
 * which is the cross-instance dedup working, not a failure.
 */
export async function insertPick(pick: NewPick): Promise<InsertPickResult> {
  const client = getBotSchemaClient()
  if (!client) {
    console.warn('[agent/picks-store] no bot-schema client; skipping pick insert')
    return 'failed'
  }
  try {
    const { error } = await client.from('picks').insert({
      user_id: pick.userId,
      guild_id: pick.guildId ?? null,
      kind: pick.kind,
      team: pick.team,
      opponent: pick.opponent ?? null,
      game_id: pick.gameId ?? null,
      season: pick.season,
      week: pick.week ?? null,
      direction: pick.direction ?? null,
      line: pick.line ?? null,
      pick_home: pick.pickHome ?? null,
      statement: pick.statement,
    })
    if (error) {
      if (error.code === '23505') return 'duplicate'
      throw new Error(error.message)
    }
    return 'inserted'
  } catch (err) {
    console.error('[agent/picks-store] pick insert failed:', err instanceof Error ? err.message : err)
    return 'failed'
  }
}

export const MAX_OPEN_PICKS_PER_USER = 15

/**
 * Conditional pick update, ported from the bot backend's updatePick: the
 * `ifStatus` guard rides the UPDATE's WHERE clause so the open->void
 * transition is atomic database-side (a settlement that landed in between
 * is never overwritten). Returns false (logged) on failure or when the
 * guard didn't match -- never throws, per this module's contract.
 */
async function updatePickStatus(id: string, detail: string, ifStatus: PickStatus): Promise<boolean> {
  const client = getBotSchemaClient()
  if (!client) return false
  try {
    const { data, error } = await client
      .from('picks')
      .update({ status: 'void', settled_detail: detail, settled_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', ifStatus)
      .select('id')
    if (error) throw new Error(error.message)
    return ((data ?? []) as { id: string }[]).length > 0
  } catch (err) {
    console.error('[agent/picks-store] pick update failed:', err instanceof Error ? err.message : err)
    return false
  }
}

/**
 * Two picks are "the same bet" when they target the same thing: game picks
 * key on kind+game, season totals on team+season. (Verbatim from the bot's
 * pick-store.ts -- the two policy layers must agree on identity.)
 */
function pickKey(pick: { kind: PickKind; gameId?: number; team: string; season: number }): string {
  return pick.kind === 'season_total' ? `season:${pick.team}:${pick.season}` : `${pick.kind}:${pick.gameId}`
}

/**
 * Serializes recordPick per user within this process. The bot relies on the
 * same in-process lock under a single-writer invariant; that invariant no
 * longer holds platform-wide (bot + serverless app both write), so this lock
 * covers same-instance interleavings only -- e.g. two picks resolved from
 * one turn. Cross-instance exact-duplicate inserts are caught at the
 * database instead: the one-open-pick-per-statement unique index
 * (bot/supabase/migrations/0005) rejects the second writer with 23505,
 * which insertPick reports as 'duplicate'.
 */
const userLocks = new Map<string, Promise<unknown>>()

function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const previous = userLocks.get(userId) ?? Promise.resolve()
  const run = previous.then(fn, fn)
  userLocks.set(userId, run.catch(() => {}))
  return run
}

export type RecordPickOutcome = 'stored' | 'deduped' | 'failed'

export interface RecordPickResult {
  outcome: RecordPickOutcome
  /** Open same-bet picks voided to make room for this one. */
  superseded: number
}

/**
 * Ledger-policy insert, ported from the bot's recordPick: an existing OPEN
 * pick on the same key is voided ("I changed my mind") and replaced --
 * unless the new pick is identical (same side, direction, and line), in
 * which case nothing is stored: repeating your take isn't a second bet.
 * Past the open cap, oldest open picks are voided (anti-spam).
 *
 * Adapted to this module's no-throw contract with insert-before-void
 * ordering (the bot voids first and throws on a failed insert; here a
 * failed insert nulls, so voiding first would silently erase the user's
 * active pick with nothing replacing it -- same store-before-delete rule
 * as the memory replacement path). A failed void after a successful insert
 * leaves both open, which the next same-key pick supersedes.
 */
export async function recordPick(pick: NewPick): Promise<RecordPickResult> {
  return withUserLock(pick.userId, async () => {
    const open = await listPicks(pick.userId, { status: 'open', oldestFirst: true })

    const key = pickKey(pick)
    const toSupersede: string[] = []
    for (const existing of open) {
      if (pickKey(existing) !== key) continue
      if (
        existing.team === pick.team &&
        existing.direction === pick.direction &&
        (existing.line ?? null) === (pick.line ?? null)
      ) {
        return { outcome: 'deduped' as const, superseded: 0 }
      }
      toSupersede.push(existing.id)
    }

    const inserted = await insertPick(pick)
    // 'duplicate': the DB's open-statement constraint says another writer
    // (bot, or a concurrent instance) already stored this exact open pick --
    // the cross-instance race the in-process lock cannot see, deduped at
    // the shared-persistence layer. That writer owns any supersede cleanup.
    if (inserted === 'duplicate') return { outcome: 'deduped' as const, superseded: 0 }
    if (inserted !== 'inserted') return { outcome: 'failed' as const, superseded: 0 }

    let superseded = 0
    let supersedeFailed = false
    for (const id of toSupersede) {
      if (await updatePickStatus(id, 'superseded by a newer pick', 'open')) superseded++
      else supersedeFailed = true
    }

    // Enforce the open cap AFTER insert, voiding oldest first. Skipped when
    // a required supersede void failed: the overflow is then the stale
    // same-key pick that should have been voided, and generic eviction would
    // punish the oldest UNRELATED pick instead. The over-cap state
    // self-corrects on the next successful recordPick.
    if (!supersedeFailed) {
      const openNow = await listPicks(pick.userId, { status: 'open', oldestFirst: true })
      if (openNow.length > MAX_OPEN_PICKS_PER_USER) {
        for (const overflow of openNow.slice(0, openNow.length - MAX_OPEN_PICKS_PER_USER)) {
          await updatePickStatus(overflow.id, 'voided: too many open picks', 'open')
        }
      }
    }

    return { outcome: 'stored' as const, superseded }
  })
}
