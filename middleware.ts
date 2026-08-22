import { NextResponse, type NextRequest } from 'next/server'
import { updateSession, getDiscordSnowflake } from '@/lib/supabase/middleware'

// Only /chat and /admin/* require auth -- everything else is the public
// dashboard and never touches Supabase Auth.
export const config = {
  matcher: ['/chat/:path*', '/admin/:path*'],
}

function parseAdminIds(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request)

  // /chat renders its own signed-out sign-in card, so an unauthenticated
  // visitor is let straight through -- the page decides what to show.
  if (!request.nextUrl.pathname.startsWith('/admin')) {
    return response
  }

  // /admin/* requires a signed-in user whose Discord snowflake is on the
  // ADMIN_DISCORD_IDS allowlist (comma-separated env var).
  const snowflake = getDiscordSnowflake(user)
  const adminIds = parseAdminIds(process.env.ADMIN_DISCORD_IDS)
  const isAdmin = snowflake !== null && adminIds.includes(snowflake)

  if (!user || !isAdmin) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''

    const redirectResponse = NextResponse.redirect(url)
    // Carry over any refreshed session cookies from updateSession so the
    // redirect doesn't strand the browser on a stale/expiring cookie.
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie))
    return redirectResponse
  }

  return response
}
