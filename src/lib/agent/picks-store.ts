/**
 * bot.picks read/write for the eve agent's post-turn extraction pipeline.
 * Column mapping is a direct port of bot/src/storage/supabase-backend.ts's
 * insertPick/listPicks (same table, same snake_case columns, same PostgREST
 * numeric-string normalization for `line`). Deliberately dumb CRUD only --
 * unlike the bot's pick-store.ts, there is no supersede/cap/dedup-by-key
 * policy layer here; the only policy this pipeline needs (a re-delivery
 * dedup guard for eve's at-least-once post-turn hook) lives in
 * extraction.ts, built on top of listPicks's `createdAfter` filter.
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
    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return ((data ?? []) as PickRow[]).map(rowToPick)
  } catch (err) {
    console.error('[agent/picks-store] picks read failed:', err instanceof Error ? err.message : err)
    return []
  }
}

/**
 * Inserts one open pick (id/status/created_at assigned by the DB defaults).
 * Never throws -- returns false (logged) when the bot-schema client is
 * unconfigured or the write fails.
 */
export async function insertPick(pick: NewPick): Promise<boolean> {
  const client = getBotSchemaClient()
  if (!client) {
    console.warn('[agent/picks-store] no bot-schema client; skipping pick insert')
    return false
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
    if (error) throw new Error(error.message)
    return true
  } catch (err) {
    console.error('[agent/picks-store] pick insert failed:', err instanceof Error ? err.message : err)
    return false
  }
}
