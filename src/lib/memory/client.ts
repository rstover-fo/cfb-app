/**
 * Client for the cfb-agent-memory service (memory-server/ -- the user-scoped
 * FastAPI wrapper over neo4j-agent-memory, deployed on Railway). Plain fetch
 * plus a short-lived HS256 bearer JWT minted per request with
 * MEMORY_JWT_SECRET (iss cfb-app / aud cfb-memory -- must match the server).
 *
 * Error contract mirrors the bot's storage layer: READS NEVER THROW (log,
 * fall back to empty), and the write helpers return null/false on failure
 * instead of throwing -- an answer or a fire-and-forget hook must never be
 * blocked by memory. When MEMORY_ENDPOINT/MEMORY_JWT_SECRET are unset every
 * call is a logged no-op, so environments without memory config still work.
 */
import { createHmac } from 'node:crypto'

const REQUEST_TIMEOUT_MS = 10_000
const JWT_TTL_SECONDS = 120

export interface MemoryRow {
  id: string
  kind: 'preference' | 'fact' | 'take'
  content: string
  context: string | null
  createdAt: string | null
  updatedAt: string | null
}

interface MemoryConfig {
  baseUrl: string
  secret: string
}

let warnedUnconfigured = false

function getConfig(): MemoryConfig | null {
  const rawEndpoint = process.env.MEMORY_ENDPOINT
  const secret = process.env.MEMORY_JWT_SECRET
  if (!rawEndpoint || rawEndpoint.trim() === '' || !secret || secret.trim() === '') {
    if (!warnedUnconfigured) {
      console.warn('[memory] MEMORY_ENDPOINT/MEMORY_JWT_SECRET not set; memory is disabled')
      warnedUnconfigured = true
    }
    return null
  }
  // Tolerate the earlier provisioning shape that pointed at an /mcp path.
  const baseUrl = rawEndpoint.trim().replace(/\/mcp\/?$/, '').replace(/\/+$/, '')
  return { baseUrl, secret }
}

export function memoryConfigured(): boolean {
  return getConfig() !== null
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function mintJwt(secret: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({ iss: 'cfb-app', aud: 'cfb-memory', iat: now, exp: now + JWT_TTL_SECONDS })
  )
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  const config = getConfig()
  if (!config) return null
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${mintJwt(config.secret)}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}${text ? ` -- ${text.slice(0, 200)}` : ''}`)
    }
    return (await response.json()) as T
  } catch (err) {
    console.error(`[memory] ${path} failed:`, err instanceof Error ? err.message : err)
    return null
  }
}

/** Stores one Q&A turn in user-scoped conversation memory. */
export async function storeTurn(params: {
  userId: string
  sessionId: string
  question: string
  answer: string
}): Promise<boolean> {
  const result = await post<{ stored: number }>('/turn', {
    user: params.userId,
    session_id: params.sessionId,
    question: params.question,
    answer: params.answer,
  })
  return result !== null
}

/** Stores one durable memory (bot-atom semantics). Null on failure. */
export async function rememberMemory(params: {
  userId: string
  kind: MemoryRow['kind']
  content: string
  context?: string
  metadata?: Record<string, unknown>
}): Promise<MemoryRow | null> {
  const result = await post<{ memory: MemoryRow }>('/remember', {
    user: params.userId,
    kind: params.kind,
    content: params.content,
    context: params.context ?? null,
    metadata: params.metadata ?? null,
  })
  return result?.memory ?? null
}

/** Everything known about the user, oldest first (stable numbering). */
export async function getMemories(userId: string): Promise<MemoryRow[]> {
  const result = await post<{ memories: MemoryRow[] }>('/context', { user: userId })
  return result?.memories ?? []
}

/** The user's memories ranked for a query. */
export async function searchMemories(userId: string, query: string, limit = 8): Promise<MemoryRow[]> {
  const result = await post<{ memories: MemoryRow[] }>('/search', { user: userId, query, limit })
  return result?.memories ?? []
}

/**
 * Forgets one memory (by id) or all of the user's memories. Returns the
 * number deleted, or null when the service call failed (callers surface
 * "could not do that" rather than claiming success).
 */
export async function forgetMemories(userId: string, memoryId?: string): Promise<number | null> {
  const result = await post<{ deleted: number }>('/forget', {
    user: userId,
    memory_id: memoryId ?? null,
  })
  return result?.deleted ?? null
}
