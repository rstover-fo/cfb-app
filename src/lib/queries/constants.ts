// Pure constants with no server dependencies - safe for client components

// Fallback season constant, used only when the season resolver in
// src/lib/queries/season.ts (resolveCurrentSeason / getCurrentSeasonCached /
// getCurrentSeasonForRoute) cannot reach the warehouse. Every other caller
// should resolve the current season from that module, not read this
// directly -- it does not track season rollover on its own.
export const CURRENT_SEASON = 2025

// Upper bound for a season a chart request may name. This is a plausibility
// cap on user input, NOT the current season: the render_chart MCP tool
// (src/lib/mcp/tools.ts) validates against it before minting a signed URL and
// the image route (src/app/api/chart/[chart]/route.ts) validates the same URL
// against it again, so the two must agree exactly or the tool hands Discord a
// URL the route will 400. Keep it a shared constant rather than deriving it
// from the resolver on one side only.
export const CHART_MAX_SEASON = CURRENT_SEASON + 5

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
// The two Elo rows share one Elo-derived home_win_prob and differ only in
// expected_home_margin. That shared-win-prob rule does NOT extend to
// 'fitted_v1', the current house model: a fitted 20-feature ridge that carries
// its own Platt-scaled win probability (game 401856634 -> 0.8772 where both Elo
// rows say 0.7000). Never assume win probability is constant across versions.
export const PREDICTION_MODEL_VERSIONS = ['elo_v1', 'elo_epa_blend_v1', 'fitted_v1'] as const
export type PredictionModelVersion = typeof PREDICTION_MODEL_VERSIONS[number]
export const DEFAULT_PREDICTION_MODEL: PredictionModelVersion = 'fitted_v1'
