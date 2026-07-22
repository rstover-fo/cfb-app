/**
 * Fixtures matching the api.* view row shapes queried by src/lib/queries/predictions.ts.
 * Authoritative column definitions: /workspace/cfb-database/src/schemas/api/*.sql
 * (032_game_predictions.sql, line_movement, game_elo_history, team_elo, team_ats,
 * prediction_accuracy, 037_scored_matchup_edges.sql).
 *
 * Lot A (this file's top section, through the marker below) owns the
 * game_predictions/line_movement/game_elo_history builders. Lot B appends
 * team_elo/team_ats/prediction_accuracy/scored_matchup_edges builders below
 * the marker -- see predictions-api-memo.md Section 7.
 */

// ---------------------------------------------------------------------------
// api.game_predictions -- edge = expected_home_margin + market_spread;
// edge > 0 => edge_pick 'home'. Worked example: edge = 4.0 + (-2.5) = 1.5 > 0.
// ---------------------------------------------------------------------------

export interface GamePredictionRow {
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
  edge_pick: 'home' | 'away' | null
}

export function createGamePredictionRow(overrides: Partial<GamePredictionRow> = {}): GamePredictionRow {
  return {
    computed_at: '2025-11-28T09:10:00+00:00',
    prediction_date: '2025-11-28',
    model_version: 'elo_epa_blend_v1',
    game_id: 401752873,
    season: 2025,
    week: 14,
    season_type: 'regular',
    home_team: 'Ohio State',
    away_team: 'Michigan',
    neutral_site: false,
    home_elo_pregame: 1892.4,
    away_elo_pregame: 1875.1,
    elo_margin: 3.2,
    epa_margin: 5.1,
    expected_home_margin: 4.0,
    home_win_prob: 0.62,
    market_provider: 'DraftKings',
    market_spread: -2.5,
    market_home_margin: 2.5,
    market_captured_at: '2025-11-28T08:00:00+00:00',
    edge: 1.5,
    edge_pick: 'home',
    ...overrides,
  }
}

/** Same game, the 'elo_v1' (Elo-only) model row -- same home_win_prob, different margin/edge inputs. */
export function createGamePredictionRowEloOnly(overrides: Partial<GamePredictionRow> = {}): GamePredictionRow {
  return createGamePredictionRow({
    model_version: 'elo_v1',
    epa_margin: null,
    expected_home_margin: 3.2,
    edge: 0.7, // 3.2 + (-2.5)
    edge_pick: 'home',
    ...overrides,
  })
}

/** A game with no posted line: market fields/edge/edge_pick all null, expected margin still present. */
export function createGamePredictionRowNoMarket(overrides: Partial<GamePredictionRow> = {}): GamePredictionRow {
  return createGamePredictionRow({
    game_id: 401752900,
    home_team: 'Boise State',
    away_team: 'Air Force',
    home_elo_pregame: 1620.0,
    away_elo_pregame: 1540.5,
    elo_margin: 6.1,
    epa_margin: 4.4,
    expected_home_margin: 5.2,
    home_win_prob: 0.71,
    market_provider: null,
    market_spread: null,
    market_home_margin: null,
    market_captured_at: null,
    edge: null,
    edge_pick: null,
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// api.line_movement -- append-only snapshots, one row per (game_id, provider,
// captured_at). 3-snapshot series, one provider, line moving toward home.
// ---------------------------------------------------------------------------

export interface LineMovementRow {
  captured_at: string
  provider: string
  spread: number | null
  formatted_spread: string | null
  over_under: number | null
  home_moneyline: number | null
  away_moneyline: number | null
}

export function createLineMovementRow(overrides: Partial<LineMovementRow> = {}): LineMovementRow {
  return {
    captured_at: '2025-11-24T08:00:00+00:00',
    provider: 'DraftKings',
    spread: -1.5,
    formatted_spread: 'Ohio State -1.5',
    over_under: 44.5,
    home_moneyline: -120,
    away_moneyline: 100,
    ...overrides,
  }
}

/** 3 DraftKings snapshots, captured_at ascending, spread moving from -1.5 to -3. */
export function createLineMovementRows(): LineMovementRow[] {
  return [
    createLineMovementRow({
      captured_at: '2025-11-24T08:00:00+00:00', provider: 'DraftKings', spread: -1.5,
      formatted_spread: 'Ohio State -1.5', over_under: 44.5, home_moneyline: -120, away_moneyline: 100,
    }),
    createLineMovementRow({
      captured_at: '2025-11-26T08:00:00+00:00', provider: 'DraftKings', spread: -2.5,
      formatted_spread: 'Ohio State -2.5', over_under: 44.5, home_moneyline: -135, away_moneyline: 115,
    }),
    createLineMovementRow({
      captured_at: '2025-11-28T08:00:00+00:00', provider: 'DraftKings', spread: -3,
      formatted_spread: 'Ohio State -3', over_under: 45, home_moneyline: -145, away_moneyline: 125,
    }),
  ]
}

// ---------------------------------------------------------------------------
// api.game_elo_history -- game-grain (one row per game, both teams'
// pregame/postgame Elo). postgame Elo of game N = pregame of game N+1 for a
// team's arc across consecutive games.
// ---------------------------------------------------------------------------

export interface GameEloHistoryRow {
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

export function createGameEloHistoryRow(overrides: Partial<GameEloHistoryRow> = {}): GameEloHistoryRow {
  return {
    game_id: 401752860,
    week: 12,
    season_type: 'regular',
    start_date: '2025-11-15T18:00:00+00:00',
    home_team: 'Ohio State',
    away_team: 'Purdue',
    home_pregame_elo: 1875.0,
    away_pregame_elo: 1610.2,
    home_postgame_elo: 1892.4,
    away_postgame_elo: 1595.8,
    home_win_prob: 0.88,
    ...overrides,
  }
}

/**
 * Ohio State's 2025 arc across three consecutive games -- postgame Elo of
 * game N equals pregame of game N+1 (Ohio State home in games 1 and 3, away
 * in game 2). Includes a trailing null-Elo row (Elo not yet computed for
 * this game) to exercise the drop-null-rows behavior.
 */
export function createTeamEloHistoryRows(): GameEloHistoryRow[] {
  return [
    createGameEloHistoryRow({
      game_id: 401752860, week: 12, start_date: '2025-11-15T18:00:00+00:00',
      home_team: 'Ohio State', away_team: 'Purdue',
      home_pregame_elo: 1875.0, away_pregame_elo: 1610.2,
      home_postgame_elo: 1892.4, away_postgame_elo: 1595.8,
      home_win_prob: 0.88,
    }),
    createGameEloHistoryRow({
      game_id: 401752873, week: 14, start_date: '2025-11-28T09:10:00+00:00',
      home_team: 'Michigan', away_team: 'Ohio State',
      home_pregame_elo: 1875.1, away_pregame_elo: 1892.4,
      home_postgame_elo: 1855.0, away_postgame_elo: 1912.9,
      home_win_prob: 0.38,
    }),
    createGameEloHistoryRow({
      game_id: 401752901, week: 16, start_date: '2025-12-06T20:00:00+00:00',
      home_team: 'Ohio State', away_team: 'Oregon',
      home_pregame_elo: 1912.9, away_pregame_elo: 1901.0,
      home_postgame_elo: null, away_postgame_elo: null,
      home_win_prob: null,
    }),
  ]
}

// ===== Lot B: team/model-scoped (append below; do not edit above this line) =====
