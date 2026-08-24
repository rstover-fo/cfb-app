import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { getDiscordSnowflake } from './middleware'

// Re-exported so callers only need `@/lib/supabase/auth-server` for the
// user + snowflake pair. The implementation lives in ./middleware because it
// has no next/headers dependency and root middleware.ts (Edge runtime) needs
// to import it directly, without pulling next/headers into that bundle.
export { getDiscordSnowflake }

/**
 * Request-scoped Supabase Auth client for Server Components and Route
 * Handlers, built the standard @supabase/ssr way from next/headers' cookies.
 *
 * `setAll` is wrapped in a try/catch: a Server Component render cannot write
 * cookies (only read them), and calling `cookieStore.set()` there throws.
 * That's expected and safe to swallow here because middleware (see
 * src/lib/supabase/middleware.ts's `updateSession`) is what actually
 * refreshes the session cookie on every request to /chat and /admin/*.
 */
export async function createAuthClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component render -- see doc comment above.
          }
        },
      },
    }
  )
}

/**
 * Resolves the current authenticated user, or null when signed out, when
 * Supabase Auth is unreachable, or when the env is a placeholder (e.g. a CI
 * build's dummy credentials). Never throws -- every /chat caller renders a
 * signed-out sign-in card instead of crashing the page.
 */
export async function getSessionUser(): Promise<User | null> {
  try {
    const supabase = await createAuthClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error) return null
    return user
  } catch {
    return null
  }
}
