/**
 * Lazily-created singleton Anthropic client shared by router.ts (Haiku
 * triage) and claude.ts (the MCP-connector conversational call). Kept in its
 * own module so both can import it without a router <-> claude cycle.
 *
 * ANTHROPIC_API_KEY is optional in config (Phase-A deterministic commands
 * work without it); this factory is where its absence surfaces, with a clear
 * error at first conversational use rather than at boot.
 */
import Anthropic from '@anthropic-ai/sdk'
import { loadConfig } from './config.js'

// Connector calls run the whole server-side MCP tool loop in one request --
// typical latency is 10-30s, so give the SDK generous headroom and only one
// automatic retry (a second retry would blow well past Discord patience).
const REQUEST_TIMEOUT_MS = 120_000
const MAX_RETRIES = 1

let client: Anthropic | null = null

/** Returns the shared client, throwing a readable error if ANTHROPIC_API_KEY is unset. */
export function getAnthropicClient(): Anthropic {
  if (client) return client
  const config = loadConfig()
  if (!config.anthropicApiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set -- the conversational Claude path (/ask, @mentions) requires it. ' +
        'Deterministic slash commands still work without it.'
    )
  }
  client = new Anthropic({ apiKey: config.anthropicApiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES })
  return client
}

/** Test-only: drops the memoized client so the next call re-reads config. */
export function resetAnthropicClientForTests(): void {
  client = null
}
