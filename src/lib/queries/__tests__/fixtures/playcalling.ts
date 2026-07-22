/**
 * Fixtures matching the api.* view row shapes queried by
 * src/lib/queries/playcalling.ts. Authoritative column definitions:
 * /workspace/cfb-database/src/schemas/api/*.sql (team_playcalling_profile,
 * adjusted_epa_week, team_week_features).
 */

// ---------------------------------------------------------------------------
// api.team_playcalling_profile -- one row per (team, season). Full profile
// with every rate/EPA/percentile column populated (a well-covered season).
// ---------------------------------------------------------------------------

export interface PlaycallingProfileRow {
  team: string
  season: number
  conference: string | null
  games_played: number | null
  overall_run_rate: number | null
  early_down_run_rate: number | null
  third_down_pass_rate: number | null
  red_zone_run_rate: number | null
  overall_success_rate: number | null
  overall_avg_epa: number | null
  third_down_success_rate: number | null
  red_zone_success_rate: number | null
  leading_run_rate: number | null
  trailing_run_rate: number | null
  run_rate_delta: number | null
  pace_plays_per_game: number | null
  overall_run_rate_pctl: number | null
  early_down_run_rate_pctl: number | null
  third_down_pass_rate_pctl: number | null
  overall_epa_pctl: number | null
  third_down_success_pctl: number | null
  red_zone_success_pctl: number | null
  run_rate_delta_pctl: number | null
  pace_pctl: number | null
}

export function createPlaycallingProfileRow(overrides: Partial<PlaycallingProfileRow> = {}): PlaycallingProfileRow {
  return {
    team: 'Ohio State',
    season: 2025,
    conference: 'Big Ten',
    games_played: 13,
    overall_run_rate: 0.412,
    early_down_run_rate: 0.478,
    third_down_pass_rate: 0.671,
    red_zone_run_rate: 0.520,
    overall_success_rate: 0.481,
    overall_avg_epa: 0.187,
    third_down_success_rate: 0.412,
    red_zone_success_rate: 0.593,
    leading_run_rate: 0.538,
    trailing_run_rate: 0.361,
    run_rate_delta: 0.177,
    pace_plays_per_game: 68.4,
    overall_run_rate_pctl: 0.55,
    early_down_run_rate_pctl: 0.61,
    third_down_pass_rate_pctl: 0.72,
    overall_epa_pctl: 0.91,
    third_down_success_pctl: 0.84,
    red_zone_success_pctl: 0.77,
    run_rate_delta_pctl: 0.68,
    pace_pctl: 0.44,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// api.adjusted_epa_week -- one row per (team, season, week_index). A 4-week
// arc: offensive coefficient climbing, defensive coefficient improving
// (more negative == fewer points allowed per the model's sign convention).
// ---------------------------------------------------------------------------

export interface AdjustedEpaWeekRow {
  team: string
  season: number
  week_index: number
  off_coef: number | null
  def_coef: number | null
  hfa_coef: number | null
  mu: number | null
  plays: number | null
}

export function createAdjustedEpaWeekRow(overrides: Partial<AdjustedEpaWeekRow> = {}): AdjustedEpaWeekRow {
  return {
    team: 'Ohio State',
    season: 2025,
    week_index: 1,
    off_coef: 0.142,
    def_coef: -0.081,
    hfa_coef: 0.024,
    mu: 0.061,
    plays: 512,
    ...overrides,
  }
}

/** 4-week arc, week_index 1..4, offense trending up and defense improving. */
export function createAdjustedEpaWeekRows(): AdjustedEpaWeekRow[] {
  return [
    createAdjustedEpaWeekRow({ week_index: 1, off_coef: 0.142, def_coef: -0.081, mu: 0.061, plays: 512 }),
    createAdjustedEpaWeekRow({ week_index: 2, off_coef: 0.158, def_coef: -0.093, mu: 0.063, plays: 588 }),
    createAdjustedEpaWeekRow({ week_index: 3, off_coef: 0.171, def_coef: -0.104, mu: 0.064, plays: 671 }),
    createAdjustedEpaWeekRow({ week_index: 4, off_coef: 0.179, def_coef: -0.112, mu: 0.065, plays: 754 }),
  ]
}

// ---------------------------------------------------------------------------
// api.team_week_features -- one row per (team, season, week_index), the
// chart-relevant column subset selected by getTeamWeekFeatures. A 4-week arc
// (week_index 1..4, week 1..4) matching the adjusted-EPA arc above.
// ---------------------------------------------------------------------------

export interface TeamWeekFeatureRow {
  season: number
  week: number | null
  week_index: number
  team: string
  conference: string | null
  game_id: number | null
  games_played_to_date: number | null
  elo_pregame: number | null
  adj_epa_off: number | null
  adj_epa_def: number | null
  adj_epa_net: number | null
  off_epa_per_play: number | null
  off_success_rate: number | null
  def_epa_per_play_allowed: number | null
  havoc_rate_defense: number | null
  havoc_rate_offense_allowed: number | null
}

export function createTeamWeekFeatureRow(overrides: Partial<TeamWeekFeatureRow> = {}): TeamWeekFeatureRow {
  return {
    season: 2025,
    week: 1,
    week_index: 1,
    team: 'Ohio State',
    conference: 'Big Ten',
    game_id: 401752810,
    games_played_to_date: 0,
    elo_pregame: 1840.0,
    adj_epa_off: 0.142,
    adj_epa_def: -0.081,
    adj_epa_net: 0.223,
    off_epa_per_play: 0.198,
    off_success_rate: 0.472,
    def_epa_per_play_allowed: -0.055,
    havoc_rate_defense: 0.184,
    havoc_rate_offense_allowed: 0.121,
    ...overrides,
  }
}

/** 4-week arc, week_index 1..4, elo/adj-EPA climbing alongside the adjusted-EPA arc above. */
export function createTeamWeekFeatureRows(): TeamWeekFeatureRow[] {
  return [
    createTeamWeekFeatureRow({
      week: 1, week_index: 1, game_id: 401752810, games_played_to_date: 0,
      elo_pregame: 1840.0, adj_epa_off: 0.142, adj_epa_def: -0.081, adj_epa_net: 0.223,
    }),
    createTeamWeekFeatureRow({
      week: 2, week_index: 2, game_id: 401752824, games_played_to_date: 1,
      elo_pregame: 1855.3, adj_epa_off: 0.158, adj_epa_def: -0.093, adj_epa_net: 0.251,
    }),
    createTeamWeekFeatureRow({
      week: 3, week_index: 3, game_id: 401752838, games_played_to_date: 2,
      elo_pregame: 1868.9, adj_epa_off: 0.171, adj_epa_def: -0.104, adj_epa_net: 0.275,
    }),
    createTeamWeekFeatureRow({
      week: 4, week_index: 4, game_id: 401752852, games_played_to_date: 3,
      elo_pregame: 1875.0, adj_epa_off: 0.179, adj_epa_def: -0.112, adj_epa_net: 0.291,
    }),
  ]
}
