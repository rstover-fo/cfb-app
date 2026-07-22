/**
 * In-memory cooldown/cap/budget guards for the conversational LLM path
 * (/ask, @-mentions). One process, ~100 users -- in-memory counters that
 * reset on restart are accepted at this scale, per the plan.
 *
 * Router calls (router.ts's Haiku triage) are cheap (~$0.001/question) and
 * are NOT tracked here -- negligible in the budget math, ignored on purpose.
 */
import { createHash } from 'node:crypto'
import { loadConfig } from './config.js'
import type { UsageSummary } from './claude.js'

export type AllowanceResult = { ok: true } | { ok: false; reason: 'cooldown' | 'user_cap' | 'budget'; retryAfterSec?: number }

interface UserState {
  lastCallAt: number
  dailyCount: number
  dailyDateUTC: string
}

interface ModelRates {
  /** USD per million input tokens. */
  input: number
  /** USD per million output tokens. */
  output: number
}

// USD per MILLION tokens, matched by prefix of the model string.
const MODEL_RATES: [prefix: string, rates: ModelRates][] = [
  ['claude-sonnet-5', { input: 3, output: 15 }],
  ['claude-opus-4-8', { input: 5, output: 25 }],
  ['claude-haiku-4-5', { input: 1, output: 5 }],
]
// Unknown model: price as opus -- fail conservative (overestimate spend
// rather than silently blow past the daily budget).
const UNKNOWN_MODEL_RATES: ModelRates = { input: 5, output: 25 }

const CACHE_WRITE_MULTIPLIER = 1.25 // cache_creation_input_tokens, relative to the input rate
const CACHE_READ_MULTIPLIER = 0.1 // cache_read_input_tokens, relative to the input rate

function ratesFor(model: string): ModelRates {
  const match = MODEL_RATES.find(([prefix]) => model.startsWith(prefix))
  return match ? match[1] : UNKNOWN_MODEL_RATES
}

/** Dollar cost of one call's usage, priced at `model`'s per-million-token rates. */
export function costUsd(usage: UsageSummary, model: string): number {
  const rates = ratesFor(model)
  const perTokenInput = rates.input / 1_000_000
  const perTokenOutput = rates.output / 1_000_000
  return (
    usage.input_tokens * perTokenInput +
    usage.output_tokens * perTokenOutput +
    usage.cache_creation_input_tokens * perTokenInput * CACHE_WRITE_MULTIPLIER +
    usage.cache_read_input_tokens * perTokenInput * CACHE_READ_MULTIPLIER
  )
}

function utcDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10) // YYYY-MM-DD, compared as plain strings for the daily reset
}

let clock: () => number = () => Date.now()
const userState = new Map<string, UserState>()
let globalSpendUSD = 0
let globalSpendDateUTC = utcDateString(Date.now())

function resetGlobalBudgetIfNewDay(): void {
  const today = utcDateString(clock())
  if (today !== globalSpendDateUTC) {
    globalSpendUSD = 0
    globalSpendDateUTC = today
  }
}

/** Gets (creating if absent) a user's counter state, rolling the daily count over on a new UTC date. */
function currentUserState(userId: string): UserState {
  const today = utcDateString(clock())
  const existing = userState.get(userId)
  if (existing && existing.dailyDateUTC === today) return existing

  const fresh: UserState = { lastCallAt: existing?.lastCallAt ?? 0, dailyCount: 0, dailyDateUTC: today }
  userState.set(userId, fresh)
  return fresh
}

/** Hashes a user ID (sha256 hex, first 12 chars) so raw Discord IDs never hit the logs. */
function hashUserId(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 12)
}

function logRefusal(reason: Exclude<AllowanceResult, { ok: true }>['reason'], userId: string): void {
  console.log(JSON.stringify({ evt: 'limit', reason, userId: hashUserId(userId) }))
}

/**
 * Checks whether `userId` may make another LLM call right now: per-user
 * cooldown first, then the per-user daily cap, then the shared global daily
 * dollar budget. Logs one JSON line (hashed userId, no raw ID) on refusal.
 * Read-only -- call recordUsage() after the call actually succeeds.
 */
export function checkAllowance(userId: string): AllowanceResult {
  const config = loadConfig()
  resetGlobalBudgetIfNewDay()
  const state = currentUserState(userId)

  if (state.lastCallAt > 0) {
    const elapsedSec = (clock() - state.lastCallAt) / 1000
    if (elapsedSec < config.cooldownSeconds) {
      const retryAfterSec = Math.max(1, Math.ceil(config.cooldownSeconds - elapsedSec))
      logRefusal('cooldown', userId)
      return { ok: false, reason: 'cooldown', retryAfterSec }
    }
  }

  if (state.dailyCount >= config.userDailyLimit) {
    logRefusal('user_cap', userId)
    return { ok: false, reason: 'user_cap' }
  }

  if (globalSpendUSD >= config.dailyBudgetUsd) {
    logRefusal('budget', userId)
    return { ok: false, reason: 'budget' }
  }

  return { ok: true }
}

/**
 * Records a completed LLM call: bumps the user's cooldown timestamp and
 * daily count, and adds the call's dollar cost -- computed from `usage` at
 * `model`'s rates (the FINAL model actually used, e.g. the advisor after an
 * [ESCALATE] re-run) -- to the shared global daily budget.
 */
export function recordUsage(userId: string, usage: UsageSummary, model: string): void {
  resetGlobalBudgetIfNewDay()
  const state = currentUserState(userId)
  state.lastCallAt = clock()
  state.dailyCount += 1
  userState.set(userId, state)

  globalSpendUSD += costUsd(usage, model)
}

/** User-facing text for a refused allowance check, per the plan's three refusal messages. */
export function refusalMessage(result: Exclude<AllowanceResult, { ok: true }>): string {
  switch (result.reason) {
    case 'cooldown':
      return `Whoa, slow down -- give it another ${result.retryAfterSec ?? loadConfig().cooldownSeconds}s.`
    case 'user_cap':
      return "You've hit today's question limit -- back tomorrow (slash commands still work)."
    case 'budget':
      return 'Daily Claude budget is spent -- back tomorrow. `/rankings`, `/scores` and friends still work.'
  }
}

/**
 * Test-only: clears all counters/spend and installs a fake clock (or
 * restores the real one if omitted).
 */
export function resetLimitsForTests(now?: () => number): void {
  userState.clear()
  clock = now ?? (() => Date.now())
  globalSpendUSD = 0
  globalSpendDateUTC = utcDateString(clock())
}
