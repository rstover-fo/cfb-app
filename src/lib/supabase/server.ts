import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Anon-key data-plane client for the query layer (`src/lib/queries/*`), the
 * MCP tools, and the eve agent tools.
 *
 * Deliberately NOT the @supabase/ssr cookie-bound client: every read this
 * client serves is public data through the anon key, no user session is ever
 * involved, and the eve agent runtime evaluates this module graph OUTSIDE a
 * Next request context (plain Node), where `next/headers` does not exist.
 * Auth-aware code (middleware, the /chat surface) must use its own
 * request-scoped @supabase/ssr client instead of this one.
 *
 * One client per process, reused across calls (it is a stateless fetch
 * wrapper; per-request construction bought nothing). Stashed on globalThis so
 * dev HMR does not accumulate clients. The async signature is kept so the
 * many `await createClient()` call sites stay untouched.
 */
const GLOBAL_KEY = Symbol.for('cfb-app.supabase.query-client')

/**
 * Every request is aborted at 10s -- supabase-js has no default fetch
 * timeout, and one hung PostgREST call must never stall an agent turn or an
 * MCP request behind it. 10s sits deliberately ABOVE run_sql's ~8s
 * database-side statement timeout so Postgres's own (better) timeout message
 * fires first. An abort never throws out of the query layer: postgrest-js
 * converts it into a normal `{ data: null, error }` result, which surfaces
 * through the existing 'Error: <context> request failed: ...' strings.
 */
export const QUERY_TIMEOUT_MS = 10_000

type GlobalWithClient = typeof globalThis & { [GLOBAL_KEY]?: SupabaseClient }

function timeoutFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  const timeout = AbortSignal.timeout(QUERY_TIMEOUT_MS)
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  return fetch(input, { ...init, signal })
}

export async function createClient(): Promise<SupabaseClient> {
  const g = globalThis as GlobalWithClient
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      // No session persistence or token refresh: this is an anon data-plane
      // client shared process-wide, never a user's authenticated client.
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: timeoutFetch },
      }
    )
  }
  return g[GLOBAL_KEY]
}
