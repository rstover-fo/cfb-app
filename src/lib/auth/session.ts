import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export interface SessionUser {
  id: string
  email: string | null
}

/**
 * The current user, or null when anonymous. Request-deduped via cache(), so
 * the layout and a page in the same render cost one auth round trip.
 *
 * Uses getUser() (which verifies the JWT with the auth server) rather than
 * getSession() (which trusts the cookie). Never throws: an auth-server failure
 * reads as "anonymous", matching the query layer's convention of degrading
 * rather than exploding a page render. That is also the fail-closed direction
 * -- a flaky auth call must never hand out access.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()

    if (error || !data.user) return null

    return { id: data.user.id, email: data.user.email ?? null }
  } catch (err) {
    console.error('[auth] getCurrentUser failed:', err)
    return null
  }
})

/**
 * Server-component / server-action guard. Redirects anonymous visitors to
 * /signin with a `next` param so they land back where they started.
 *
 * Deliberately not cache()d: redirect() throws a control-flow signal, and
 * memoizing a thrown redirect is a subtle way to break the second caller.
 */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getCurrentUser()

  if (!user) {
    const target = next ? `/signin?next=${encodeURIComponent(next)}` : '/signin'
    redirect(target)
  }

  return user
}
