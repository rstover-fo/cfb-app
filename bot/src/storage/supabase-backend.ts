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
import type { BotSettings, MemoryAtom, StorageBackend, UserProfile } from './backend.js'

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
    // Read-merge-write: a PostgREST upsert replaces unspecified columns with
    // their defaults on conflict targets we send, so merge with the current
    // profile first. Safe because this process is the schema's only writer.
    const existing = (await this.getProfile(userId)) ?? { memoryEnabled: true }
    const merged: UserProfile = { ...existing, ...patch }
    const { error } = await this.client.from('user_profiles').upsert({
      user_id: userId,
      favorite_team: merged.favoriteTeam ?? null,
      memory_enabled: merged.memoryEnabled,
      set_at: merged.setAt ?? null,
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(`profile write failed: ${error.message}`)
    this.profileCache.set(userId, merged)
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
}
