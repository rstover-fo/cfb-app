import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabase/auth-server'

// Always dynamic: this handler reads the request URL's query string and
// writes auth cookies, neither of which are safe to statically cache.
export const dynamic = 'force-dynamic'

/**
 * Discord OAuth callback. Supabase Auth redirects here with either `code`
 * (exchange it for a session) or `error`/`error_description` (the provider
 * or Supabase Auth declined the flow).
 *
 * Always lands back on `next` (default /chat) on success. Any failure -- an
 * OAuth-level error, a missing code, or a failed exchange -- redirects to
 * /chat with an `error` query param instead of leaving the visitor stuck on
 * a dead-end callback URL; ChatSignInCard reads that param and shows it.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/chat'
  // Guard against an open redirect -- only ever follow a same-app relative
  // path. A bare leading '/' is not enough: '//evil.com' (and the backslash
  // variant, which the URL parser also treats as an authority separator)
  // resolves protocol-relative to another host.
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.startsWith('/\\') ? rawNext : '/chat'
  const oauthError = searchParams.get('error')

  if (oauthError) {
    const url = new URL('/chat', origin)
    url.searchParams.set('error', searchParams.get('error_description') || oauthError)
    return NextResponse.redirect(url)
  }

  if (!code) {
    const url = new URL('/chat', origin)
    url.searchParams.set('error', 'missing_code')
    return NextResponse.redirect(url)
  }

  try {
    const supabase = await createAuthClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      const url = new URL('/chat', origin)
      url.searchParams.set('error', 'auth_failed')
      return NextResponse.redirect(url)
    }
    return NextResponse.redirect(new URL(next, origin))
  } catch {
    const url = new URL('/chat', origin)
    url.searchParams.set('error', 'auth_failed')
    return NextResponse.redirect(url)
  }
}
