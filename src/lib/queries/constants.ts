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

// ---------------------------------------------------------------------------
// Monetization (docs/MONETIZATION_ROADMAP.md)
// ---------------------------------------------------------------------------

// Entitlement season. Deliberately NOT derived from CURRENT_SEASON:
// CURRENT_SEASON is the season with *data* (2025), while the pass being sold is
// for the *upcoming* season. `season_pass_${CURRENT_SEASON}` would mint
// season_pass_2025 and silently sell the wrong product.
export const ENTITLEMENT_SEASON = 2026
export const SEASON_PASS_PRODUCT = `season_pass_${ENTITLEMENT_SEASON}` as const
export const MCP_ADDON_PRODUCT = `mcp_addon_${ENTITLEMENT_SEASON}` as const

// Tier ladder. Lives in TypeScript rather than the DB so a pricing or limit
// experiment is a deploy, not a migration -- app.consume_chat_question takes
// both limits as parameters for exactly this reason.
export const FREE_CHAT_QUESTIONS_LIFETIME = 3
export const PASS_CHAT_QUESTIONS_PER_DAY = 5

// Day boundary for app.usage_counters. MUST match the timezone hardcoded in
// app.consume_chat_question() -- a mismatch means the UI and the enforcement
// disagree about when the cap resets.
export const USAGE_TIMEZONE = 'America/Chicago'
