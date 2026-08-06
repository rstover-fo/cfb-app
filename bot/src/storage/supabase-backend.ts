/**
 * Supabase storage backend: the `bot` Postgres schema (see
 * bot/supabase/migrations/), accessed with the service-role key via
 * supabase-js. Chosen by storage/index.ts when SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are both configured.
 *
 * The bot is a single process and the only writer of this schema, so
 * profiles and settings use a write-through in-memory cache: first read per
 * key hits the network, later reads (e.g. claude.ts's per-turn
 * getLoreEnabled()) are served from memory, and successful writes update
 * the cache. Memory atoms are NOT cached -- they change on every extraction
 * and are read at most once per conversational turn.
 *
 * Per the StorageBackend error contract: reads never throw (log, then fall
 * back to the cached value if any, else the default), writes throw so
 * commands can tell the user the save failed. Every request carries a 5s
 * abort timeout -- supabase-js has no default fetch timeout, and a hung
 * call must never wedge an answer.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * supabase-js pins the schema name into the client's type parameters; the
 * bot's client points at the `bot` schema while tests inject fakes typed
 * against the default. The schema name carries no type information we rely
 * on (row types are asserted per-query), so accept any parameterization.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any, any, any>

import { loadConfig } from '../config.js'
import type { BotSettings, MemoryAtom, NewPick, Pick, PickFilter, PickPatch, PickStatus, StorageBackend, UserProfile } from './backend.js'

const REQUEST_TIMEOUT_MS = 5_000
const SETTINGS_KEY = 'global'

interface ProfileRow {
  user_id: string
  favorite_team: string | null
  memory_enabled: boolean
  set_at: string | null
}

interface SettingsRow {
  lore_enabled: boolean
}

interface AtomRow {
  id: string
  content: string
  kind: MemoryAtom['kind']
  source: MemoryAtom['source']
  created_at: string
  updated_at: string
}

interface PickRow {
  id: string
  user_id: string
  guild_id: string | null
  kind: Pick['kind']
  team: string
  opponent: string | null
  game_id: number | null
  season: number
  week: number | null
  direction: Pick['direction'] | null
  line: number | string | null
  pick_home: boolean | null
  statement: string
  status: Pick['status']
  settled_detail: string | null
  created_at: string
  settled_at: string | null
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
    settledDetail: row.settled_detail ?? undefined,
    createdAt: row.created_at,
    settledAt: row.settled_at ?? undefined,
  }
}

function timeoutFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  return fetch(input, { ...init, signal })
}

function rowToProfile(row: ProfileRow): UserProfile {
  return {
    favoriteTeam: row.favorite_team ?? undefined,
    memoryEnabled: row.memory_enabled,
    setAt: row.set_at ?? undefined,
  }
}

export class SupabaseBackend implements StorageBackend {
  readonly name = 'supabase' as const

  private readonly client: AnySupabaseClient
  /** Presence of a key means "fetched"; null means "known to have no row". */
  private readonly profileCache = new Map<string, UserProfile | null>()
  private settingsCache: BotSettings | null = null

  /** `client` is injectable for tests; the default builds from config. */
  constructor(client?: AnySupabaseClient) {
    if (client) {
      this.client = client
      return
    }
    const config = loadConfig()
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      throw new Error('SupabaseBackend requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
    }
    this.client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: 'bot' },
      global: { fetch: timeoutFetch },
    })
  }

  // --- profiles ---

  async getProfile(userId: string): Promise<UserProfile | undefined> {
    if (this.profileCache.has(userId)) return this.profileCache.get(userId) ?? undefined
    try {
      const { data, error } = await this.client
        .from('user_profiles')
        .select('user_id, favorite_team, memory_enabled, set_at')
        .eq('user_id', userId)
        .maybeSingle<ProfileRow>()
      if (error) throw new Error(error.message)
      this.profileCache.set(userId, data ? rowToProfile(data) : null)
      return data ? rowToProfile(data) : undefined
    } catch (err) {
      console.error('[storage] profile read failed:', err instanceof Error ? err.message : err)
      return undefined
    }
  }

  async upsertProfile(userId: string, patch: Partial<UserProfile>): Promise<void> {
    // Patch-only upsert: send just the supplied columns. On conflict,
    // PostgREST's ON CONFLICT DO UPDATE touches only the columns in the
    // payload, so untouched fields (e.g. favorite_team during /memory off)
    // survive even when a prior read failed -- no read-merge-write, and no
    // way for a transient read failure to make us clobber a row with
    // defaults. Fresh rows get the table defaults for absent columns.
    const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() }
    if (patch.favoriteTeam !== undefined) row.favorite_team = patch.favoriteTeam
    if (patch.memoryEnabled !== undefined) row.memory_enabled = patch.memoryEnabled
    if (patch.setAt !== undefined) row.set_at = patch.setAt

    const { error } = await this.client.from('user_profiles').upsert(row)
    if (error) throw new Error(`profile write failed: ${error.message}`)

    // Merge into the cache only when we actually know the current profile;
    // otherwise drop the entry so the next read fetches the merged truth.
    const cached = this.profileCache.get(userId)
    if (cached) {
      this.profileCache.set(userId, { ...cached, ...patch })
    } else {
      this.profileCache.delete(userId)
    }
  }

  // --- settings ---

  async getSettings(): Promise<BotSettings> {
    if (this.settingsCache) return this.settingsCache
    try {
      const { data, error } = await this.client
        .from('app_settings')
        .select('lore_enabled')
        .eq('key', SETTINGS_KEY)
        .maybeSingle<SettingsRow>()
      if (error) throw new Error(error.message)
      this.settingsCache = { loreEnabled: data?.lore_enabled ?? true }
      return this.settingsCache
    } catch (err) {
      console.error('[storage] settings read failed:', err instanceof Error ? err.message : err)
      return { loreEnabled: true }
    }
  }

  async saveSettings(patch: Partial<BotSettings>): Promise<void> {
    const current = await this.getSettings()
    const merged: BotSettings = { ...current, ...patch }
    const { error } = await this.client.from('app_settings').upsert({
      key: SETTINGS_KEY,
      lore_enabled: merged.loreEnabled,
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(`settings write failed: ${error.message}`)
    this.settingsCache = merged
  }

  // --- memory atoms ---

  async listAtoms(userId: string): Promise<MemoryAtom[]> {
    try {
      const { data, error } = await this.client
        .from('memory_atoms')
        .select('id, content, kind, source, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
      if (error) throw new Error(error.message)
      return ((data ?? []) as AtomRow[]).map(row => ({
        id: row.id,
        content: row.content,
        kind: row.kind,
        source: row.source,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    } catch (err) {
      console.error('[storage] atoms read failed:', err instanceof Error ? err.message : err)
      return []
    }
  }

  async insertAtom(userId: string, atom: Omit<MemoryAtom, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    const { error } = await this.client.from('memory_atoms').insert({
      user_id: userId,
      content: atom.content,
      kind: atom.kind,
      source: atom.source,
    })
    if (error) throw new Error(`atom insert failed: ${error.message}`)
  }

  async deleteAtoms(userId: string, atomIds?: string[]): Promise<number> {
    let query = this.client.from('memory_atoms').delete().eq('user_id', userId)
    if (atomIds) query = query.in('id', atomIds)
    // select() makes PostgREST return the deleted rows so we can count them.
    const { data, error } = await query.select('id')
    if (error) throw new Error(`atom delete failed: ${error.message}`)
    return (data ?? []).length
  }

  // --- picks (no caching: read at most once per turn/settlement run) ---

  async listPicks(filter: PickFilter = {}): Promise<Pick[]> {
    try {
      let query = this.client.from('picks').select('*')
      if (filter.userId !== undefined) query = query.eq('user_id', filter.userId)
      if (filter.guildId !== undefined) query = query.eq('guild_id', filter.guildId)
      if (filter.status !== undefined) query = query.eq('status', filter.status)
      const { data, error } = await query.order('created_at', { ascending: true }).order('id', { ascending: true })
      if (error) throw new Error(error.message)
      return ((data ?? []) as PickRow[]).map(rowToPick)
    } catch (err) {
      console.error('[storage] picks read failed:', err instanceof Error ? err.message : err)
      return []
    }
  }

  async insertPick(pick: NewPick): Promise<void> {
    const { error } = await this.client.from('picks').insert({
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
    if (error) throw new Error(`pick insert failed: ${error.message}`)
  }

  async updatePick(id: string, patch: PickPatch, ifStatus?: PickStatus): Promise<boolean> {
    const row: Record<string, unknown> = {}
    if (patch.status !== undefined) row.status = patch.status
    if (patch.settledDetail !== undefined) row.settled_detail = patch.settledDetail
    if (patch.settledAt !== undefined) row.settled_at = patch.settledAt
    if (patch.line !== undefined) row.line = patch.line
    let query = this.client.from('picks').update(row).eq('id', id)
    // The status guard rides the UPDATE's WHERE clause, so the conditional
    // transition is atomic on the database side -- a stale settlement can
    // never overwrite a void that landed in between.
    if (ifStatus !== undefined) query = query.eq('status', ifStatus)
    // select() returns the patched rows: zero means unknown id or the guard
    // didn't match -- either way, nothing was updated.
    const { data, error } = await query.select('id')
    if (error) throw new Error(`pick update failed: ${error.message}`)
    return (data ?? []).length > 0
  }
}
