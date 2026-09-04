import { createClient } from '@/lib/supabase/server'
import { fail, clamp, positive, type McpResult } from './mcp'
import { CURRENT_SEASON } from './constants'

// ---------------------------------------------------------------------------
// Query layer for the get_rushing_charting MCP tool (src/lib/mcp/tools.ts),
// over api.rushing_charting_player_season (player grain: season, player_id,
// team) shipped by cfb-database's rushing-charting pull.
//
// Unlike passing-charting.ts, EVERY sort here floors on the SAME column,
// `attempts`, rather than a sort-dependent charted-play denominator. Verified
// live: `rushing_yards_available` equals `attempts` on every player row --
// rushing charting is total-carry coverage, not a partial charted subset the
// way passing air-yards/YAC charting is. So there is no risk of a floor on
// one denominator admitting a thin sample on another metric; `attempts` is
// both the sample-size gate and the honest floor for every rate stat here.
// `rushing_yards_available` is still selected and shipped per row (R6) so a
// caller can see the equality directly rather than take it on faith.
//
// Direction (left/middle/right run) charting IS partial -- see
// direction_eligible_attempts / direction_available_attempts below -- and
// that partial coverage is exposed ONLY as the derived
// direction_coverage_pct fraction. There is no direction-based sort in v1
// (product decision, R3/R6): ranking on a ~40%-resolved denominator would
// repeat the passing-charting coverage trap this module is built to avoid.
//
// Default season is CURRENT_SEASON (src/lib/queries/constants.ts), NOT the
// MAX(season) pattern season-outlook.ts uses. That pattern is wrong here:
// early in a season nobody has reached the 50-carry floor (2026 Week 0 max
// was 25 attempts), so resolving to the newest season would point a
// no-argument call at an empty board while the completed season sits one
// constant away. When CURRENT_SEASON is bumped, re-derive DEFAULT_MIN_ATTEMPTS
// from that season's live attempts distribution first -- see the Stage 5
// watch in docs/WAREHOUSE_EXPANSION_RUNBOOK.md.
//
// MCP-only module: keeps mcp.ts's McpResult error-passthrough contract
// (friendly "Error: ..." strings, never a throw) and is deliberately NOT
// wrapped in React cache() -- see mcp.ts's module header for both rationales.
// ---------------------------------------------------------------------------

/**
 * Minimum carries for a row to be leaderboard-eligible by default.
 *
 * Applied to `attempts` regardless of sort (see module header). 50 keeps a
 * real leaderboard while cutting the long tail of single-digit-carry rows
 * whose per-carry rate stats are noise. Callers can lower it; the floor
 * ENFORCED is always echoed back (resolveMinAttempts), never the requested
 * value.
 */
export const DEFAULT_MIN_ATTEMPTS = 50

const DEFAULT_LIMIT = 25

/**
 * What a rushing leaderboard can be ordered by. All descending EXCEPT
 * stuff_rate (lower is better -- see SORT_DIRECTION).
 */
export type RushingChartingSort =
  | 'ppa'
  | 'success_rate'
  | 'explosiveness'
  | 'ypc'
  | 'stuff_rate'
  | 'power_success'
  | 'yards'
  | 'attempts'
  | 'line_yards'
  | 'second_level_yards'
  | 'open_field_yards'

const SORT_COLUMNS: Record<RushingChartingSort, string> = {
  ppa: 'ppa',
  success_rate: 'success_rate',
  explosiveness: 'explosiveness',
  ypc: 'yards_per_carry',
  stuff_rate: 'stuff_rate',
  power_success: 'power_success',
  yards: 'total_rushing_yards',
  attempts: 'attempts',
  line_yards: 'line_yards',
  second_level_yards: 'second_level_yards',
  open_field_yards: 'open_field_yards',
}

/**
 * Sort direction per key. `ascending: true` for stuff_rate (lower share of
 * carries stuffed at/behind the line is better); every other key is
 * descending (higher is better). Kept as an explicit map rather than a
 * hardcoded `ascending: false` on the `.order()` call so stuff_rate cannot
 * silently regress to descending in a future edit.
 */
const SORT_DIRECTION: Record<RushingChartingSort, boolean> = {
  ppa: false,
  success_rate: false,
  explosiveness: false,
  ypc: false,
  stuff_rate: true,
  power_success: false,
  yards: false,
  attempts: false,
  line_yards: false,
  second_level_yards: false,
  open_field_yards: false,
}

/**
 * One row of api.rushing_charting_player_season, plus derived direction
 * coverage. Every metric field is nullable and NULL means not charted /
 * not applicable -- never render a NULL as 0.
 */
export interface RushingChartingPlayerRow {
  season: number
  player_id: string
  player: string | null
  team: string | null
  conference: string | null
  position: string | null
  /** Total carries. The sample-size floor applies here regardless of sort. */
  attempts: number | null
  /** Equals `attempts` on every row (live data) -- see module header. */
  rushing_yards_available: number | null
  /** Carries eligible for direction charting (the coverage denominator). */
  direction_eligible_attempts: number | null
  /** Carries with a resolved run direction (the coverage numerator). */
  direction_available_attempts: number | null
  total_rushing_yards: number | null
  yards_per_carry: number | null
  success_rate: number | null
  ppa: number | null
  total_ppa: number | null
  /** Lower is better -- see SORT_DIRECTION. */
  stuff_rate: number | null
  power_success: number | null
  explosiveness: number | null
  line_yards: number | null
  line_yards_total: number | null
  second_level_yards: number | null
  second_level_yards_total: number | null
  open_field_yards: number | null
  open_field_yards_total: number | null
  /** DERIVED (not a view column): direction_available_attempts / direction_eligible_attempts, 3dp. */
  direction_coverage_pct: number | null
}

const PLAYER_COLUMNS = `
  season, player_id, player, team, conference, position,
  attempts, rushing_yards_available, direction_eligible_attempts, direction_available_attempts,
  total_rushing_yards, yards_per_carry, success_rate, ppa, total_ppa, stuff_rate, power_success,
  explosiveness, line_yards, line_yards_total, second_level_yards, second_level_yards_total,
  open_field_yards, open_field_yards_total
` as const

export interface RushingChartingFilter {
  season?: number
  team?: string
  conference?: string
  position?: string
  minAttempts?: number
  sort?: RushingChartingSort
  limit?: number
}

/**
 * The `attempts` floor these queries will actually apply, given a requested
 * value. Exported so the tool layer echoes the floor that was ENFORCED
 * rather than the one that was asked for -- those diverge whenever a value
 * is normalized away (`min_attempts: 0` from a direct caller applies the
 * default but would report 0), and a response that misstates its own
 * eligibility threshold is worse than one that omits it.
 */
export function resolveMinAttempts(requested?: number): number {
  return positive(requested) ?? DEFAULT_MIN_ATTEMPTS
}

/**
 * The position filter these queries will actually apply.
 *
 * Free string normalized to uppercase (the view carries 15 position codes,
 * so this is not a zod enum); `ALL` is the sentinel that drops the filter
 * entirely. Defaults to `'RB'` -- QB `attempts` include sacks, which would
 * silently mix a different kind of carry into a rushing leaderboard, so RB
 * is the safe default rather than no filter at all.
 */
export function resolvePosition(requested?: string): string {
  const upper = requested?.trim().toUpperCase()
  return upper && upper.length > 0 ? upper : 'RB'
}

/**
 * Direction coverage as a fraction of eligible carries, to 3dp.
 *
 * Returns null when either side is missing or eligible is 0 -- an unknown
 * coverage must not render as 0.0, which would read as "no direction
 * resolved" rather than "we cannot say" (and a 0-eligible denominator would
 * otherwise divide by zero).
 */
function directionCoverage(
  available: number | null | undefined,
  eligible: number | null | undefined
): number | null {
  if (available == null || eligible == null || eligible === 0) return null
  return Math.round((available / eligible) * 1000) / 1000
}

function withDirectionCoverage(row: RushingChartingPlayerRow): RushingChartingPlayerRow {
  return {
    ...row,
    direction_coverage_pct: directionCoverage(row.direction_available_attempts, row.direction_eligible_attempts),
  }
}

/**
 * Player-grain rushing-charting rows. `minAttempts` floors `attempts`
 * server-side (before `.limit()`) regardless of sort -- see module header
 * for why a single floor column is safe here, unlike passing-charting.ts.
 */
export async function queryRushingChartingPlayers(
  filter: RushingChartingFilter
): Promise<McpResult<RushingChartingPlayerRow>> {
  const supabase = await createClient()
  const sort = filter.sort ?? 'ppa'
  const minAttempts = resolveMinAttempts(filter.minAttempts)
  const position = resolvePosition(filter.position)

  let query = supabase
    .schema('api')
    .from('rushing_charting_player_season')
    .select(PLAYER_COLUMNS)
    .eq('season', filter.season ?? CURRENT_SEASON)
    // Server-side, before .limit(): the floor must shrink the candidate set,
    // not just the returned page (same rationale as passing-charting.ts and
    // coaches.ts's FBS filter).
    .gte('attempts', minAttempts)

  if (filter.team) query = query.eq('team', filter.team)
  if (filter.conference) query = query.eq('conference', filter.conference)
  if (position !== 'ALL') query = query.eq('position', position)

  const { data, error } = await query
    .order(SORT_COLUMNS[sort], { ascending: SORT_DIRECTION[sort], nullsFirst: false })
    // Deterministic tiebreak so equal metrics do not reorder between calls.
    .order('player_id', { ascending: true })
    .limit(clamp(positive(filter.limit), DEFAULT_LIMIT))

  if (error) return { rows: [], error: fail('api.rushing_charting_player_season', error) }
  const rows = (data ?? []) as unknown as RushingChartingPlayerRow[]
  return { rows: rows.map(withDirectionCoverage), error: null }
}
