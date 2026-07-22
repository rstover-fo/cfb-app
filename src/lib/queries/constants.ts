// Pure constants with no server dependencies - safe for client components

// Current season constant (fallback if query fails)
export const CURRENT_SEASON = 2025

// Week boundary constants for regular/postseason split
export const REGULAR_SEASON_MAX_WEEK = 14
export const POSTSEASON_MIN_WEEK = 15

// Earliest season with play-by-play coverage platform-wide (see
// src/lib/queries/games.ts's getGameWinProbability and src/lib/mcp/tools.ts).
// Player-level EPA attribution (stats.play_stats) is derived from PBP and
// does not exist before this season -- leaderboard/season selectors that key
// off PBP-derived stats should floor at this value instead of whatever a
// raw "available seasons" query happens to return.
export const PBP_MIN_SEASON = 2014

// House prediction model versions written by cfb-database's compute_predictions.py.
// home_win_prob is Elo-only in both rows; the blend only changes expected margin.
export const PREDICTION_MODEL_VERSIONS = ['elo_v1', 'elo_epa_blend_v1'] as const
export type PredictionModelVersion = typeof PREDICTION_MODEL_VERSIONS[number]
export const DEFAULT_PREDICTION_MODEL: PredictionModelVersion = 'elo_epa_blend_v1'
