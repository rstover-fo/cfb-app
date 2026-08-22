/**
 * Read-side access to the Supabase `bot` schema for the eve agent runtime:
 * user profiles (/myteam favorite, memory toggle), the /lore setting, and the
 * picks ledger that feed per-turn user context.
 *
 * This mirrors bot/src/storage/supabase-backend.ts on the columns it touches
 * -- the bot remains the writer of this schema; the agent only reads here.
 * Same contracts as the bot backend: service-role key, 5s abort timeout on
 * every request, and READS NEVER THROW -- any failure logs and falls back to
 * a default so an answer is never blocked by storage.
 *
 * Next-free on purpose (plain @supabase/supabase-js, no next/headers): this
 * module is evaluated by the eve runtime outside any Next request context.
 * Returns null clients when SUPABASE_SERVICE_ROLE_KEY is absent so local dev
 * without secrets degrades to empty context instead of crashing.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const REQUEST_TIMEOUT_MS = 5_000
const SETTINGS_KEY = 'global'
const GLOBAL_KEY = Symbol.for('cfb-app.agent.bot-data-client')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any, any, any>

type GlobalWithClient = typeof globalThis & { [GLOBAL_KEY]?: AnySupabaseClient | null }

function timeoutFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  return fetch(input, { ...init, signal })
}

function getBotClient(): AnySupabaseClient | null {
  const g = globalThis as GlobalWithClient
  if (g[GLOBAL_KEY] !== undefined) return g[GLOBAL_KEY]
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.warn('[agent/bot-data] SUPABASE_SERVICE_ROLE_KEY not set; user context will be empty')
    g[GLOBAL_KEY] = null
    return null
  }
  g[GLOBAL_KEY] = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'bot' },
    global: { fetch: timeoutFetch },
  })
  return g[GLOBAL_KEY]
}

/** Test-only: clears the memoized client so env changes take effect. */
export function resetBotDataForTests(): void {
  delete (globalThis as GlobalWithClient)[GLOBAL_KEY]
}

export interface AgentUserProfile {
  favoriteTeam?: string
  memoryEnabled: boolean
}

export async function getUserProfile(userId: string): Promise<AgentUserProfile> {
  const fallback: AgentUserProfile = { memoryEnabled: true }
  const client = getBotClient()
  if (!client) return fallback
  try {
    const { data, error } = await client
      .from('user_profiles')
      .select('favorite_team, memory_enabled')
      .eq('user_id', userId)
      .maybeSingle<{ favorite_team: string | null; memory_enabled: boolean }>()
    if (error) throw new Error(error.message)
    if (!data) return fallback
    return { favoriteTeam: data.favorite_team ?? undefined, memoryEnabled: data.memory_enabled }
  } catch (err) {
    console.error('[agent/bot-data] profile read failed:', err instanceof Error ? err.message : err)
    return fallback
  }
}

export async function getLoreEnabled(): Promise<boolean> {
  const client = getBotClient()
  if (!client) return true
  try {
    const { data, error } = await client
      .from('app_settings')
      .select('lore_enabled')
      .eq('key', SETTINGS_KEY)
      .maybeSingle<{ lore_enabled: boolean }>()
    if (error) throw new Error(error.message)
    return data?.lore_enabled ?? true
  } catch (err) {
    console.error('[agent/bot-data] settings read failed:', err instanceof Error ? err.message : err)
    return true
  }
}

/** The subset of a picks-ledger row the user-context block needs. */
export interface AgentPick {
  kind: 'game_winner' | 'ats' | 'season_total'
  team: string
  opponent?: string
  season: number
  week?: number
  direction?: string
  line?: number
  pickHome?: boolean
  status: 'open' | 'won' | 'lost' | 'push' | 'void'
  settledAt?: string
}

interface PickRow {
  kind: AgentPick['kind']
  team: string
  opponent: string | null
  season: number
  week: number | null
  direction: string | null
  line: number | string | null
  pick_home: boolean | null
  status: AgentPick['status']
  settled_at: string | null
  created_at: string
}

export async function listUserPicks(userId: string, guildId?: string): Promise<AgentPick[]> {
  const client = getBotClient()
  if (!client) return []
  try {
    let query = client
      .from('picks')
      .select('kind, team, opponent, season, week, direction, line, pick_home, status, settled_at, created_at')
      .eq('user_id', userId)
    if (guildId !== undefined) query = query.eq('guild_id', guildId)
    const { data, error } = await query.order('created_at', { ascending: true }).order('id', { ascending: true })
    if (error) throw new Error(error.message)
    return ((data ?? []) as PickRow[]).map(row => ({
      kind: row.kind,
      team: row.team,
      opponent: row.opponent ?? undefined,
      season: row.season,
      week: row.week ?? undefined,
      direction: row.direction ?? undefined,
      line: row.line === null ? undefined : Number(row.line),
      pickHome: row.pick_home ?? undefined,
      status: row.status,
      settledAt: row.settled_at ?? undefined,
    }))
  } catch (err) {
    console.error('[agent/bot-data] picks read failed:', err instanceof Error ? err.message : err)
    return []
  }
}
