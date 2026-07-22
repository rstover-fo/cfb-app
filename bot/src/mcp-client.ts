/**
 * MCP client wrapper over cfb-app's hosted `/api/mcp` (streamable HTTP,
 * bearer auth). One lazily-created singleton `Client`; a call that fails
 * with anything other than an auth/timeout error drops the client and
 * retries once against a freshly-connected one (handles a stale/dropped
 * HTTP session without the caller having to know about reconnects).
 *
 * Server contract (src/lib/mcp/tools.ts + docs/MCP.md, both in the parent
 * app): every tool call's content[0].text is either
 *   - pretty-printed JSON matching { _source, count, rows } (the flat
 *     envelope used by get_rankings/get_leaderboard/get_matchup_edges/
 *     get_live_scoreboard), or
 *   - JSON that parses fine but doesn't match that flat shape (the
 *     composite tools -- query_team, query_matchup, search_players -- nest
 *     multiple envelopes under named keys), or
 *   - a plain string ("No games found...", "Error: ...").
 * Only the first case is unwrapped into `kind: 'rows'` here; everything
 * else (including composite JSON) comes back as `kind: 'message'` with the
 * raw text, and callers that need the nested shape parse it themselves --
 * see src/commands/team.ts, matchup.ts, player.ts.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { loadConfig } from './config.js'

const CALL_TIMEOUT_MS = 55_000

export class McpAuthError extends Error {
  constructor(message = 'The MCP server rejected our auth token (401).') {
    super(message)
    this.name = 'McpAuthError'
  }
}

export class McpTimeoutError extends Error {
  constructor(message = 'The MCP server call timed out.') {
    super(message)
    this.name = 'McpTimeoutError'
  }
}

export type ToolResult =
  | { kind: 'rows'; source: string; count: number; rows: unknown[] }
  | { kind: 'message'; text: string }

let clientPromise: Promise<Client> | null = null

async function createConnectedClient(): Promise<Client> {
  const config = loadConfig()
  const client = new Client({ name: 'cfb-bot', version: '0.1.0' }, { capabilities: {} })
  const transport = new StreamableHTTPClientTransport(new URL(config.mcpUrl), {
    requestInit: { headers: { Authorization: `Bearer ${config.mcpAuthToken}` } },
  })
  await client.connect(transport)
  return client
}

function getClient(): Promise<Client> {
  if (!clientPromise) clientPromise = createConnectedClient()
  return clientPromise
}

/** Drops the memoized client so the next call reconnects from scratch. */
function resetClient(): void {
  clientPromise = null
}

/** Duck-types an HTTP-style numeric `code`/`status` off SDK error shapes without depending on instanceof. */
function extractStatusCode(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  const candidate = err as { code?: unknown; status?: unknown }
  if (typeof candidate.code === 'number') return candidate.code
  if (typeof candidate.status === 'number') return candidate.status
  return undefined
}

const MCP_REQUEST_TIMEOUT_CODE = -32001 // ErrorCode.RequestTimeout from @modelcontextprotocol/sdk

function isAuthError(err: unknown): boolean {
  return extractStatusCode(err) === 401
}

function isTimeoutError(err: unknown): boolean {
  if (extractStatusCode(err) === MCP_REQUEST_TIMEOUT_CODE) return true
  return err instanceof Error && /timeout|timed out/i.test(err.message)
}

function parseToolText(text: string): ToolResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { kind: 'message', text }
  }

  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    typeof (parsed as Record<string, unknown>)._source === 'string' &&
    typeof (parsed as Record<string, unknown>).count === 'number' &&
    Array.isArray((parsed as Record<string, unknown>).rows)
  ) {
    const envelope = parsed as { _source: string; count: number; rows: unknown[] }
    return { kind: 'rows', source: envelope._source, count: envelope.count, rows: envelope.rows }
  }

  // Valid JSON, but not the flat envelope (e.g. a composite tool's nested
  // shape) -- hand back the raw text so the caller can parse it itself.
  return { kind: 'message', text }
}

async function callOnce(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const client = await getClient()

  let result: Awaited<ReturnType<Client['callTool']>>
  try {
    result = await client.callTool({ name, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS })
  } catch (err) {
    if (isAuthError(err)) throw new McpAuthError()
    if (isTimeoutError(err)) throw new McpTimeoutError()
    throw err
  }

  const content = (result as { content?: unknown }).content
  const first = Array.isArray(content) ? (content[0] as { type?: string; text?: string } | undefined) : undefined
  const text = first && first.type === 'text' && typeof first.text === 'string' ? first.text : ''
  return parseToolText(text)
}

/**
 * Calls a tool on the cfb MCP server. Never throws for tool-level "no
 * results"/"error" strings (those come back as `kind: 'message'`, per the
 * server's never-throw contract) -- only throws McpAuthError/McpTimeoutError
 * for transport-level auth/timeout failures, after one reconnect-and-retry
 * for any other transport error.
 */
export async function callCfbTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  try {
    return await callOnce(name, args)
  } catch (err) {
    if (err instanceof McpAuthError || err instanceof McpTimeoutError) throw err
    // Unknown/transport error: drop the (possibly stale) client and retry once.
    resetClient()
    return await callOnce(name, args)
  }
}

/** Test-only: forces the next callCfbTool to create a fresh client. */
export function resetMcpClientForTests(): void {
  clientPromise = null
}
