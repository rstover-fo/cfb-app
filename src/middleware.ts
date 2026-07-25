import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // Excludes static assets, plus the two route handlers that authenticate by
  // something other than a cookie and therefore have no use for a session
  // refresh:
  //   api/mcp        -- src/app/api/[transport]/route.ts, bearer token via
  //                     src/lib/mcp/auth.ts
  //   api/stripe     -- Phase 2 webhook, which must reach its handler with the
  //                     raw body untouched for signature verification
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/mcp|api/[^/]+/mcp|api/stripe|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
