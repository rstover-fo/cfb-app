import { createClient } from '@/lib/supabase/server'
import { fail, clamp, type McpResult } from './mcp'

// ---------------------------------------------------------------------------
// Query layer for the season-projection MCP tool (get_season_outlook in
// src/lib/mcp/tools.ts), over two api-schema views:
//
//   api.season_outlook -- one row per (season, team, model_version), already
//     DISTINCT ON that grain ordered by projection_date DESC, so it is the
//     latest snapshot per team-season and needs no dedup here. Each row is
//     the summary of n_sims Monte Carlo seasons in which every remaining
//     game was drawn from the game-level model's prediction.
//   api.model_backtest -- how wrong those projections usually are. One row per
//     (model_version, scope, season window, strength_share), newest run first.
//
// Three things about the outlook view are load-bearing and easy to get wrong:
//
//   1. It is NOT FBS-only. The 2026 snapshot is 138 fbs / 128 fcs / 38 ii /
//      33 iii / 13 with no classification at all, and the non-FBS rows include
//      teams with one or two games loaded, so an unfiltered "top projected win
//      totals" ordering compares teams playing different schedules. Filter on
//      `classification`. NULL there means UNPLACEABLE, not FBS.
//   2. Projected quantities are over `games_simulated`, never
//      `games_scheduled`. A scheduled game the model could not score is
//      EXCLUDED from the simulation, not counted as a loss -- so
//      `projected_losses` understates a slate with `games_unscored > 0`.
//   3. A season whose games are already played is still in this view, and its
//      "projection" is just the final record with a collapsed percentile band.
//      `is_projection` (games_simulated > games_completed) is the authoritative
//      per-row answer -- check it before calling anything a forecast, and use
//      "any row true" for a season-level verdict. Do not re-derive it from
//      games_completed.
//
// MCP-only module: keeps mcp.ts's McpResult error-passthrough contract
// (friendly "Error: ..." strings, never a throw) rather than the UI query
// modules' collapse-to-[] convention, and is deliberately NOT wrapped in
// React cache() -- see mcp.ts's module header for both rationales.
// ---------------------------------------------------------------------------

/**
 * The only model_version written to this view. Pinned rather than exposed as a
 * tool argument: an enum with one member is pure surface area, and pinning it
 * keeps the query on the view's DISTINCT ON grain (a second version would
 * silently double every team's rows).
 */
export const SEASON_OUTLOOK_MODEL = 'fitted_v1'

/** A conference is at most ~18 teams, so this covers any single-conference ask. */
export const SEASON_OUTLOOK_DEFAULT_LIMIT = 25

export interface SeasonOutlookRow {
  projection_date: string
  computed_at: string
  model_version: string
  season: number
  team: string
  /** Null for teams CFBD has not assigned a conference (13 of 350 rows in 2026). */
  conference: string | null
  /**
   * 'fbs' | 'fcs' | 'ii' | 'iii', derived season-accurately, so a team that
   * changed division carries the right label per season. NULL means CFBD could
   * not place the team -- it does NOT mean FBS.
   */
  classification: string | null
  /**
   * `games_simulated > games_completed`. False means every game is already
   * played and the row is a final record, not a forecast. Authoritative -- do
   * not re-derive from games_completed.
   */
  is_projection: boolean
  games_scheduled: number
  games_simulated: number
  /** Scheduled games the model could not score. These are excluded from the sim. */
  games_unscored: number
  games_completed: number
  actual_wins: number
  schedule_complete: boolean
  /** Monte Carlo MEAN win total, not the median -- see median_wins for that. */
  projected_wins: number
  projected_losses: number
  median_wins: number
  wins_p10: number
  wins_p25: number
  wins_p75: number
  wins_p90: number
  /** Full win distribution, `{"0": p, "1": p, ...}` summing to 1. */
  p_win_dist: Record<string, number> | null
  p_bowl_eligible: number | null
  p_ten_plus: number | null
  sos_rating: number | null
  sos_rank: number | null
  /** Naive v1: share of sims with the best conference win pct, ties split evenly. */
  conf_title_prob: number | null
  /** NULL on every row by design -- the 12-team format is not modeled. */
  playoff_prob: number | null
  n_sims: number
  residual_sigma: number
}

// `projection_id` is omitted (an opaque surrogate key), and so is
// `strength_share`: it is a simulation hyperparameter constant across every
// row, and per-row it reads like a team attribute ("Georgia has a 15% strength
// share"), which it is not. `residual_sigma` is selected because the tool
// reports it once at the top level as a model-level constant.
const SEASON_OUTLOOK_COLUMNS = `
  projection_date, computed_at, model_version, season, team, conference,
  classification, is_projection,
  games_scheduled, games_simulated, games_unscored, games_completed,
  actual_wins, schedule_complete, projected_wins, projected_losses,
  median_wins, wins_p10, wins_p25, wins_p75, wins_p90, p_win_dist,
  p_bowl_eligible, p_ten_plus, sos_rating, sos_rank, conf_title_prob,
  playoff_prob, n_sims, residual_sigma
` as const

/**
 * The newest season present in the view.
 *
 * This backs the tool's `season` default instead of CURRENT_SEASON, and the
 * distinction matters: CURRENT_SEASON trails the calendar during the offseason
 * (it was still 2025 in July 2026), and the trailing season is not empty -- it
 * is a *completed* season whose rows are final records wearing a projection's
 * column names. Defaulting to it would hand callers hindsight labelled as a
 * forecast. Resolving from the data costs one round trip and stays correct
 * through every season rollover.
 *
 * Returns null (with no error) when the view is empty.
 */
export async function queryLatestOutlookSeason(): Promise<McpResult<{ season: number }>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('api')
    .from('season_outlook')
    .select('season')
    .eq('model_version', SEASON_OUTLOOK_MODEL)
    .order('season', { ascending: false })
    .limit(1)

  if (error) return { rows: [], error: fail('api.season_outlook', error) }
  return { rows: (data ?? []) as unknown as { season: number }[], error: null }
}

export interface SeasonOutlookFilter {
  season: number
  team?: string
  conference?: string
  /** 'fbs' | 'fcs' | 'ii' | 'iii'. Omit to span every division. */
  classification?: string
  limit?: number
}

/**
 * Rows for one season, narrowed by team, conference and/or classification.
 *
 * Ordered by projected_wins descending -- for a conference that ordering IS
 * the projected standings, which is the question this view exists to answer.
 * Team name breaks ties so repeated calls are stable.
 */
export async function querySeasonOutlook(
  filter: SeasonOutlookFilter
): Promise<McpResult<SeasonOutlookRow>> {
  const supabase = await createClient()

  let query = supabase
    .schema('api')
    .from('season_outlook')
    .select(SEASON_OUTLOOK_COLUMNS)
    .eq('model_version', SEASON_OUTLOOK_MODEL)
    .eq('season', filter.season)

  if (filter.team) query = query.eq('team', filter.team)
  if (filter.conference) query = query.eq('conference', filter.conference)
  // An `.eq` on classification also drops the NULL-classification rows, which
  // is correct: NULL is unplaceable, not a division.
  if (filter.classification) query = query.eq('classification', filter.classification)

  const { data, error } = await query
    .order('projected_wins', { ascending: false })
    .order('team', { ascending: true })
    .limit(clamp(filter.limit, SEASON_OUTLOOK_DEFAULT_LIMIT))

  if (error) return { rows: [], error: fail('api.season_outlook', error) }
  return { rows: (data ?? []) as unknown as SeasonOutlookRow[], error: null }
}

/** The scope `api.model_backtest` measures FBS projections under. */
export const MODEL_BACKTEST_SCOPE_FBS = 'fbs'

/**
 * The backtest window cfb-database designates as canonical for `fitted_v1`.
 *
 * Pinning it is necessary because model + scope does NOT reach a single row:
 * the view's grain includes the season window, and `fitted_v1`/`fbs` holds two
 * rows with the same run_date whose metrics are byte-identical and whose only
 * difference is season_start (2018 vs 2019).
 *
 * These bounds are the CONFIGURED window, not the evaluated one. Counting FBS
 * team-seasons settles it: api.leaderboard_teams gives 130/128/130/131/133/134/
 * 136 FBS teams for 2019..2025, summing to 922 -- against a reported n of 921,
 * one short, consistent with a single team dropped for want of a prior-season
 * vector. The same count over 2018-2025 is 1052, nowhere near. So the run was
 * evaluated over 2019-2025 while this row records a start of 2018, which is
 * what you would expect when the model needs a prior season of features: 2018
 * is the first season READ, 2019 the first season SCORED.
 *
 * The two rows are therefore one run recorded under two conventions, not a
 * duplicate to be deduplicated, and the metrics being byte-identical follows
 * from that. Consumers must not restate the window as a count of validated
 * seasons -- report n instead, which is why the tool layer renames this field
 * and ships a scale_note beside it.
 *
 * NOT treated as required: see queryModelBacktest's fallback. A hardcoded
 * window that silently returns nothing after the next re-run would make the
 * tool claim the model is unmeasured while a fresh backtest sat in the table,
 * which is the exact staleness failure reading the view live was meant to end.
 */
export const MODEL_BACKTEST_PREFERRED_WINDOW = { start: 2018, end: 2025 } as const

export interface ModelBacktestWindow {
  start: number
  end: number
}

export interface ModelBacktestRow {
  model_version: string
  scope: string
  run_date: string
  season_start: number
  season_end: number
  /** TEAM-SEASONS, not games. 921 on the current run. */
  n: number
  win_mae: number
  rmse: number
  bias: number
  coverage: number
  /** Low end of the 80% residual interval -- negative. */
  resid_p10: number
  /** High end of the 80% residual interval. Asymmetric against resid_p10. */
  resid_p90: number
  baseline_prior_mae: number | null
  baseline_flat_mae: number | null
  beats_prior_baseline: boolean | null
}

const MODEL_BACKTEST_COLUMNS = `
  model_version, scope, run_date, season_start, season_end, n,
  win_mae, rmse, bias, coverage, resid_p10, resid_p90,
  baseline_prior_mae, baseline_flat_mae, beats_prior_baseline
` as const

/**
 * Backtest runs for a model at a given scope, newest and most-recent-window
 * first. The caller uses row 0; row 1 is fetched only to detect an ambiguous
 * pick (see below).
 *
 * Replaces a block of figures this repo used to hardcode, which was correct
 * only until cfb-database re-ran the backtest -- at which point the shipped
 * numbers would have described a model that no longer existed and nothing
 * anywhere would have failed.
 *
 * `scope` is pinned deliberately. cfb-database treats 'all_divisions' as a
 * different measurement rather than a superset of 'fbs', and its bowl figures
 * were computing P(6+ wins) for divisions that have no bowls until the
 * 2026-07-27 release.
 *
 * Pinning model and scope is NOT enough to reach a single row. The view is
 * DISTINCT ON (model_version, scope, season_start, season_end, strength_share),
 * so one model+scope can hold several rows -- and it does: as of 2026-07-27
 * `fitted_v1`/`fbs` has two, identical in every metric and in run_date, differing
 * only in season_start (2018 vs 2019). Ordering by run_date alone therefore ties
 * and Postgres may return either, which made the reported backtest window flap
 * between runs. The season_start/season_end tiebreaks make the pick
 * deterministic; fetching two rows lets the caller notice when a tie is
 * material rather than cosmetic.
 *
 * Returns [] with no error when the model has never been backtested -- the
 * caller must render that as UNMEASURED, never as zero error.
 */
export async function queryModelBacktest(
  modelVersion: string = SEASON_OUTLOOK_MODEL,
  scope: string = MODEL_BACKTEST_SCOPE_FBS,
  window?: ModelBacktestWindow
): Promise<McpResult<ModelBacktestRow>> {
  const supabase = await createClient()
  let query = supabase
    .schema('api')
    .from('model_backtest')
    .select(MODEL_BACKTEST_COLUMNS)
    .eq('model_version', modelVersion)
    .eq('scope', scope)

  if (window) {
    query = query.eq('season_start', window.start).eq('season_end', window.end)
  }

  const { data, error } = await query
    .order('run_date', { ascending: false })
    .order('season_start', { ascending: false })
    .order('season_end', { ascending: false })
    .limit(2)

  if (error) return { rows: [], error: fail('api.model_backtest', error) }
  return { rows: (data ?? []) as unknown as ModelBacktestRow[], error: null }
}

export interface ResolvedBacktest extends McpResult<ModelBacktestRow> {
  /** True when the canonical window was absent and any-window was used instead. */
  windowFallback: boolean
}

/**
 * The backtest to quote: the canonical window if present, otherwise the newest
 * run over any window.
 *
 * The fallback is the point. Pinning a literal season window makes the query
 * deterministic today and wrong the day cfb-database re-runs over a different
 * span -- at which point a strict query returns nothing and the tool reports
 * the model as unmeasured while a perfectly good backtest sits in the table.
 * Falling back keeps the error band alive and flags which window answered.
 */
export async function resolveModelBacktest(
  modelVersion: string = SEASON_OUTLOOK_MODEL,
  scope: string = MODEL_BACKTEST_SCOPE_FBS
): Promise<ResolvedBacktest> {
  const pinned = await queryModelBacktest(modelVersion, scope, MODEL_BACKTEST_PREFERRED_WINDOW)
  if (pinned.error || pinned.rows.length > 0) return { ...pinned, windowFallback: false }

  const anyWindow = await queryModelBacktest(modelVersion, scope)
  return { ...anyWindow, windowFallback: anyWindow.rows.length > 0 }
}

/**
 * Do two candidate backtest rows disagree about anything this app reports?
 *
 * Duplicate rows per (model, scope) are expected -- different season windows
 * are a legitimate grain. What matters is whether picking one over the other
 * changes the answer. When the metrics match, the pick is cosmetic and needs no
 * warning; when they diverge, the caller must say the source was ambiguous
 * rather than silently reporting whichever row sorted first.
 */
export function backtestRowsDisagree(a: ModelBacktestRow, b: ModelBacktestRow): boolean {
  return (
    a.win_mae !== b.win_mae ||
    a.rmse !== b.rmse ||
    a.bias !== b.bias ||
    a.coverage !== b.coverage ||
    a.resid_p10 !== b.resid_p10 ||
    a.resid_p90 !== b.resid_p90 ||
    a.n !== b.n
  )
}
