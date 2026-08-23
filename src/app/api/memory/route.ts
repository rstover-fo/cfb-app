import { checkAuth, unauthorizedResponse } from '@/lib/mcp/auth'
import { getMemories, forgetMemories, memoryConfigured } from '@/lib/memory/client'

/**
 * Service-to-service memory admin for the Discord bot's /memory command
 * (show / forget [n] / forget-all). Auth reuses the hosted MCP server's
 * bearer contract (MCP_AUTH_TOKEN) -- the bot already holds that token, so
 * its Phase 3 cutover needs zero new credentials for this route.
 *
 * The memory toggle (/memory on|off) is NOT here: it lives in
 * bot.user_profiles, which the bot writes directly, same as today.
 */
export const runtime = 'nodejs'
export const maxDuration = 30

const SNOWFLAKE = /^\d{5,25}$/

export async function GET(request: Request): Promise<Response> {
  const auth = checkAuth(request)
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
  const auth = checkAuth(request)
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
