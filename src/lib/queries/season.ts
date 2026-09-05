import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { CURRENT_SEASON } from './constants'

// ---------------------------------------------------------------------------
// Season resolver: every surface that needs "what season are we looking at
// right now" (dashboard defaults, leaderboard floors, the MCP season
// default) should answer with the same value, and that value must track the
// warehouse, not the calendar.
//
// Why `completed` defines "loaded": cfb-database ingests the FULL 2026
// schedule -- every FBS game, bowls included -- before the season's first
// snap. A resolver that only asked "does this season have any rows at all"
// would call 2026 current in July, months before a down is played. The
// `completed` column is the only thing that distinguishes "scheduled" from
// "actually happened", so R1 keys off it: the newest season with at least
// one `completed = true` game is the newest season worth calling current. A
// schedule-only season, however new, never counts.
//
// Why the offseason resolves to the LAST completed season: once every game
// in the live season is `completed = true` (bowls done, no `completed =
// false` rows left for it), the newest season with a completed game is
// still that season -- there is no "next" season with a completed game yet,
// even though its full schedule may already be sitting in the warehouse.
// Nothing here special-cases "offseason"; it falls straight out of always
// picking the newest season with a completed game, per R1.
//
// Why two cache wrappers: mcp.ts's module header lays out the rule this
// follows -- React's `cache()` only dedupes calls within a single React
// render pass. A plain Route Handler (the MCP surface today, any future
// non-RSC caller tomorrow) that used `cache()` would risk one request's
// memoized season leaking into an unrelated request instead of being
// re-resolved per request. So RSC callers get `getCurrentSeasonCached`
// (React `cache()`), and everyone else gets `getCurrentSeasonForRoute`, a
// manual module-level TTL cache (same shape as agent/instructions/30-lore.ts's
// loreEnabled()).
//
// Why floors scale only when live: a completed season's floor (e.g. "50
// carries minimum for a rushing leaderboard") is meaningful all season,
// because the full slate already happened. The same floor is unreachable in
// week 1 of a live season (one game per team so far), so `scaleFloor` (R12/
// R13) shrinks it in proportion to weeks played -- but only while the
// season is still live; once it completes, the caller's own floor applies
// unscaled again.
// ---------------------------------------------------------------------------

/** Where a resolved SeasonState came from, in resolution-order priority. */
export type SeasonSource = 'override' | 'season_state' | 'games' | 'fallback'

export interface SeasonState {
  season: number
  /** Highest week with a completed game in `season`. Null when unresolvable. */
  through_week: number | null
  /** True when `season` still has at least one scheduled-but-incomplete game. */
  is_live: boolean
  source: SeasonSource
}

/** A scaled floor never drops below this, however early the live season is. */
export const MIN_SCALED_FLOOR = 10

/** Route-handler cache lifetime -- see module header for why this exists
 * alongside `getCurrentSeasonCached`. */
export const SEASON_CACHE_TTL_MS = 600_000

/** Cache lifetime for a `source: 'fallback'` result specifically -- see
 * getCurrentSeasonForRoute's doc comment for why this is much shorter than
 * SEASON_CACHE_TTL_MS. */
export const FALLBACK_CACHE_TTL_MS = 30_000

const MIN_VALID_SEASON = 2000
const MAX_VALID_SEASON = 2100

/**
 * Parse `CFB_SEASON` into a validated season override: an integer in
 * [2000, 2100], or undefined when unset, blank, non-integer, or out of
 * range. Exported (rather than kept module-private) so tests can exercise
 * the validation rule directly; the resolvers below still read it once at
 * module load into `SEASON_OVERRIDE` below, since an env var read per call
 * would only add cost with no behavior change within one process lifetime.
 */
export function readSeasonOverride(env: Record<string, string | undefined> = process.env): number | undefined {
  const raw = env.CFB_SEASON
  if (raw == null || raw.trim() === '') return undefined
  const parsed = Number(raw)
  if (!Number.isInteger(parsed)) return undefined
  if (parsed < MIN_VALID_SEASON || parsed > MAX_VALID_SEASON) return undefined
  return parsed
}

const SEASON_OVERRIDE = readSeasonOverride()

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

interface SeasonStateRow {
  season: number
  through_week: number | null
  is_live: boolean
}

/**
 * Is this PostgREST error "the relation doesn't exist" (api.season_state not
 * shipped yet), as opposed to a real failure? Code 42P01 is Postgres's own
 * undefined_table SQLSTATE; the message substrings cover how PostgREST and
 * the supabase-js schema cache each phrase the same condition.
 */
function isMissingRelationError(error: { message?: string; code?: string }): boolean {
  if (error.code === '42P01') return true
  const message = error.message ?? ''
  return /does not exist/i.test(message) || /Could not find the table/i.test(message)
}

/**
 * Try api.season_state, scoped to `season` when given (the override path)
 * or the newest row WITH at least one completed game otherwise (R6). That
 * `games_completed > 0` filter is the same R1 rule the `games` path applies:
 * the view carries one row per season present in `games`, and cfb-database
 * loads a full schedule months before kickoff, so without it a future
 * schedule-only season would win the ORDER BY and every consumer would call
 * a season with zero played games "current". `is_live` comes from the view
 * itself rather than being derived from `is_complete`, so a schedule-only
 * row (both false) can never read as live either.
 *
 * Returns null for BOTH a missing relation (silently -- the view just isn't
 * shipped yet) and any other query error (after one console.warn), so the
 * caller can fall through to the `games` query in either case without
 * treating "not shipped" as a failure worth logging.
 */
async function trySeasonState(
  supabase: SupabaseClient,
  season?: number
): Promise<SeasonStateRow | null> {
  let query = supabase.schema('api').from('season_state').select('season, through_week, is_live')
  if (season !== undefined) query = query.eq('season', season)
  else query = query.gt('games_completed', 0)

  const { data, error } = await query.order('season', { ascending: false }).limit(1)

  if (error) {
    if (!isMissingRelationError(error)) {
      console.warn('season.ts: api.season_state query failed, falling back to games:', error.message)
    }
    return null
  }

  const rows = (data ?? []) as unknown as SeasonStateRow[]
  return rows[0] ?? null
}

/**
 * R1: the newest season in `public.games` with at least one completed game.
 * Throws on a query error rather than swallowing it, so resolveCurrentSeason's
 * catch can turn it into the fallback state (R4) -- this function's own
 * callers are never meant to see a partial/undefined season silently.
 */
async function newestCompletedSeason(supabase: SupabaseClient): Promise<number | null> {
  const { data, error } = await supabase
    .from('games')
    .select('season')
    .eq('completed', true)
    .order('season', { ascending: false })
    .limit(1)

  if (error) throw new Error(`games query failed: ${error.message}`)
  const rows = (data ?? []) as unknown as { season: number }[]
  return rows[0]?.season ?? null
}

/**
 * R2 (through_week) and R12/R13 (is_live) for one season, from `public.games`.
 * Two tiny queries run concurrently rather than one wide select over every
 * row of the season -- see the plan's Technical decisions for why.
 */
async function gamesWeekInfo(
  supabase: SupabaseClient,
  season: number
): Promise<{ through_week: number | null; is_live: boolean }> {
  const [weekResult, liveResult] = await Promise.all([
    supabase.from('games').select('week').eq('season', season).eq('completed', true).order('week', { ascending: false }).limit(1),
    supabase.from('games').select('week').eq('season', season).eq('completed', false).limit(1),
  ])

  if (weekResult.error) throw new Error(`games query failed: ${weekResult.error.message}`)
  if (liveResult.error) throw new Error(`games query failed: ${liveResult.error.message}`)

  const weekRows = (weekResult.data ?? []) as unknown as { week: number }[]
  const liveRows = (liveResult.data ?? []) as unknown as { week: number }[]

  return {
    through_week: weekRows[0]?.week ?? null,
    is_live: liveRows.length > 0,
  }
}

/** R4: the constant fallback, used whenever the warehouse can't be reached. */
function fallbackState(): SeasonState {
  return { season: CURRENT_SEASON, through_week: null, is_live: false, source: 'fallback' }
}

/**
 * Resolve through_week/is_live for a `CFB_SEASON`-overridden season. The
 * season itself is never in question here (R3: the override always wins) --
 * only through_week/is_live can fail, in which case they degrade to
 * null/false while `source` stays 'override'.
 */
async function resolveOverrideSeason(season: number): Promise<SeasonState> {
  try {
    const supabase = await createClient()
    const stateRow = await trySeasonState(supabase, season)
    if (stateRow) {
      return { season, through_week: stateRow.through_week, is_live: stateRow.is_live, source: 'override' }
    }
    const { through_week, is_live } = await gamesWeekInfo(supabase, season)
    return { season, through_week, is_live, source: 'override' }
  } catch {
    return { season, through_week: null, is_live: false, source: 'override' }
  }
}

/**
 * Uncached season resolution -- R1-R6, R12/R13. Resolution order:
 * `CFB_SEASON` override, then `api.season_state`, then the `games` fallback,
 * then the `CURRENT_SEASON` constant. Never throws (R4): every branch that
 * can fail is caught and turned into `fallbackState()`.
 */
export async function resolveCurrentSeason(): Promise<SeasonState> {
  if (SEASON_OVERRIDE !== undefined) {
    return resolveOverrideSeason(SEASON_OVERRIDE)
  }

  try {
    const supabase = await createClient()

    const stateRow = await trySeasonState(supabase)
    if (stateRow) {
      return {
        season: stateRow.season,
        through_week: stateRow.through_week,
        is_live: stateRow.is_live,
        source: 'season_state',
      }
    }

    const season = await newestCompletedSeason(supabase)
    if (season === null) return fallbackState()

    const { through_week, is_live } = await gamesWeekInfo(supabase, season)
    return { season, through_week, is_live, source: 'games' }
  } catch {
    return fallbackState()
  }
}

/** RSC callers: React `cache()` dedupes within one render pass. */
export const getCurrentSeasonCached = cache(resolveCurrentSeason)

let routeCache: { value: SeasonState; expiresAt: number } | undefined

/**
 * Non-RSC callers (the MCP route handler, and any other plain Route
 * Handler) -- see module header for why this can't just be `cache()`. The
 * 600s TTL keeps a season rollover from taking up to 10 minutes to
 * propagate while still sparing most requests their own warehouse round
 * trip.
 *
 * A `source: 'fallback'` result gets the much shorter FALLBACK_CACHE_TTL_MS
 * instead: caching one transient warehouse failure for the full 600s would
 * pin the CURRENT_SEASON constant on every caller of this route -- both eve
 * prompts, every MCP tool, GET /api/season, and then the bot's own 600s
 * cache on top of that -- for ten minutes. 30s isn't zero, though: during a
 * sustained outage, not caching the fallback at all would make every one of
 * those calls pay up to two 10s Supabase fetch timeouts (season_state, then
 * games) rather than one.
 */
export async function getCurrentSeasonForRoute(): Promise<SeasonState> {
  const now = Date.now()
  if (routeCache && routeCache.expiresAt > now) return routeCache.value

  const value = await resolveCurrentSeason()
  const ttl = value.source === 'fallback' ? FALLBACK_CACHE_TTL_MS : SEASON_CACHE_TTL_MS
  routeCache = { value, expiresAt: now + ttl }
  return value
}

/** Test-only: clears the route cache so the next call re-resolves. */
export function resetSeasonCache(): void {
  routeCache = undefined
}

/**
 * Scale a leaderboard/eligibility floor down early in a LIVE season (R12/
 * R13). Callers who want their own explicit floor simply never call this;
 * a completed season, or a live season whose through_week could not be
 * resolved, returns `defaultFloor` unchanged. The scaled floor is also
 * clamped at `defaultFloor` on the high end: `is_live` means "at least one
 * incomplete game remains for this season," which can still be true at
 * through_week 13-16 (bowls pending, or a cancelled game that never
 * completes) -- so the raw ratio can exceed 1, and the result must never
 * scale a floor UP past what a completed season would use.
 */
export function scaleFloor(defaultFloor: number, state: SeasonState): number {
  if (!state.is_live || state.through_week == null) return defaultFloor
  return Math.min(defaultFloor, Math.max(MIN_SCALED_FLOOR, Math.ceil((defaultFloor * state.through_week) / 12)))
}
