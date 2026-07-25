import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Magic-link landing route. Supabase emails a link back here carrying a PKCE
 * `code`; exchanging it writes the session cookies.
 *
 * The exchange must happen in a Route Handler, not a Server Component --
 * `src/lib/supabase/server.ts` swallows cookie writes when called from an RSC,
 * so the session would silently never persist.
 *
 * Alternative not taken: Supabase also offers a `token_hash` + verifyOtp
 * variant at /auth/confirm, which requires editing the email template to emit
 * {{ .TokenHash }}. Both variants are equally exposed to link prefetching; the
 * `code` variant needs no template edit, so it is the smaller setup.
 */

/**
 * `next` arrives from an attacker-influenceable email link, so it is only
 * honored as a same-origin absolute path. Rejects protocol-relative `//evil`
 * and anything with a scheme.
 */
function safeNext(next: string | null): string {
  if (!next) return '/account'
  if (!next.startsWith('/')) return '/account'
  if (next.startsWith('//')) return '/account'
  return next
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[auth] exchangeCodeForSession failed:', error.message)
    return NextResponse.redirect(`${origin}/auth/auth-code-error`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
