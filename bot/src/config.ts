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
const MEMORY_PATH_FALLBACK = 'data/memory.json'
const PICKS_PATH_FALLBACK = 'data/picks.json'
const COOLDOWN_SECONDS_FALLBACK = 20
const USER_DAILY_LIMIT_FALLBACK = 10
const DAILY_BUDGET_USD_FALLBACK = 10
const WEB_SEARCH_MAX_USES_FALLBACK = 3

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
  // Comma-separated. min(1) only rejects the literally-empty string, so the
  // refine catches a value like " , , " that parses to zero usable IDs --
  // without it the bot would boot fine, register no commands, and silently
  // refuse every guild, which is far harder to diagnose than a startup error.
  DISCORD_GUILD_ID: z
    .string()
    .min(1, 'DISCORD_GUILD_ID is required')
    .refine(
      value => value.split(',').some(id => id.trim().length > 0),
      'DISCORD_GUILD_ID must contain at least one guild ID'
    ),
  MCP_URL: z.string().url('MCP_URL must be a valid URL'),
  MCP_AUTH_TOKEN: z.string().min(1, 'MCP_AUTH_TOKEN is required'),
  // Optional so the Phase-A deterministic commands keep working without an
  // Anthropic key -- the conversational path (claude.ts) fails with a clear
  // error at call time instead of blocking boot.
  ANTHROPIC_API_KEY: optionalNonEmpty,
  MODEL_DEFAULT: optionalNonEmpty,
  MODEL_ADVISOR: optionalNonEmpty,
  MODEL_ROUTER: optionalNonEmpty,
  // Supabase-backed durable storage (src/storage/). Optional as a pair:
  // both set -> profiles/settings/memory persist to the `bot` schema and
  // survive redeploys; neither set -> the original JSON-file behavior.
  // Exactly one set is a config error (see the superRefine below) -- a
  // typo'd variable name should fail the boot, not silently fall back.
  SUPABASE_URL: optionalNonEmpty.pipe(z.string().url('SUPABASE_URL must be a valid URL').optional()),
  SUPABASE_SERVICE_ROLE_KEY: optionalNonEmpty,
  // Where the JSON storage backend persists per-user favorite teams,
  // server settings, and memory atoms. Relative paths resolve against
  // process.cwd() (the bot/ workspace root in normal use). Ignored when
  // the Supabase pair is configured.
  PROFILES_PATH: optionalNonEmpty,
  SETTINGS_PATH: optionalNonEmpty,
  MEMORY_PATH: optionalNonEmpty,
  PICKS_PATH: optionalNonEmpty,
  // Cost/rate guards for the conversational path (limits.ts). Router calls
  // (router.ts's Haiku triage) are cheap and not gated by these.
  COOLDOWN_SECONDS: optionalNumber(),
  USER_DAILY_LIMIT: optionalNumber(),
  DAILY_BUDGET_USD: optionalNumber(),
  // Max Anthropic-native web_search calls per API request on the
  // conversational path. 0 disables the tool entirely (it is then omitted
  // from the request AND the system prompt never mentions it). Constrained
  // to a nonnegative integer at boot: the value is sent verbatim as the
  // tool's max_uses, where a fraction would make the API reject every
  // conversational request -- and a negative would silently act as the kill
  // switch, which only an explicit 0 should.
  WEB_SEARCH_MAX_USES: z
    .string()
    .optional()
    .transform(v => (v && v.trim().length > 0 ? v : undefined))
    .pipe(z.coerce.number().int().min(0, 'WEB_SEARCH_MAX_USES must be 0 or a positive integer').optional()),
  // z.coerce.number() on an empty string coerces to 0, not undefined -- treat
  // an empty/unset CFB_SEASON as "omitted" before it reaches the coercer.
  CFB_SEASON: z
    .string()
    .optional()
    .transform(v => (v && v.trim().length > 0 ? v : undefined))
    .pipe(z.coerce.number().int().optional()),
}).superRefine((data, ctx) => {
  if (Boolean(data.SUPABASE_URL) !== Boolean(data.SUPABASE_SERVICE_ROLE_KEY)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [data.SUPABASE_URL ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_URL'],
      message: 'set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or neither',
    })
  }
})

export interface BotConfig {
  discordToken: string
  discordAppId: string
  /**
   * The first entry of allowedGuildIds, kept for backwards compatibility
   * with call sites that only ever cared about a single guild (e.g. the
   * command-registration script's log line). Runtime guild gating must use
   * allowedGuildIds, not this field.
   */
  discordGuildId: string
  /**
   * DISCORD_GUILD_ID, comma-separated, trimmed, empty entries dropped, order
   * preserved. Slash commands are registered to every guild in this list
   * (register-commands.ts) and it doubles as the runtime allowlist: any
   * @-mention or interaction from a guild not in this list is refused before
   * it can reach the Anthropic budget (see mention.ts / index.ts). The
   * Discord app has Public Bot enabled, so without this gate anyone with the
   * Application ID could add the bot to their own server and drain the
   * shared daily budget.
   */
  allowedGuildIds: string[]
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
  /** Supabase project URL -- with the service-role key, switches storage to the `bot` schema. */
  supabaseUrl?: string
  /** Supabase service-role key. Set both or neither (validated at boot). */
  supabaseServiceRoleKey?: string
  /** Where the JSON backend persists per-user favorite teams (relative to process.cwd() unless absolute). */
  profilesPath: string
  /** Where the JSON backend persists server-level toggles (e.g. the /lore flag). */
  settingsPath: string
  /** Where the JSON backend persists long-term memory atoms. */
  memoryPath: string
  /** Where the JSON backend persists prediction-ledger picks. */
  picksPath: string
  /** Minimum seconds between LLM-backed questions from the same user. */
  cooldownSeconds: number
  /** Max LLM-backed questions a single user can ask per day. */
  userDailyLimit: number
  /** Global daily spend ceiling in USD for the LLM path. */
  dailyBudgetUsd: number
  /** Max web_search calls per conversational request; 0 removes the tool entirely. */
  webSearchMaxUses: number
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
  const allowedGuildIds = data.DISCORD_GUILD_ID.split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0)

  cached = {
    discordToken: data.DISCORD_TOKEN,
    discordAppId: data.DISCORD_APP_ID,
    // Falls back to the raw (trimmed) value in the pathological case where
    // DISCORD_GUILD_ID is non-empty but whitespace/commas only -- zod's
    // min(1) only guarantees the raw string isn't literally "".
    discordGuildId: allowedGuildIds[0] ?? data.DISCORD_GUILD_ID.trim(),
    allowedGuildIds,
    mcpUrl: data.MCP_URL,
    mcpAuthToken: data.MCP_AUTH_TOKEN,
    anthropicApiKey: data.ANTHROPIC_API_KEY,
    modelDefault: data.MODEL_DEFAULT ?? MODEL_DEFAULT_FALLBACK,
    modelAdvisor: data.MODEL_ADVISOR ?? MODEL_ADVISOR_FALLBACK,
    modelRouter: data.MODEL_ROUTER ?? MODEL_ROUTER_FALLBACK,
    supabaseUrl: data.SUPABASE_URL,
    supabaseServiceRoleKey: data.SUPABASE_SERVICE_ROLE_KEY,
    profilesPath: data.PROFILES_PATH ?? PROFILES_PATH_FALLBACK,
    settingsPath: data.SETTINGS_PATH ?? SETTINGS_PATH_FALLBACK,
    memoryPath: data.MEMORY_PATH ?? MEMORY_PATH_FALLBACK,
    picksPath: data.PICKS_PATH ?? PICKS_PATH_FALLBACK,
    cooldownSeconds: data.COOLDOWN_SECONDS ?? COOLDOWN_SECONDS_FALLBACK,
    userDailyLimit: data.USER_DAILY_LIMIT ?? USER_DAILY_LIMIT_FALLBACK,
    dailyBudgetUsd: data.DAILY_BUDGET_USD ?? DAILY_BUDGET_USD_FALLBACK,
    webSearchMaxUses: data.WEB_SEARCH_MAX_USES ?? WEB_SEARCH_MAX_USES_FALLBACK,
    cfbSeasonOverride: data.CFB_SEASON,
    defaultSeason: deriveDefaultSeason(data.CFB_SEASON),
  }
  return cached
}

/** The season commands should default to when the caller doesn't specify one. */
export function getDefaultSeason(): number {
  return loadConfig().defaultSeason
}

/**
 * Runtime guild gate: true only for a non-null guild ID present in
 * allowedGuildIds. DMs (guildId === null) and any guild the bot was added to
 * outside the allowlist are refused -- see mention.ts and index.ts, the two
 * call sites that reach the Anthropic budget.
 */
export function isAllowedGuild(guildId: string | null | undefined): boolean {
  if (!guildId) return false
  return loadConfig().allowedGuildIds.includes(guildId)
}

/** Test-only: clears the memoized config so the next loadConfig() re-parses env. */
export function resetConfigForTests(): void {
  cached = null
}
