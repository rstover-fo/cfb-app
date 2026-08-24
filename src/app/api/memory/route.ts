import { tokensMatch, unauthorizedResponse, type AuthResult } from '@/lib/mcp/auth'
import { getMemories, forgetMemories, memoryConfigured } from '@/lib/memory/client'

/**
 * Service-to-service memory admin for the Discord bot's /memory command
 * (show / forget [n] / forget-all). Auth is a DEDICATED bearer secret
 * (MEMORY_ADMIN_TOKEN), deliberately not MCP_AUTH_TOKEN: the MCP token is
 * handed to external MCP consumers (Claude Code/Desktop, custom connectors)
 * for public CFB data, while this route addresses private per-user memories
 * across arbitrary snowflakes -- only the bot may hold its credential. The
 * bot receives MEMORY_ADMIN_TOKEN at its Phase 3 cutover; until an operator
 * sets it, the route fails closed.
 *
 * The memory toggle (/memory on|off) is NOT here: it lives in
 * bot.user_profiles, which the bot writes directly, same as today.
 */
export const runtime = 'nodejs'
export const maxDuration = 30

const SNOWFLAKE = /^\d{5,25}$/
const BEARER_PREFIX = 'Bearer '

// Same fail-closed bearer contract as mcp/auth's checkAuth, against the
// route's own secret and header-only (no query-param fallback: the sole
// caller is the bot, which sends headers; tokens must stay out of URLs).
function checkAdminAuth(request: Request): AuthResult {
  const expected = process.env.MEMORY_ADMIN_TOKEN
  if (!expected) {
    return {
      ok: false,
      status: 401,
      message:
        'Server misconfiguration: MEMORY_ADMIN_TOKEN is not set in this deployment. ' +
        'This endpoint refuses all requests (fails closed) until an operator sets it.',
    }
  }
  const header = request.headers.get('authorization') ?? ''
  const provided =
    header.slice(0, BEARER_PREFIX.length).toLowerCase() === BEARER_PREFIX.toLowerCase()
      ? header.slice(BEARER_PREFIX.length).trim()
      : ''
  if (!provided) {
    return { ok: false, status: 401, message: 'Missing credential. Send "Authorization: Bearer <token>".' }
  }
  if (!tokensMatch(provided, expected)) {
    return { ok: false, status: 401, message: 'Invalid bearer token.' }
  }
  return { ok: true, status: 200 }
}

export async function GET(request: Request): Promise<Response> {
  const auth = checkAdminAuth(request)
  if (!auth.ok) return unauthorizedResponse(auth)
  const userId = new URL(request.url).searchParams.get('userId') ?? ''
  if (!SNOWFLAKE.test(userId)) {
    return Response.json({ error: 'userId must be a Discord snowflake' }, { status: 400 })
  }
  if (!memoryConfigured()) return Response.json({ error: 'memory not configured' }, { status: 503 })
  // getMemories never throws (empty on failure) -- for /memory show that is
  // acceptable: the bot renders "nothing stored yet" and the reason is in
  // the logs, matching the storage-read contract.
  return Response.json({ memories: await getMemories(userId) })
}

export async function DELETE(request: Request): Promise<Response> {
  const auth = checkAdminAuth(request)
  if (!auth.ok) return unauthorizedResponse(auth)
  let body: { userId?: unknown; memoryId?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const userId = typeof body.userId === 'string' ? body.userId : ''
  const memoryId = typeof body.memoryId === 'string' ? body.memoryId : undefined
  if (!SNOWFLAKE.test(userId)) {
    return Response.json({ error: 'userId must be a Discord snowflake' }, { status: 400 })
  }
  if (!memoryConfigured()) return Response.json({ error: 'memory not configured' }, { status: 503 })
  const deleted = await forgetMemories(userId, memoryId)
  // A failed delete must never read as success -- the bot tells the user
  // "could not do that" on 502, per the storage-write contract.
  if (deleted === null) return Response.json({ error: 'memory service unavailable' }, { status: 502 })
  return Response.json({ deleted })
}
