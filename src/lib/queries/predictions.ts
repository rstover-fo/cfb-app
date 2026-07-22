/**
 * Query fns for the predictions surface: house game predictions, market line
 * movement, and Elo history. All rows come from the contracted `api` schema
 * (never the raw `predictions` schema -- contract-guard enforced).
 * Authoritative SQL: /workspace/cfb-database/src/schemas/api/*.sql
 * (032_game_predictions.sql, line_movement, game_elo_history).
 *
 * Lot A (this file's top section, through the marker below) owns
 * getGamePrediction / getLineMovement / getTeamEloHistory. Lot B appends
 * team/model-scoped fns below the marker -- see predictions-api-memo.md
 * Section 7 for the file-conflict protocol.
 */
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_PREDICTION_MODEL } from './constants'
import { quoteFilterValue } from './shared'
// NOTE: the memo's module-header sketch (Section 2) imports `ApiSchema` here
// for the `Pick<ApiSchema[...]>` pattern, but per that same section that
// pattern only applies "where everything stays nullable" (like games.ts's
// GameLineScoresRow) -- none of Lot A's three interfaces qualify (each
// narrows at least its grain/identity columns non-null), so there is no
// call site for it in this file's Lot A section and the import is omitted
// to keep `no-unused-vars` clean. Lot B's fns are also all fully hand-typed
// per the memo's own Section 4 signatures, so this may stay unimported;
// re-add it if a future addition needs the Pick<> form.

export type EdgePick = 'home' | 'away'

// ---------------------------------------------------------------------------
// api.game_predictions -- already latest-snapshot (DISTINCT ON game_id,
// model_version ORDER BY prediction_date DESC), so a game_id + model_version
// filter returns at most one row. Two model versions are written per game
// ('elo_v1', 'elo_epa_blend_v1' -- see constants.ts); home_win_prob is
// Elo-only in both, so callers must always filter model_version.
//
// See src/lib/types/api.generated.ts's `game_predictions` Row for the full
// generated shape -- kept hand-typed here since this query's .select() pulls
// a column subset (omitting prediction_id; its wire type is unconfirmed per
// that Row's comment) and narrows identity/grain + expected_home_margin/
// home_win_prob non-null (guaranteed by the view's source joins), while
// market_*/edge fields stay nullable (a game with no posted line still gets
// a row -- meaningful expected margin, unscoreable edge).
// ---------------------------------------------------------------------------
export interface GamePrediction {
  game_id: number
  season: number
  week: number
  season_type: string
  model_version: string
  prediction_date: string
  computed_at: string
  home_team: string
  away_team: string
  neutral_site: boolean
  home_elo_pregame: number | null
  away_elo_pregame: number | null
  elo_margin: number | null
  epa_margin: number | null
  expected_home_margin: number
  home_win_prob: number
  market_provider: string | null
  market_spread: number | null
  market_home_margin: number | null
  market_captured_at: string | null
  edge: number | null
  edge_pick: EdgePick | null
}

// Get the house prediction for one game + model version from the contracted
// api.game_predictions view. Returns null on error/no row -- normal for old
// seasons or before the model has run for this game, never an error state.
export const getGamePrediction = cache(async (
  gameId: number,
  modelVersion: string = DEFAULT_PREDICTION_MODEL
): Promise<GamePrediction | null> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('game_predictions')
    .select('game_id, season, week, season_type, model_version, prediction_date, computed_at, home_team, away_team, neutral_site, home_elo_pregame, away_elo_pregame, elo_margin, epa_margin, expected_home_margin, home_win_prob, market_provider, market_spread, market_home_margin, market_captured_at, edge, edge_pick')
    .eq('game_id', gameId)
    .eq('model_version', modelVersion)
    .maybeSingle()

  if (error || !data) return null

  return data as GamePrediction
})

// ---------------------------------------------------------------------------
// api.line_movement -- append-only snapshots of pending games, one row per
// (game_id, provider, captured_at). Completed/historical games may have zero
// rows -- an empty array is a valid state, not a failure.
// ---------------------------------------------------------------------------
export interface LineMovementPoint {
  captured_at: string
  provider: string
  spread: number | null
  formatted_spread: string | null
  over_under: number | null
  home_moneyline: number | null
  away_moneyline: number | null
}

// Daily snapshots x a handful of providers -- explicit cap per games.ts's
// WIN_PROBABILITY_ROW_LIMIT precedent, well above realistic row volume.
const LINE_MOVEMENT_ROW_LIMIT = 500

// Get the market line movement series for a game from the contracted
// api.line_movement view, ordered provider then captured_at ascending (ready
// for the chart client to group by provider into one series each). Returns
// [] on error/empty -- completed or pre-2026 games have no snapshots.
export const getLineMovement = cache(async (gameId: number): Promise<LineMovementPoint[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('line_movement')
    .select('captured_at, provider, spread, formatted_spread, over_under, home_moneyline, away_moneyline')
    .eq('game_id', gameId)
    .order('provider', { ascending: true })
    .order('captured_at', { ascending: true })
    .limit(LINE_MOVEMENT_ROW_LIMIT)

  if (error || !data) return []

  return data as LineMovementPoint[]
})

// ---------------------------------------------------------------------------
// api.game_elo_history -- game-grain (one row per game, both teams' pregame/
// postgame Elo). A team's season trajectory is a filtered+mapped read of it,
// team/season-scoped and mapped to the requested team's perspective (there is
// no separate game-scoped Elo fn -- game detail's needs are covered by
// getGamePrediction).
// ---------------------------------------------------------------------------
export interface TeamEloGamePoint {
  game_id: number
  week: number
  season_type: string
  start_date: string
  opponent: string
  is_home: boolean
  pregame_elo: number
  postgame_elo: number
  team_win_prob: number | null // home_win_prob from team's perspective (1 - x when away)
}

// Row shape for api.game_elo_history's column subset this query pulls. See
// src/lib/types/api.generated.ts's `game_elo_history` Row for the full
// generated shape (every column nullable there) -- kept hand-typed here
// since this query selects a column subset and the mapping below narrows
// game_id/week/season_type/start_date/home_team/away_team non-null (grain
// columns guaranteed by the view's source joins), while the Elo/win-prob
// columns stay nullable per the interface's own null-dropping rule below.
interface GameEloHistoryRow {
  game_id: number
  week: number
  season_type: string
  start_date: string
  home_team: string
  away_team: string
  home_pregame_elo: number | null
  away_pregame_elo: number | null
  home_postgame_elo: number | null
  away_postgame_elo: number | null
  home_win_prob: number | null
}

// Get a team's season Elo trajectory (pregame -> postgame per game) from the
// contracted api.game_elo_history view, mapped to the requested team's
// perspective. Rows where the team's pregame or postgame Elo is null are
// dropped (the chart needs clean numbers). Returns [] on error/empty.
export const getTeamEloHistory = cache(async (team: string, season: number): Promise<TeamEloGamePoint[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('game_elo_history')
    .select('game_id, week, season_type, start_date, home_team, away_team, home_pregame_elo, away_pregame_elo, home_postgame_elo, away_postgame_elo, home_win_prob')
    .eq('season', season)
    .or(`home_team.eq."${quoteFilterValue(team)}",away_team.eq."${quoteFilterValue(team)}"`)
    .order('start_date', { ascending: true })

  if (error || !data) return []

  const rows = data as GameEloHistoryRow[]

  const points: TeamEloGamePoint[] = []
  for (const row of rows) {
    const isHome = row.home_team === team
    const pregameElo = isHome ? row.home_pregame_elo : row.away_pregame_elo
    const postgameElo = isHome ? row.home_postgame_elo : row.away_postgame_elo

    if (pregameElo == null || postgameElo == null) continue

    points.push({
      game_id: row.game_id,
      week: row.week,
      season_type: row.season_type,
      start_date: row.start_date,
      opponent: isHome ? row.away_team : row.home_team,
      is_home: isHome,
      pregame_elo: pregameElo,
      postgame_elo: postgameElo,
      team_win_prob: isHome ? row.home_win_prob : (row.home_win_prob == null ? null : 1 - row.home_win_prob),
    })
  }

  return points
})

// ===== Lot B: team/model-scoped (append below; do not edit above this line) =====

// ---------------------------------------------------------------------------
// api.team_elo -- one row per (team, season): season-end Elo rating/rank.
// ---------------------------------------------------------------------------
export interface TeamElo {
  team: string
  season: number
  season_end_elo: number
  elo_rank: number
  games_played: number
  low_confidence: boolean
  cfbd_elo: number | null
}

// Get a team's season-end Elo rating/rank from the contracted api.team_elo
// view. Returns null on error/no row (team not covered this season).
export const getTeamElo = cache(async (team: string, season: number): Promise<TeamElo | null> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('team_elo')
    .select('team, season, season_end_elo, elo_rank, games_played, low_confidence, cfbd_elo')
    .eq('team', team)
    .eq('season', season)
    .maybeSingle()

  if (error || !data) return null

  const row = data as TeamElo

  return {
    ...row,
    low_confidence: row.low_confidence ?? false,
  }
})

// ---------------------------------------------------------------------------
// api.team_ats -- one row per (team, season): against-the-spread record.
// ---------------------------------------------------------------------------
export interface TeamAts {
  team: string
  season: number
  conference: string | null
  games: number
  ats_wins: number
  ats_losses: number
  ats_pushes: number
  avg_cover_margin: number | null
  ats_win_pct: number | null
}

// Get a team's season against-the-spread record from the contracted
// api.team_ats view. Returns null on error/no row (pre-lines-coverage seasons).
export const getTeamAts = cache(async (team: string, season: number): Promise<TeamAts | null> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('team_ats')
    .select('team, season, conference, games, ats_wins, ats_losses, ats_pushes, avg_cover_margin, ats_win_pct')
    .eq('team', team)
    .eq('season', season)
    .maybeSingle()

  if (error || !data) return null

  return data as TeamAts
})

// ---------------------------------------------------------------------------
// api.prediction_accuracy -- grain (model_version, season, edge_threshold),
// ~90 rows total. UI groups/filters client-side (model + threshold selectors).
// ---------------------------------------------------------------------------
export interface PredictionAccuracyRow {
  model_version: string
  season: number
  edge_threshold: number
  n_games: number
  n_with_market: number | null
  margin_mae: number | null
  margin_rmse: number | null
  ats_wins: number | null
  ats_losses: number | null
  ats_pushes: number | null
  ats_hit_rate: number | null
  brier: number | null
  cfbd_brier: number | null
  n_scored_win_prob: number | null
}

const PREDICTION_ACCURACY_ROW_LIMIT = 500

// Get model accuracy/calibration rows (one per model_version/season/edge_threshold)
// from the contracted api.prediction_accuracy view. Returns [] on error/empty.
export const getPredictionAccuracy = cache(async (): Promise<PredictionAccuracyRow[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('prediction_accuracy')
    .select('model_version, season, edge_threshold, n_games, n_with_market, margin_mae, margin_rmse, ats_wins, ats_losses, ats_pushes, ats_hit_rate, brier, cfbd_brier, n_scored_win_prob')
    .order('season', { ascending: false })
    .order('model_version', { ascending: true })
    .order('edge_threshold', { ascending: true })
    .limit(PREDICTION_ACCURACY_ROW_LIMIT)

  if (error || !data) return []

  return data as PredictionAccuracyRow[]
})

// ---------------------------------------------------------------------------
// api.scored_matchup_edges -- upcoming-games-only; legitimately empty out of
// season (no empty-guard by design). Two model versions are written per game
// (see EdgePick/getGamePrediction header above), so model_version filtering
// is mandatory here too -- otherwise every game appears twice.
// ---------------------------------------------------------------------------
export interface ScoredMatchupEdge {
  game_id: number
  season: number
  week: number
  season_type: string
  start_date: string
  home_team: string
  away_team: string
  neutral_site: boolean
  model_version: string
  prediction_date: string
  home_elo_pregame: number | null
  away_elo_pregame: number | null
  elo_margin: number | null
  epa_margin: number | null
  expected_home_margin: number
  home_win_prob: number
  market_provider: string | null
  market_spread: number | null
  market_home_margin: number | null
  market_captured_at: string | null
  edge: number | null
  edge_pick: EdgePick | null
  abs_edge: number | null
}

const SCORED_MATCHUP_EDGES_ROW_LIMIT = 200

// Get the scored matchup-edge slate for a season (optionally a single week)
// from the contracted api.scored_matchup_edges view, sorted by conviction
// (abs_edge descending, nulls last -- null-market rows sort last and stay
// included). Off-season/empty is a valid state: returns [], never an error
// -- the UI renders an explicit "No upcoming games on the board" empty state.
export const getScoredMatchupEdges = cache(async (
  season: number,
  week?: number,
  modelVersion: string = DEFAULT_PREDICTION_MODEL
): Promise<ScoredMatchupEdge[]> => {
  const supabase = await createClient()

  let query = supabase
    .schema('api')
    .from('scored_matchup_edges')
    .select('game_id, season, week, season_type, start_date, home_team, away_team, neutral_site, model_version, prediction_date, home_elo_pregame, away_elo_pregame, elo_margin, epa_margin, expected_home_margin, home_win_prob, market_provider, market_spread, market_home_margin, market_captured_at, edge, edge_pick, abs_edge')
    .eq('season', season)
    .eq('model_version', modelVersion)

  if (week && week > 0) {
    query = query.eq('week', week)
  }

  const { data, error } = await query
    .order('abs_edge', { ascending: false, nullsFirst: false })
    .limit(SCORED_MATCHUP_EDGES_ROW_LIMIT)

  if (error || !data) return []

  return data as ScoredMatchupEdge[]
})
