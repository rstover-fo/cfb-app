/**
 * Zod-validated environment configuration for the bot, plus the DEFAULT_SEASON
 * derivation (CFB_SEASON override, else an August-pivot rule).
 *
 * Parsing is lazy (loadConfig() reads process.env on first call, then memoizes)
 * so tests can set env vars before calling it and get a fresh parse via
 * resetConfigForTests(). Fails fast with a single readable error listing every
 * missing/invalid var, rather than surfacing one at a time.
 */
import { z } from 'zod'

const EnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_APP_ID: z.string().min(1, 'DISCORD_APP_ID is required'),
  DISCORD_GUILD_ID: z.string().min(1, 'DISCORD_GUILD_ID is required'),
  MCP_URL: z.string().url('MCP_URL must be a valid URL'),
  MCP_AUTH_TOKEN: z.string().min(1, 'MCP_AUTH_TOKEN is required'),
  // z.coerce.number() on an empty string coerces to 0, not undefined -- treat
  // an empty/unset CFB_SEASON as "omitted" before it reaches the coercer.
  CFB_SEASON: z
    .string()
    .optional()
    .transform(v => (v && v.trim().length > 0 ? v : undefined))
    .pipe(z.coerce.number().int().optional()),
})

export interface BotConfig {
  discordToken: string
  discordAppId: string
  discordGuildId: string
  mcpUrl: string
  mcpAuthToken: string
  /** Raw CFB_SEASON override, if set. */
  cfbSeasonOverride?: number
  /** CFB_SEASON override if set, else the August-pivot default for `now`. */
  defaultSeason: number
}

/**
 * CFB_SEASON override if given, else: August (month 8) onward implies the
 * season that just kicked off (current year); before August implies the
 * season that's still winding down from last fall (prior year).
 */
export function deriveDefaultSeason(cfbSeasonOverride?: number, now: Date = new Date()): number {
  if (cfbSeasonOverride !== undefined) return cfbSeasonOverride
  // UTC, not local time -- keeps the pivot deterministic regardless of the
  // host machine's/CI runner's timezone.
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1 // Date#getUTCMonth() is 0-indexed
  return month >= 8 ? year : year - 1
}

let cached: BotConfig | null = null

/** Parses and validates process.env, throwing a readable Error on the first call if invalid. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  if (cached) return cached

  const parsed = EnvSchema.safeParse(env)
  if (!parsed.success) {
    const lines = parsed.error.issues.map(issue => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    throw new Error(`Invalid bot configuration -- fix these environment variables:\n${lines.join('\n')}`)
  }

  const data = parsed.data
  cached = {
    discordToken: data.DISCORD_TOKEN,
    discordAppId: data.DISCORD_APP_ID,
    discordGuildId: data.DISCORD_GUILD_ID,
    mcpUrl: data.MCP_URL,
    mcpAuthToken: data.MCP_AUTH_TOKEN,
    cfbSeasonOverride: data.CFB_SEASON,
    defaultSeason: deriveDefaultSeason(data.CFB_SEASON),
  }
  return cached
}

/** The season commands should default to when the caller doesn't specify one. */
export function getDefaultSeason(): number {
  return loadConfig().defaultSeason
}

/** Test-only: clears the memoized config so the next loadConfig() re-parses env. */
export function resetConfigForTests(): void {
  cached = null
}
