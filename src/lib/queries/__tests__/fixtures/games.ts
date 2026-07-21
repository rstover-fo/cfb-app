/**
 * Fixtures matching the api.* view row shapes queried by src/lib/queries/games.ts.
 * Authoritative column definitions: /workspace/cfb-database/src/schemas/api/*.sql
 * (011_game_box_score.sql, 010_game_player_leaders.sql, 012_game_line_scores.sql,
 * 019_game_drives.sql, 020_game_plays.sql).
 */

// ---------------------------------------------------------------------------
// api.game_box_score — EAV: one row per stat category per team
// ---------------------------------------------------------------------------

export interface GameBoxScoreRow {
  team: string
  home_away: 'home' | 'away'
  category: string
  stat_value: string
}

export function createGameBoxScoreRow(overrides: Partial<GameBoxScoreRow> = {}): GameBoxScoreRow {
  return {
    team: 'Oklahoma',
    home_away: 'home',
    category: 'totalYards',
    stat_value: '420',
    ...overrides,
  }
}

/** One row per category, per side — a realistic full box score for a game. */
export function createGameBoxScoreRows(): GameBoxScoreRow[] {
  return [
    createGameBoxScoreRow({ team: 'Oklahoma', home_away: 'home', category: 'totalYards', stat_value: '420' }),
    createGameBoxScoreRow({ team: 'Oklahoma', home_away: 'home', category: 'possessionTime', stat_value: '31:12' }),
    createGameBoxScoreRow({ team: 'Houston', home_away: 'away', category: 'totalYards', stat_value: '310' }),
    createGameBoxScoreRow({ team: 'Houston', home_away: 'away', category: 'possessionTime', stat_value: '28:48' }),
  ]
}

// ---------------------------------------------------------------------------
// api.game_player_leaders — one row per player per stat_type per category
// ---------------------------------------------------------------------------

export interface GamePlayerLeaderRow {
  team: string
  home_away: 'home' | 'away'
  category: string
  stat_type: string
  player_id: string
  player_name: string
  stat: string
}

export function createGamePlayerLeaderRow(
  overrides: Partial<GamePlayerLeaderRow> = {}
): GamePlayerLeaderRow {
  return {
    team: 'Oklahoma',
    home_away: 'home',
    category: 'passing',
    stat_type: 'YDS',
    player_id: '100',
    player_name: 'Jackson Arnold',
    stat: '287',
    ...overrides,
  }
}

/**
 * Two home passers (tied on YDS, distinguished only by player_id order —
 * rows are pre-sorted by player_id ascending, matching the `.order('player_id')`
 * the real query applies) plus one away rusher, across passing/rushing/defensive
 * categories with multiple stat_types per player.
 */
export function createGamePlayerLeaderRows(): GamePlayerLeaderRow[] {
  return [
    // home passing — player 100 and 101 tie on YDS; 100 sorts first (player_id asc)
    createGamePlayerLeaderRow({ team: 'Oklahoma', home_away: 'home', category: 'passing', stat_type: 'YDS', player_id: '100', player_name: 'Jackson Arnold', stat: '250' }),
    createGamePlayerLeaderRow({ team: 'Oklahoma', home_away: 'home', category: 'passing', stat_type: 'TD', player_id: '100', player_name: 'Jackson Arnold', stat: '2' }),
    createGamePlayerLeaderRow({ team: 'Oklahoma', home_away: 'home', category: 'passing', stat_type: 'YDS', player_id: '101', player_name: 'Michael Hawkins', stat: '250' }),
    createGamePlayerLeaderRow({ team: 'Oklahoma', home_away: 'home', category: 'passing', stat_type: 'TD', player_id: '101', player_name: 'Michael Hawkins', stat: '1' }),
    // home rushing — a single back with YDS + TD rows merged
    createGamePlayerLeaderRow({ team: 'Oklahoma', home_away: 'home', category: 'rushing', stat_type: 'YDS', player_id: '110', player_name: 'Jovantae Barnes', stat: '112' }),
    createGamePlayerLeaderRow({ team: 'Oklahoma', home_away: 'home', category: 'rushing', stat_type: 'TD', player_id: '110', player_name: 'Jovantae Barnes', stat: '1' }),
    // away rushing — numeric sort must beat string sort: '87' < '106' numerically
    createGamePlayerLeaderRow({ team: 'Houston', home_away: 'away', category: 'rushing', stat_type: 'YDS', player_id: '200', player_name: 'Stacy Sneed', stat: '87' }),
    createGamePlayerLeaderRow({ team: 'Houston', home_away: 'away', category: 'rushing', stat_type: 'YDS', player_id: '201', player_name: 'Parker Jenkins', stat: '106' }),
    // away defensive — mapped to UI category "defense", sorted by TOT descending
    createGamePlayerLeaderRow({ team: 'Houston', home_away: 'away', category: 'defensive', stat_type: 'TOT', player_id: '210', player_name: 'Jamal George', stat: '9' }),
    createGamePlayerLeaderRow({ team: 'Houston', home_away: 'away', category: 'defensive', stat_type: 'TOT', player_id: '211', player_name: 'Alex Hogan', stat: '11' }),
  ]
}

// ---------------------------------------------------------------------------
// api.game_line_scores — pivoted q1-q4 + summed ot per side
// ---------------------------------------------------------------------------

export interface GameLineScoresRow {
  home_q1: number | null
  home_q2: number | null
  home_q3: number | null
  home_q4: number | null
  home_ot: number | null
  away_q1: number | null
  away_q2: number | null
  away_q3: number | null
  away_q4: number | null
  away_ot: number | null
}

export function createGameLineScoresRow(
  overrides: Partial<GameLineScoresRow> = {}
): GameLineScoresRow {
  return {
    home_q1: 7,
    home_q2: 14,
    home_q3: 7,
    home_q4: 7,
    home_ot: null,
    away_q1: 0,
    away_q2: 7,
    away_q3: 0,
    away_q4: 7,
    away_ot: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// api.game_drives
// ---------------------------------------------------------------------------

export interface GameDriveRow {
  drive_number: number
  offense: string
  defense: string
  start_period: number
  start_yards_to_goal: number
  end_yards_to_goal: number
  plays: number
  yards: number
  drive_result: string
  scoring: boolean
  start_offense_score: number
  end_offense_score: number
  start_defense_score: number
  end_defense_score: number
  start_time_minutes: number
  start_time_seconds: number
  elapsed_minutes: number
  elapsed_seconds: number
  is_home_offense: boolean
}

export function createGameDriveRow(overrides: Partial<GameDriveRow> = {}): GameDriveRow {
  return {
    drive_number: 1,
    offense: 'Oklahoma',
    defense: 'Houston',
    start_period: 1,
    start_yards_to_goal: 75,
    end_yards_to_goal: 0,
    plays: 8,
    yards: 75,
    drive_result: 'TD',
    scoring: true,
    start_offense_score: 0,
    end_offense_score: 7,
    start_defense_score: 0,
    end_defense_score: 0,
    start_time_minutes: 15,
    start_time_seconds: 0,
    elapsed_minutes: 4,
    elapsed_seconds: 30,
    is_home_offense: true,
    ...overrides,
  }
}

export function createGameDriveRows(): GameDriveRow[] {
  return [
    createGameDriveRow({ drive_number: 1, offense: 'Oklahoma', defense: 'Houston', is_home_offense: true }),
    createGameDriveRow({
      drive_number: 2,
      offense: 'Houston',
      defense: 'Oklahoma',
      drive_result: 'PUNT',
      scoring: false,
      is_home_offense: false,
    }),
  ]
}

// ---------------------------------------------------------------------------
// api.game_plays — unfiltered by play type; client filters EXCLUDED_PLAY_TYPES
// ---------------------------------------------------------------------------

export interface GamePlayRow {
  game_id: number
  drive_number: number
  play_number: number
  offense: string
  defense: string
  period: number
  clock_minutes: number | null
  clock_seconds: number | null
  down: number | null
  distance: number | null
  yards_to_goal: number | null
  yards_gained: number | null
  play_type: string | null
  play_text: string | null
  ppa: number | null
  scoring: boolean
  offense_score: number
  defense_score: number
}

export function createGamePlayRow(overrides: Partial<GamePlayRow> = {}): GamePlayRow {
  return {
    game_id: 1001,
    drive_number: 1,
    play_number: 1,
    offense: 'Oklahoma',
    defense: 'Houston',
    period: 1,
    clock_minutes: 15,
    clock_seconds: 0,
    down: 1,
    distance: 10,
    yards_to_goal: 75,
    yards_gained: 8,
    play_type: 'Rush',
    play_text: 'Player rushes for 8 yards',
    ppa: 0.15,
    scoring: false,
    offense_score: 0,
    defense_score: 0,
    ...overrides,
  }
}

/** Mixes real plays with every EXCLUDED_PLAY_TYPES entry, plus a null play_type row. */
export function createGamePlayRowsWithExcludedTypes(): GamePlayRow[] {
  return [
    createGamePlayRow({ drive_number: 1, play_number: 1, play_type: 'Kickoff' }),
    createGamePlayRow({ drive_number: 1, play_number: 2, play_type: 'Rush', yards_gained: 8 }),
    createGamePlayRow({ drive_number: 1, play_number: 3, play_type: 'Pass Reception', yards_gained: 15 }),
    createGamePlayRow({ drive_number: 1, play_number: 4, play_type: 'Timeout' }),
    createGamePlayRow({ drive_number: 2, play_number: 1, play_type: 'End Period' }),
    createGamePlayRow({ drive_number: 2, play_number: 2, play_type: 'Sack', yards_gained: -5 }),
    createGamePlayRow({ drive_number: 2, play_number: 3, play_type: 'End of Game' }),
    createGamePlayRow({ drive_number: 2, play_number: 4, play_type: null }),
  ]
}

// ---------------------------------------------------------------------------
// api.game_win_probability — one row per play, CFBD's in-game WP model
// Authoritative definition: /workspace/cfb-database/src/schemas/api/033_game_win_probability.sql
// ---------------------------------------------------------------------------

export interface GameWinProbabilityRow {
  play_id: string
  home_win_probability: number | null
  period: number | null
  clock_minutes: number | null
  clock_seconds: number | null
}

export function createGameWinProbabilityRow(
  overrides: Partial<GameWinProbabilityRow> = {}
): GameWinProbabilityRow {
  return {
    play_id: '401628455101',
    home_win_probability: 0.5,
    period: 1,
    clock_minutes: 15,
    clock_seconds: 0,
    ...overrides,
  }
}

/** A handful of plays across all four quarters, play_id-ascending (the query's ordering). */
export function createGameWinProbabilityRows(): GameWinProbabilityRow[] {
  return [
    createGameWinProbabilityRow({ play_id: '1', home_win_probability: 0.5, period: 1, clock_minutes: 15, clock_seconds: 0 }),
    createGameWinProbabilityRow({ play_id: '2', home_win_probability: 0.58, period: 1, clock_minutes: 10, clock_seconds: 30 }),
    createGameWinProbabilityRow({ play_id: '3', home_win_probability: 0.62, period: 2, clock_minutes: 5, clock_seconds: 0 }),
    createGameWinProbabilityRow({ play_id: '4', home_win_probability: 0.71, period: 3, clock_minutes: 8, clock_seconds: 15 }),
    createGameWinProbabilityRow({ play_id: '5', home_win_probability: 0.83, period: 4, clock_minutes: 2, clock_seconds: 0 }),
  ]
}

/** period/clock_minutes/clock_seconds all null -- the defensive core.plays LEFT JOIN found no id match. */
export function createGameWinProbabilityRowsNoClockJoin(): GameWinProbabilityRow[] {
  return [
    createGameWinProbabilityRow({ play_id: '1', home_win_probability: 0.5, period: null, clock_minutes: null, clock_seconds: null }),
    createGameWinProbabilityRow({ play_id: '2', home_win_probability: 0.55, period: null, clock_minutes: null, clock_seconds: null }),
    createGameWinProbabilityRow({ play_id: '3', home_win_probability: 0.6, period: null, clock_minutes: null, clock_seconds: null }),
  ]
}

// ---------------------------------------------------------------------------
// api.game_recaps — one row per game, nightly LLM-generated
// Authoritative definition: /workspace/cfb-database/src/schemas/api/034_game_recaps.sql
// ---------------------------------------------------------------------------

export interface GameRecapRow {
  headline: string
  recap: string
  wp_available: boolean
  model: string
  generated_at: string
}

export function createGameRecapRow(overrides: Partial<GameRecapRow> = {}): GameRecapRow {
  return {
    headline: 'Sooners Rally Late to Stun Houston',
    recap: 'Oklahoma trailed by 10 entering the fourth quarter before a late surge sealed the win.\n\nThe defense forced two turnovers in the final five minutes to close it out.',
    wp_available: true,
    model: 'claude-sonnet-4',
    generated_at: '2026-07-20T04:00:00Z',
    ...overrides,
  }
}
