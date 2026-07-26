import { createClient } from '@/lib/supabase/server'
import { fail, clamp, type McpResult } from './mcp'

// ---------------------------------------------------------------------------
// Query layer for the season-projection MCP tool (get_season_outlook in
// src/lib/mcp/tools.ts), over one api-schema view:
//
//   api.season_outlook -- one row per (season, team, model_version), already
//     DISTINCT ON that grain ordered by projection_date DESC, so it is the
//     latest snapshot per team-season and needs no dedup here. Each row is
//     the summary of n_sims Monte Carlo seasons in which every remaining
//     game was drawn from the game-level model's prediction.
//
// Three things about this view are load-bearing and easy to get wrong:
//
//   1. It is NOT FBS-only. The 2026 snapshot spans ~50 conferences including
//      FCS, DII and DIII, many of whose teams have only one or two games
//      loaded. An unfiltered "top projected win totals" ordering is therefore
//      meaningless, which is why the tool layer requires a team or conference
//      filter rather than offering an unfiltered mode.
//   2. Projected quantities are over `games_simulated`, never
//      `games_scheduled`. A scheduled game the model could not score is
//      EXCLUDED from the simulation, not counted as a loss -- so
//      `projected_losses` understates a slate with `games_unscored > 0`.
//   3. A season whose games are already played is still in this view, and its
//      "projection" is just the final record with a collapsed percentile band.
//      Callers must check `games_completed` before calling any of it a
//      forecast; the tool layer derives its caveat strings from these columns.
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
  limit?: number
}

/**
 * Rows for one season, narrowed by team and/or conference.
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

  const { data, error } = await query
    .order('projected_wins', { ascending: false })
    .order('team', { ascending: true })
    .limit(clamp(filter.limit, SEASON_OUTLOOK_DEFAULT_LIMIT))

  if (error) return { rows: [], error: fail('api.season_outlook', error) }
  return { rows: (data ?? []) as unknown as SeasonOutlookRow[], error: null }
}
