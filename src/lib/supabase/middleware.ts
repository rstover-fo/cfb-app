import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'

/**
 * Result of refreshing a request's Supabase session in middleware: the
 * response carrying refreshed session cookies, plus the resolved user (or
 * null) so a caller can apply route-specific gates (see root middleware.ts's
 * /admin/* check) without a second round trip to Supabase Auth.
 */
export interface UpdateSessionResult {
  readonly response: NextResponse
  readonly user: User | null
}

/**
 * Standard @supabase/ssr middleware session refresh.
 *
 * Middleware runs before next/headers' request-scoped cookies() exists, so
 * cookies flow through the NextRequest/NextResponse cookie API instead (see
 * src/lib/supabase/auth-server.ts for the next/headers-based counterpart used
 * by Server Components and Route Handlers). Calling `auth.getUser()` here is
 * what advances an expiring session cookie before it reaches a Server
 * Component, which cannot write cookies itself.
 *
 * Resilient by construction: a placeholder/missing env short-circuits before
 * any Supabase call, and any error from the call itself (network failure,
 * malformed placeholder URL) is caught -- this never throws, at import time
 * or at request time, so a misconfigured deploy degrades to "no session"
 * rather than 500ing every /chat and /admin request.
 */
export async function updateSession(request: NextRequest): Promise<UpdateSessionResult> {
  let response = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return { response, user: null }
  }

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    })

    const {
      data: { user },
    } = await supabase.auth.getUser()

    return { response, user }
  } catch {
    return { response, user: null }
  }
}

/**
 * Extracts the Discord snowflake from a Supabase Auth user's linked
 * identities. Discord's OAuth identity stores the snowflake in
 * `identity_data.provider_id`; `identity.id` mirrors it for non-email
 * providers -- the two should agree. Prefer `provider_id` (the provider's own
 * claim on the identity payload) and fall back to `identity.id`.
 *
 * Pure and framework-agnostic (no next/headers dependency), so it is safe to
 * import from Edge middleware as well as Server Components -- see
 * src/lib/supabase/auth-server.ts, which re-exports this same function for
 * server-component callers.
 */
export function getDiscordSnowflake(user: Pick<User, 'identities'> | null | undefined): string | null {
  const identity = user?.identities?.find((i) => i.provider === 'discord')
  if (!identity) return null

  const providerId = identity.identity_data?.provider_id
  if (typeof providerId === 'string' && providerId.length > 0) return providerId

  return identity.id || null
}
