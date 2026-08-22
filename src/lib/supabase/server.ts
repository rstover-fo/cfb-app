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

type GlobalWithClient = typeof globalThis & { [GLOBAL_KEY]?: SupabaseClient }

export async function createClient(): Promise<SupabaseClient> {
  const g = globalThis as GlobalWithClient
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      // No session persistence or token refresh: this is an anon data-plane
      // client shared process-wide, never a user's authenticated client.
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
  }
  return g[GLOBAL_KEY]
}
