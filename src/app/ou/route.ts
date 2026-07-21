import { NextResponse } from 'next/server'
import { TEAM_THEME_COOKIE, TEAM_THEME_COOKIE_MAX_AGE } from '@/lib/theme/team-theme'

/**
 * Legacy vanity route for the retired OU-only app. Redirects into the
 * unified app's Oklahoma team page and opts the visitor into the OU theme
 * (crimson/cream "Sooner Mode") so the transition feels seamless.
 */
export function GET(request: Request) {
  const destination = new URL('/teams/oklahoma?theme=ou', request.url)
  const response = NextResponse.redirect(destination)

  response.cookies.set(TEAM_THEME_COOKIE, 'ou', {
    path: '/',
    maxAge: TEAM_THEME_COOKIE_MAX_AGE,
    sameSite: 'lax',
  })

  return response
}
