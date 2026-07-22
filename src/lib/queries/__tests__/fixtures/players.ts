/**
 * Fixtures matching the api.* view row shapes queried by
 * src/lib/queries/players.ts's WEPA/usage leaderboard functions.
 * Authoritative column definitions: src/lib/types/api.generated.ts's
 * `player_wepa_leaders` / `player_usage_leaders` Rows (transcribed from
 * /workspace/cfb-database/src/schemas/marts/*.sql -- see that file's header
 * for the transcription caveat).
 */

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
