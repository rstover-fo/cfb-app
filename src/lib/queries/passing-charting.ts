import { createClient } from '@/lib/supabase/server'
import { fail, clamp, type McpResult } from './mcp'
import { CURRENT_SEASON } from './constants'

// ---------------------------------------------------------------------------
// Query layer for the passing-charting MCP tools (get_passing_charting,
// get_target_profile in src/lib/mcp/tools.ts), over two api-schema views
// shipped by cfb-database PR #81 (2026-08-30):
//
//   api.passing_charting_player_season -- passer grain (season, player_id,
//     team). Air yards, aDOT, yards after catch, per-metric coverage.
//   api.passing_charting_target_season -- RECEIVER grain (season, target_id,
//     team). The first receiver-grain surface in the contract: `target_id`
//     is the join key nothing else in api.* exposes.
//
// Coverage is the whole story here, and getting it wrong produces a
// confidently wrong leaderboard rather than an obviously broken one:
//
//   * The averages are computed over CHARTED plays only, not over all
//     attempts. Verified live 2025: Carson Beck, total_air_yards 2070 /
//     air_yards_attempts_available 288 = 7.2 = average_depth_of_target.
//     His `attempts` are 462. So aDOT is a rate over a partial denominator.
//   * The two denominators differ per metric -- air-yards and YAC charting
//     cover different play sets (Beck: 288 vs 207) -- so one shared coverage
//     number would misstate whichever metric it did not describe.
//   * 2025 coverage is partial by design: 820 player-seasons, 413 of them
//     with nothing charted at all, and the best-covered passer sits at
//     288/462 = 62%. NOBODY is fully charted. Ranking without a floor
//     surfaces one-attempt players at the top -- max observed coverage is
//     1.000 and it is noise.
//   * NULL means not-yet-charted, never zero (cfb-database migration 057).
//
// So both queries take a charted-play floor, apply it SERVER-SIDE before the
// row cap (a client-side filter would let unqualified rows consume the cap
// and silently drop qualified ones -- same failure mode documented in
// coaches.ts's FBS filter), and attach the derived coverage fractions the
// views do not themselves ship.
//
// MCP-only module: keeps mcp.ts's McpResult error-passthrough contract
// (friendly "Error: ..." strings, never a throw) and is deliberately NOT
// wrapped in React cache() -- see mcp.ts's module header for both rationales.
// ---------------------------------------------------------------------------

/**
 * Minimum charted plays for a row to be leaderboard-eligible by default.
 *
 * Live 2025 distribution of `air_yards_attempts_available`: 197 player-seasons
 * at >= 20, 152 at >= 50, 117 at >= 100. 50 keeps a real leaderboard (152
 * qualifiers) while cutting the long tail of single-digit samples whose aDOT
 * is noise. Callers can lower it; the coverage fields ship regardless so a
 * loosened floor is still legible.
 */
export const DEFAULT_MIN_CHARTED = 50

/** Charting exists from this season on; earlier seasons return nothing. */
export const CHARTING_MIN_SEASON = 2025

const PLAYER_DEFAULT_LIMIT = 25
const TARGET_DEFAULT_LIMIT = 25

/** What a passer leaderboard can be ordered by. All are DESC (higher first). */
export type PassingChartingSort = 'adot' | 'air_yards' | 'yac_per_completion' | 'attempts'

const PLAYER_SORT_COLUMNS: Record<PassingChartingSort, string> = {
  adot: 'average_depth_of_target',
  air_yards: 'total_air_yards',
  yac_per_completion: 'average_yards_after_catch',
  attempts: 'attempts',
}

/**
 * Which denominator the charted-play floor applies to, per sort.
 *
 * The two denominators diverge sharply (live 2025: Henry Hesson has 60
 * air-yards charted plays against 18 for YAC), so flooring on the air-yards
 * count while ranking by YAC lets a passer qualify on one metric and rank on
 * a handful of plays of another. Observed directly: with a flat
 * air_yards >= 50 floor, the YAC leaderboard was topped by a passer with 32
 * YAC-charted plays over a runner-up with 157. The floor has to bind the
 * sample actually being ranked.
 *
 * `attempts` sorts on a raw count rather than a charted average, so it keeps
 * the air-yards floor as the general "is this row charted at all" gate.
 */
const PLAYER_FLOOR_COLUMNS: Record<PassingChartingSort, string> = {
  adot: 'air_yards_attempts_available',
  air_yards: 'air_yards_attempts_available',
  yac_per_completion: 'yards_after_catch_attempts_available',
  attempts: 'air_yards_attempts_available',
}

/** What a target (receiver) leaderboard can be ordered by. All DESC. */
export type TargetProfileSort = 'targets' | 'adot' | 'air_yards' | 'target_share' | 'yac'

const TARGET_SORT_COLUMNS: Record<TargetProfileSort, string> = {
  targets: 'targets_charted',
  adot: 'average_depth_of_target',
  air_yards: 'total_air_yards',
  target_share: 'target_share_charted',
  yac: 'total_yards_after_catch',
}

/**
 * Per-sort floor column, for the same reason as PLAYER_FLOOR_COLUMNS.
 *
 * targets_charted runs far ahead of the metric-specific counts here because a
 * partial parse leaves air yards or YAC unavailable on a play that still
 * counts as a charted target (live 2025: Danny Scudero, 155 targets charted
 * against 52 air-yards charted plays). Flooring on targets_charted while
 * ranking aDOT would let a receiver qualify on volume and rank on a couple of
 * observations.
 */
const TARGET_FLOOR_COLUMNS: Record<TargetProfileSort, string> = {
  targets: 'targets_charted',
  target_share: 'targets_charted',
  adot: 'air_yards_charted_plays',
  air_yards: 'air_yards_charted_plays',
  yac: 'yards_after_catch_charted_plays',
}

// ---------------------------------------------------------------------------
// Passer grain
// ---------------------------------------------------------------------------

/**
 * One row of api.passing_charting_player_season, plus derived coverage.
 *
 * Every metric field is nullable and NULL means not-yet-charted. Do not
 * render a NULL as 0 -- an uncharted passer is not a passer with zero air
 * yards.
 */
export interface PassingChartingPlayerRow {
  season: number
  player_id: string
  player: string | null
  team: string | null
  conference: string | null
  position: string | null
  /** Total pass attempts, charted or not. The coverage DENOMINATOR's base. */
  attempts: number | null
  completions: number | null
  interceptions: number | null
  completion_rate: number | null
  total_air_yards: number | null
  /** total_air_yards / air_yards_attempts_available -- NOT per attempt. */
  average_depth_of_target: number | null
  /** Charted-play count the air-yards metrics are averaged over. */
  air_yards_attempts_available: number | null
  total_yards_after_catch: number | null
  /** total_yards_after_catch / yards_after_catch_attempts_available. */
  average_yards_after_catch: number | null
  /** Charted-play count the YAC metrics are averaged over. Differs from the air-yards one. */
  yards_after_catch_attempts_available: number | null
  /** DERIVED (not a view column): air_yards_attempts_available / attempts. */
  air_yards_coverage_pct: number | null
  /** DERIVED (not a view column): yards_after_catch_attempts_available / attempts. */
  yards_after_catch_coverage_pct: number | null
}

const PLAYER_COLUMNS = `
  season, player_id, player, team, conference, position,
  attempts, completions, interceptions, completion_rate,
  total_air_yards, average_depth_of_target, air_yards_attempts_available,
  total_yards_after_catch, average_yards_after_catch, yards_after_catch_attempts_available
` as const

export interface PassingChartingFilter {
  season?: number
  team?: string
  conference?: string
  minCharted?: number
  sort?: PassingChartingSort
  limit?: number
}

/**
 * Coverage as a fraction of total attempts, to 3dp.
 *
 * Returns null when either side is missing or attempts is 0 -- an unknown
 * coverage must not render as 0.0, which would read as "nothing charted"
 * rather than "we cannot say".
 */
function coverage(charted: number | null | undefined, attempts: number | null | undefined): number | null {
  if (charted == null || attempts == null || attempts === 0) return null
  return Math.round((charted / attempts) * 1000) / 1000
}

function withPlayerCoverage(row: PassingChartingPlayerRow): PassingChartingPlayerRow {
  return {
    ...row,
    air_yards_coverage_pct: coverage(row.air_yards_attempts_available, row.attempts),
    yards_after_catch_coverage_pct: coverage(row.yards_after_catch_attempts_available, row.attempts),
  }
}

export async function queryPassingChartingPlayers(
  filter: PassingChartingFilter
): Promise<McpResult<PassingChartingPlayerRow>> {
  const supabase = await createClient()
  const sort = filter.sort ?? 'adot'
  const minCharted = filter.minCharted ?? DEFAULT_MIN_CHARTED

  let query = supabase
    .schema('api')
    .from('passing_charting_player_season')
    .select(PLAYER_COLUMNS)
    .eq('season', filter.season ?? CURRENT_SEASON)
    // Server-side, before .limit(): the floor must shrink the candidate set,
    // not just the returned page. The column is sort-dependent -- see
    // PLAYER_FLOOR_COLUMNS.
    .gte(PLAYER_FLOOR_COLUMNS[sort], minCharted)

  if (filter.team) query = query.eq('team', filter.team)
  if (filter.conference) query = query.eq('conference', filter.conference)

  const { data, error } = await query
    .order(PLAYER_SORT_COLUMNS[sort], { ascending: false, nullsFirst: false })
    // Deterministic tiebreak so equal metrics do not reorder between calls.
    .order('player_id', { ascending: true })
    .limit(clamp(filter.limit, PLAYER_DEFAULT_LIMIT))

  if (error) return { rows: [], error: fail('api.passing_charting_player_season', error) }
  const rows = (data ?? []) as unknown as PassingChartingPlayerRow[]
  return { rows: rows.map(withPlayerCoverage), error: null }
}

// ---------------------------------------------------------------------------
// Target (receiver) grain
// ---------------------------------------------------------------------------

/**
 * One row of api.passing_charting_target_season, plus derived coverage.
 *
 * This view carries per-metric charted-play counts named `*_charted_plays`
 * rather than the passer view's `*_attempts_available`, and its own share
 * column. Same NULL-means-uncharted rule.
 */
export interface TargetProfileRow {
  season: number
  target_id: string
  target: string | null
  team_id: number | null
  team: string | null
  /** Charted targets. This is the row's sample size, not the player's true target count. */
  targets_charted: number | null
  receptions: number | null
  total_air_yards: number | null
  average_depth_of_target: number | null
  air_yards_charted_plays: number | null
  total_yards_after_catch: number | null
  average_yards_after_catch: number | null
  yards_after_catch_charted_plays: number | null
  /**
   * Share of the team's CHARTED attempts that targeted this receiver -- not a
   * true target share, because the charted set is a partial sample of attempts.
   */
  target_share_charted: number | null
  /** Fraction of contributing plays whose parse_status is 'partial' (provisional). */
  partial_share: number | null
  /** DERIVED: air_yards_charted_plays / targets_charted. */
  air_yards_coverage_pct: number | null
  /** DERIVED: yards_after_catch_charted_plays / targets_charted. */
  yards_after_catch_coverage_pct: number | null
}

const TARGET_COLUMNS = `
  season, target_id, target, team_id, team,
  targets_charted, receptions,
  total_air_yards, average_depth_of_target, air_yards_charted_plays,
  total_yards_after_catch, average_yards_after_catch, yards_after_catch_charted_plays,
  target_share_charted, partial_share
` as const

export interface TargetProfileFilter {
  season?: number
  team?: string
  minCharted?: number
  sort?: TargetProfileSort
  limit?: number
}

/**
 * Round to 3dp, preserving null.
 *
 * The target view returns unrounded doubles (live: aDOT 7.865384615384615,
 * target_share_charted 0.34444444444444444) where the passer view ships
 * already-rounded values (7.2, 6.1). Left alone, the two tools would disagree
 * on presentation and the model would quote sixteen significant digits of an
 * average built from ~50 charted plays. 3dp is well past anything meaningful
 * here and keeps the two payloads consistent.
 */
function round3(value: number | null | undefined): number | null {
  if (value == null) return null
  return Math.round(value * 1000) / 1000
}

function withTargetCoverage(row: TargetProfileRow): TargetProfileRow {
  return {
    ...row,
    average_depth_of_target: round3(row.average_depth_of_target),
    average_yards_after_catch: round3(row.average_yards_after_catch),
    target_share_charted: round3(row.target_share_charted),
    partial_share: round3(row.partial_share),
    air_yards_coverage_pct: coverage(row.air_yards_charted_plays, row.targets_charted),
    yards_after_catch_coverage_pct: coverage(row.yards_after_catch_charted_plays, row.targets_charted),
  }
}

/**
 * Receiver-grain charting rows. `minCharted` floors `targets_charted` -- a
 * receiver with three charted targets has an aDOT, and it means nothing.
 */
export async function queryTargetProfiles(
  filter: TargetProfileFilter
): Promise<McpResult<TargetProfileRow>> {
  const supabase = await createClient()
  const sort = filter.sort ?? 'targets'
  // Receivers see far fewer plays than the passer throwing to all of them, so
  // the passer floor would empty the board; scale it down rather than reuse it.
  const minCharted = filter.minCharted ?? Math.round(DEFAULT_MIN_CHARTED / 5)

  let query = supabase
    .schema('api')
    .from('passing_charting_target_season')
    .select(TARGET_COLUMNS)
    .eq('season', filter.season ?? CURRENT_SEASON)
    .gte(TARGET_FLOOR_COLUMNS[sort], minCharted)

  if (filter.team) query = query.eq('team', filter.team)

  const { data, error } = await query
    .order(TARGET_SORT_COLUMNS[sort], { ascending: false, nullsFirst: false })
    .order('target_id', { ascending: true })
    .limit(clamp(filter.limit, TARGET_DEFAULT_LIMIT))

  if (error) return { rows: [], error: fail('api.passing_charting_target_season', error) }
  const rows = (data ?? []) as unknown as TargetProfileRow[]
  return { rows: rows.map(withTargetCoverage), error: null }
}
