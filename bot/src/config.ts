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

const MODEL_DEFAULT_FALLBACK = 'claude-sonnet-5'
const MODEL_ADVISOR_FALLBACK = 'claude-opus-4-8'
const MODEL_ROUTER_FALLBACK = 'claude-haiku-4-5'
const PROFILES_PATH_FALLBACK = 'data/profiles.json'
const SETTINGS_PATH_FALLBACK = 'data/settings.json'
const COOLDOWN_SECONDS_FALLBACK = 20
const USER_DAILY_LIMIT_FALLBACK = 10
const DAILY_BUDGET_USD_FALLBACK = 10

/** Treats empty/whitespace-only strings as "unset" before applying a default. */
const optionalNonEmpty = z
  .string()
  .optional()
  .transform(v => (v && v.trim().length > 0 ? v.trim() : undefined))

/** Treats an empty/whitespace-only string as "unset" before coercing to a number (empty-string coerces to 0 otherwise). */
function optionalNumber() {
  return z
    .string()
    .optional()
    .transform(v => (v && v.trim().length > 0 ? v : undefined))
    .pipe(z.coerce.number().optional())
}

const EnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_APP_ID: z.string().min(1, 'DISCORD_APP_ID is required'),
  DISCORD_GUILD_ID: z.string().min(1, 'DISCORD_GUILD_ID is required'),
  MCP_URL: z.string().url('MCP_URL must be a valid URL'),
  MCP_AUTH_TOKEN: z.string().min(1, 'MCP_AUTH_TOKEN is required'),
  // Optional so the Phase-A deterministic commands keep working without an
  // Anthropic key -- the conversational path (claude.ts) fails with a clear
  // error at call time instead of blocking boot.
  ANTHROPIC_API_KEY: optionalNonEmpty,
  MODEL_DEFAULT: optionalNonEmpty,
  MODEL_ADVISOR: optionalNonEmpty,
  MODEL_ROUTER: optionalNonEmpty,
  // Where profiles.ts persists per-user favorite teams. Relative paths
  // resolve against process.cwd() (the bot/ workspace root in normal use).
  PROFILES_PATH: optionalNonEmpty,
  SETTINGS_PATH: optionalNonEmpty,
  // Cost/rate guards for the conversational path (limits.ts). Router calls
  // (router.ts's Haiku triage) are cheap and not gated by these.
  COOLDOWN_SECONDS: optionalNumber(),
  USER_DAILY_LIMIT: optionalNumber(),
  DAILY_BUDGET_USD: optionalNumber(),
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
  /** Anthropic API key -- absent means the conversational Claude path is unavailable. */
  anthropicApiKey?: string
  /** Default conversational model (simple tier). */
  modelDefault: string
  /** Advisor model for gnarly analytical questions (and [ESCALATE] re-runs). */
  modelAdvisor: string
  /** Cheap classifier model for simple-vs-gnarly triage. */
  modelRouter: string
  /** Where profiles.ts persists per-user favorite teams (relative to process.cwd() unless absolute). */
  profilesPath: string
  /** Where settings.ts persists server-level toggles (e.g. the /lore flag). */
  settingsPath: string
  /** Minimum seconds between LLM-backed questions from the same user. */
  cooldownSeconds: number
  /** Max LLM-backed questions a single user can ask per day. */
  userDailyLimit: number
  /** Global daily spend ceiling in USD for the LLM path. */
  dailyBudgetUsd: number
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
    anthropicApiKey: data.ANTHROPIC_API_KEY,
    modelDefault: data.MODEL_DEFAULT ?? MODEL_DEFAULT_FALLBACK,
    modelAdvisor: data.MODEL_ADVISOR ?? MODEL_ADVISOR_FALLBACK,
    modelRouter: data.MODEL_ROUTER ?? MODEL_ROUTER_FALLBACK,
    profilesPath: data.PROFILES_PATH ?? PROFILES_PATH_FALLBACK,
    settingsPath: data.SETTINGS_PATH ?? SETTINGS_PATH_FALLBACK,
    cooldownSeconds: data.COOLDOWN_SECONDS ?? COOLDOWN_SECONDS_FALLBACK,
    userDailyLimit: data.USER_DAILY_LIMIT ?? USER_DAILY_LIMIT_FALLBACK,
    dailyBudgetUsd: data.DAILY_BUDGET_USD ?? DAILY_BUDGET_USD_FALLBACK,
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
