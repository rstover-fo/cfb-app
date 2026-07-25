import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase auth token and writes the refreshed cookie.
 *
 * This exists because Server Components cannot set cookies -- see the
 * swallowed failure in `src/lib/supabase/server.ts`. When an access token
 * expires mid-session the refresh has to happen somewhere that *can* write,
 * which means middleware or a Route Handler. Without this, users are
 * spuriously signed out roughly an hour into a session.
 *
 * Three footguns, all load-bearing:
 *
 * 1. Return the exact `supabaseResponse` object built here. Constructing a
 *    fresh NextResponse drops the refreshed Set-Cookie headers and produces an
 *    infinite sign-in loop. To redirect, build the redirect and copy
 *    `supabaseResponse.cookies.getAll()` onto it.
 * 2. Put no logic between `createServerClient` and `getUser()`. Anything
 *    touching cookies in between desynchronizes the request/response jars.
 * 3. `getUser()`, never `getSession()`. In middleware `getSession()` does not
 *    revalidate the JWT and will accept a forged cookie.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not move, wrap, or add anything above this call.
  await supabase.auth.getUser()

  return supabaseResponse
}
