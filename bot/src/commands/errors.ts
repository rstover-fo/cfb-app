/**
 * Shared thrown-error -> embed mapping for command execute()/autocomplete()
 * handlers. Only for genuine exceptions (McpAuthError/McpTimeoutError/any
 * other thrown error) -- a tool's own "No ... found"/"Error: ..." string
 * result is not an exception and is rendered by each command directly via
 * format.ts's errorEmbed with a command-specific title.
 */
import type { EmbedBuilder } from 'discord.js'
import { McpAuthError, McpTimeoutError } from '../mcp-client.js'
import { errorEmbed } from '../format.js'

export function mcpErrorEmbed(err: unknown): EmbedBuilder {
  if (err instanceof McpAuthError) {
    return errorEmbed(
      'Authentication error',
      'The bot could not authenticate with the stats server. Ask an admin to check the MCP_AUTH_TOKEN configuration.'
    )
  }
  if (err instanceof McpTimeoutError) {
    return errorEmbed('Request timed out', 'The stats server took too long to respond. Try again in a moment.')
  }
  const message = err instanceof Error ? err.message : String(err)
  return errorEmbed('Something went wrong', `Unexpected error talking to the stats server: ${message}`)
}

/** Parses JSON, returning null instead of throwing on failure. */
export function tryParseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}
