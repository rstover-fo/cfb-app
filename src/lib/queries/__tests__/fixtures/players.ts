/**
 * Fixtures matching the api.* view row shapes queried by
 * src/lib/queries/players.ts's WEPA/usage leaderboard functions.
 * Authoritative column definitions: src/lib/types/api.generated.ts's
 * `player_wepa_leaders` / `player_usage_leaders` Rows (transcribed from
 * /workspace/cfb-database/src/schemas/marts/*.sql -- see that file's header
 * for the transcription caveat).
 */

import type { PlayerComparisonRow } from '../../players'

// ---------------------------------------------------------------------------
// api.player_wepa_leaders -- one row per (season, athlete_id, category).
// ---------------------------------------------------------------------------

export interface WepaLeaderRow {
  season: number
  athlete_id: string
  athlete_name: string
  position: string | null
  team: string
  conference: string | null
  category: string
  wepa: number | null
  paar: number | null
  metric: number | null
  plays: number | null
  season_rank: number
}

export function createWepaLeaderRow(overrides: Partial<WepaLeaderRow> = {}): WepaLeaderRow {
  return {
    season: 2025,
    athlete_id: 'athlete-1',
    athlete_name: 'Jackson Arnold',
    position: 'QB',
    team: 'Oklahoma',
    conference: 'SEC',
    category: 'passing',
    wepa: 42.8,
    paar: 18.3,
    metric: 0.31,
    plays: 385,
    season_rank: 1,
    ...overrides,
  }
}

/** A realistic top-3 passing leaderboard page. */
export function createWepaLeaderRows(): WepaLeaderRow[] {
  return [
    createWepaLeaderRow({ athlete_id: 'athlete-1', athlete_name: 'Jackson Arnold', team: 'Oklahoma', season_rank: 1, wepa: 42.8 }),
    createWepaLeaderRow({ athlete_id: 'athlete-2', athlete_name: 'Arch Manning', team: 'Texas', season_rank: 2, wepa: 39.1 }),
    createWepaLeaderRow({ athlete_id: 'athlete-3', athlete_name: 'Dylan Raiola', team: 'Nebraska', season_rank: 3, wepa: 35.6 }),
  ]
}

// ---------------------------------------------------------------------------
// api.player_usage_leaders -- one row per (season, athlete_id).
// ---------------------------------------------------------------------------

export interface UsageLeaderRow {
  season: number
  athlete_id: string
  player_name: string
  position: string | null
  team: string
  conference: string | null
  usage_overall: number | null
  usage_pass: number | null
  usage_rush: number | null
  usage_first_down: number | null
  usage_second_down: number | null
  usage_third_down: number | null
  usage_standard_downs: number | null
  usage_passing_downs: number | null
}

export function createUsageLeaderRow(overrides: Partial<UsageLeaderRow> = {}): UsageLeaderRow {
  return {
    season: 2025,
    athlete_id: 'athlete-1',
    player_name: 'Jackson Arnold',
    position: 'QB',
    team: 'Oklahoma',
    conference: 'SEC',
    usage_overall: 0.284,
    usage_pass: 0.612,
    usage_rush: 0.118,
    usage_first_down: 0.271,
    usage_second_down: 0.288,
    usage_third_down: 0.301,
    usage_standard_downs: 0.265,
    usage_passing_downs: 0.319,
    ...overrides,
  }
}

/** A realistic top-3 usage leaderboard page. */
export function createUsageLeaderRows(): UsageLeaderRow[] {
  return [
    createUsageLeaderRow({ athlete_id: 'athlete-1', player_name: 'Jackson Arnold', team: 'Oklahoma', usage_overall: 0.284 }),
    createUsageLeaderRow({ athlete_id: 'athlete-4', player_name: 'Kaytron Allen', position: 'RB', team: 'Penn State', usage_overall: 0.251, usage_pass: 0.02, usage_rush: 0.41 }),
    createUsageLeaderRow({ athlete_id: 'athlete-5', player_name: 'Nyck Harbor', position: 'WR', team: 'South Carolina', usage_overall: 0.219, usage_pass: 0.35, usage_rush: 0.01 }),
  ]
}

// ---------------------------------------------------------------------------
// api.player_comparison -- one row per (player_id, season): all
// player_detail columns + position_group + 12 position-group-relative
// percentile columns (*_pctl, 0-1 fractions).
// ---------------------------------------------------------------------------

/**
 * Default fixture is a QB season row with passing percentiles populated and
 * all receiving/defense stats + percentiles null -- the shape a real
 * position-grouped row has. Override for other position groups.
 */
export function createPlayerComparisonRow(
  overrides: Partial<PlayerComparisonRow> = {}
): PlayerComparisonRow {
  return {
    player_id: 'athlete-1',
    name: 'Jackson Arnold',
    team: 'Oklahoma',
    position: 'QB',
    position_group: 'QB',
    season: 2025,
    height: 73,
    weight: 211,
    jersey: 11,
    home_city: 'Denton',
    home_state: 'TX',
    stars: 5,
    recruit_rating: 0.9932,
    national_ranking: 8,
    recruit_class: 2023,
    pass_att: 385,
    pass_cmp: 251,
    pass_yds: 3182,
    pass_td: 24,
    pass_int: 6,
    pass_pct: 0.652,
    rush_car: 104,
    rush_yds: 444,
    rush_td: 6,
    rush_ypc: 4.3,
    rec: null,
    rec_yds: null,
    rec_td: null,
    rec_ypr: null,
    tackles: null,
    sacks: null,
    tfl: null,
    pass_def: null,
    ppa_avg: 0.287,
    ppa_total: 138.2,
    pass_yds_pctl: 0.88,
    pass_td_pctl: 0.81,
    pass_pct_pctl: 0.74,
    rush_yds_pctl: 0.69,
    rush_td_pctl: 0.62,
    rush_ypc_pctl: 0.55,
    rec_yds_pctl: null,
    rec_td_pctl: null,
    tackles_pctl: null,
    sacks_pctl: null,
    tfl_pctl: null,
    ppa_avg_pctl: 0.9,
    ...overrides,
  }
}
