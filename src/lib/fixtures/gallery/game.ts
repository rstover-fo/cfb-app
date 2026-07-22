/**
 * Game-family chart fixtures (DriveBarChart, DriveFieldOverlay,
 * WinProbabilityChart, MomentumChart, ScoreStepLine, LineMovementChart,
 * DownDistanceHeatmap, DrivePatterns).
 *
 * REAL-SEEDED (2026-07-22, CFBD MCP
 * `situational_splits({ team: "Ohio State", season: 2025, split_type: "down_distance" })`):
 * `DOWN_DISTANCE_SPLITS` below is the tool's actual 31-row response, used
 * verbatim for both DownDistanceHeatmap sides. Everything else (the
 * specific game, its 20-drive sequence, win probability curve, line
 * movement snapshots, and aggregate drive-pattern outcomes) is
 * hand-authored -- CFBD MCP has no play-by-play/drive/odds endpoints among
 * the tools loaded for this task -- but the final score (34-10) and each
 * team's per-drive point totals are internally consistent with Ohio
 * State's real 2025 scoring identity (ppg 33.4, opp_ppg 9.3, elite defense).
 */
import type { GameDrive, LineScores, GameWinProbability, DownDistanceSplit, DrivePattern } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'
import type { LineMovementPoint } from '@/lib/queries/predictions'
import { GALLERY_TEAM, GALLERY_TEAM_COLOR } from './team'

export const GALLERY_OPPONENT = 'Illinois'
export const GALLERY_OPPONENT_COLOR = '#13294B' // hand-authored, well-known Illinois navy

export const GAME: GameWithTeams = {
  id: 401752894,
  season: 2025,
  week: 7,
  start_date: '2025-10-11T16:00:00Z',
  home_team: GALLERY_TEAM,
  away_team: GALLERY_OPPONENT,
  home_points: 34,
  away_points: 10,
  conference_game: true,
  completed: true,
  homeLogo: null,
  homeColor: GALLERY_TEAM_COLOR,
  awayLogo: null,
  awayColor: GALLERY_OPPONENT_COLOR,
}

export const LINE_SCORES: LineScores = {
  home: [10, 7, 10, 7],
  away: [0, 3, 0, 7],
}

function drive(overrides: Partial<GameDrive>): GameDrive {
  return {
    drive_number: 1,
    offense: GALLERY_TEAM,
    defense: GALLERY_OPPONENT,
    start_period: 1,
    start_yards_to_goal: 75,
    end_yards_to_goal: 75,
    plays: 5,
    yards: 0,
    drive_result: 'PUNT',
    scoring: false,
    start_offense_score: 0,
    end_offense_score: 0,
    start_defense_score: 0,
    end_defense_score: 0,
    start_time_minutes: 15,
    start_time_seconds: 0,
    elapsed_minutes: 2,
    elapsed_seconds: 30,
    is_home_offense: true,
    ...overrides,
  }
}

/** 20-drive sequence, home/away alternating, summing to the 34-10 final above. */
export const DRIVES: GameDrive[] = [
  drive({ drive_number: 1, offense: GALLERY_TEAM, defense: GALLERY_OPPONENT, is_home_offense: true, start_period: 1, start_yards_to_goal: 75, end_yards_to_goal: 0, plays: 8, yards: 75, drive_result: 'TD', scoring: true, start_offense_score: 0, end_offense_score: 7, start_defense_score: 0, end_defense_score: 0, start_time_minutes: 15, start_time_seconds: 0, elapsed_minutes: 4, elapsed_seconds: 12 }),
  drive({ drive_number: 2, offense: GALLERY_OPPONENT, defense: GALLERY_TEAM, is_home_offense: false, start_period: 1, start_yards_to_goal: 72, end_yards_to_goal: 50, plays: 5, yards: 22, drive_result: 'PUNT', scoring: false, start_offense_score: 0, end_offense_score: 0, start_defense_score: 7, end_defense_score: 7, start_time_minutes: 10, start_time_seconds: 48, elapsed_minutes: 2, elapsed_seconds: 20 }),
  drive({ drive_number: 3, offense: GALLERY_TEAM, defense: GALLERY_OPPONENT, is_home_offense: true, start_period: 1, start_yards_to_goal: 68, end_yards_to_goal: 15, plays: 6, yards: 53, drive_result: 'FG', scoring: true, start_offense_score: 7, end_offense_score: 10, start_defense_score: 0, end_defense_score: 0, start_time_minutes: 8, start_time_seconds: 28, elapsed_minutes: 3, elapsed_seconds: 5 }),
  drive({ drive_number: 4, offense: GALLERY_OPPONENT, defense: GALLERY_TEAM, is_home_offense: false, start_period: 1, start_yards_to_goal: 75, end_yards_to_goal: 61, plays: 4, yards: 14, drive_result: 'PUNT', scoring: false, start_offense_score: 0, end_offense_score: 0, start_defense_score: 10, end_defense_score: 10, start_time_minutes: 5, start_time_seconds: 23, elapsed_minutes: 1, elapsed_seconds: 55 }),
  drive({ drive_number: 5, offense: GALLERY_TEAM, defense: GALLERY_OPPONENT, is_home_offense: true, start_period: 2, start_yards_to_goal: 80, end_yards_to_goal: 0, plays: 10, yards: 80, drive_result: 'TD', scoring: true, start_offense_score: 10, end_offense_score: 17, start_defense_score: 0, end_defense_score: 0, start_time_minutes: 14, start_time_seconds: 30, elapsed_minutes: 4, elapsed_seconds: 40 }),
  drive({ drive_number: 6, offense: GALLERY_OPPONENT, defense: GALLERY_TEAM, is_home_offense: false, start_period: 2, start_yards_to_goal: 68, end_yards_to_goal: 12, plays: 8, yards: 56, drive_result: 'FG', scoring: true, start_offense_score: 0, end_offense_score: 3, start_defense_score: 17, end_defense_score: 17, start_time_minutes: 9, start_time_seconds: 50, elapsed_minutes: 3, elapsed_seconds: 30 }),
  drive({ drive_number: 7, offense: GALLERY_TEAM, defense: GALLERY_OPPONENT, is_home_offense: true, start_period: 2, start_yards_to_goal: 71, end_yards_to_goal: 58, plays: 3, yards: 13, drive_result: 'PUNT', scoring: false, start_offense_score: 17, end_offense_score: 17, start_defense_score: 3, end_defense_score: 3, start_time_minutes: 6, start_time_seconds: 20, elapsed_minutes: 1, elapsed_seconds: 30 }),
  drive({ drive_number: 8, offense: GALLERY_OPPONENT, defense: GALLERY_TEAM, is_home_offense: false, start_period: 2, start_yards_to_goal: 75, end_yards_to_goal: 70, plays: 3, yards: 5, drive_result: 'PUNT', scoring: false, start_offense_score: 3, end_offense_score: 3, start_defense_score: 17, end_defense_score: 17, start_time_minutes: 4, start_time_seconds: 50, elapsed_minutes: 1, elapsed_seconds: 10 }),
  drive({ drive_number: 9, offense: GALLERY_TEAM, defense: GALLERY_OPPONENT, is_home_offense: true, start_period: 3, start_yards_to_goal: 75, end_yards_to_goal: 0, plays: 9, yards: 75, drive_result: 'TD', scoring: true, start_offense_score: 17, end_offense_score: 24, start_defense_score: 3, end_defense_score: 3, start_time_minutes: 15, start_time_seconds: 0, elapsed_minutes: 4, elapsed_seconds: 5 }),
  drive({ drive_number: 10, offense: GALLERY_OPPONENT, defense: GALLERY_TEAM, is_home_offense: false, start_period: 3, start_yards_to_goal: 70, end_yards_to_goal: 55, plays: 4, yards: 15, drive_result: 'PUNT', scoring: false, start_offense_score: 3, end_offense_score: 3, start_defense_score: 24, end_defense_score: 24, start_time_minutes: 10, start_time_seconds: 55, elapsed_minutes: 2, elapsed_seconds: 0 }),
  drive({ drive_number: 11, offense: GALLERY_TEAM, defense: GALLERY_OPPONENT, is_home_offense: true, start_period: 3, start_yards_to_goal: 65, end_yards_to_goal: 8, plays: 7, yards: 57, drive_result: 'FG', scoring: true, start_offense_score: 24, end_offense_score: 27, start_defense_score: 3, end_defense_score: 3, start_time_minutes: 8, start_time_seconds: 55, elapsed_minutes: 3, elapsed_seconds: 45 }),
  drive({ drive_number: 12, offense: GALLERY_OPPONENT, defense: GALLERY_TEAM, is_home_offense: false, start_period: 3, start_yards_to_goal: 75, end_yards_to_goal: 61, plays: 3, yards: 14, drive_result: 'INT', scoring: false, start_offense_score: 3, end_offense_score: 3, start_defense_score: 27, end_defense_score: 27, start_time_minutes: 5, start_time_seconds: 10, elapsed_minutes: 1, elapsed_seconds: 25 }),
  drive({ drive_number: 13, offense: GALLERY_TEAM, defense: GALLERY_OPPONENT, is_home_offense: true, start_period: 4, start_yards_to_goal: 61, end_yards_to_goal: 0, plays: 6, yards: 61, drive_result: 'TD', scoring: true, start_offense_score: 27, end_offense_score: 34, start_defense_score: 3, end_defense_score: 3, start_time_minutes: 14, start_time_seconds: 40, elapsed_minutes: 3, elapsed_seconds: 15 }),
  drive({ drive_number: 14, offense: GALLERY_OPPONENT, defense: GALLERY_TEAM, is_home_offense: false, start_period: 4, start_yards_to_goal: 75, end_yards_to_goal: 0, plays: 11, yards: 75, drive_result: 'TD', scoring: true, start_offense_score: 3, end_offense_score: 10, start_defense_score: 34, end_defense_score: 34, start_time_minutes: 11, start_time_seconds: 25, elapsed_minutes: 5, elapsed_seconds: 5 }),
  drive({ drive_number: 15, offense: GALLERY_TEAM, defense: GALLERY_OPPONENT, is_home_offense: true, start_period: 4, start_yards_to_goal: 72, end_yards_to_goal: 66, plays: 3, yards: 6, drive_result: 'PUNT', scoring: false, start_offense_score: 34, end_offense_score: 34, start_defense_score: 10, end_defense_score: 10, start_time_minutes: 6, start_time_seconds: 20, elapsed_minutes: 1, elapsed_seconds: 40 }),
  drive({ drive_number: 16, offense: GALLERY_OPPONENT, defense: GALLERY_TEAM, is_home_offense: false, start_period: 4, start_yards_to_goal: 75, end_yards_to_goal: 68, plays: 3, yards: 7, drive_result: 'PUNT', scoring: false, start_offense_score: 10, end_offense_score: 10, start_defense_score: 34, end_defense_score: 34, start_time_minutes: 4, start_time_seconds: 40, elapsed_minutes: 1, elapsed_seconds: 5 }),
  drive({ drive_number: 17, offense: GALLERY_TEAM, defense: GALLERY_OPPONENT, is_home_offense: true, start_period: 4, start_yards_to_goal: 68, end_yards_to_goal: 52, plays: 4, yards: 16, drive_result: 'DOWNS', scoring: false, start_offense_score: 34, end_offense_score: 34, start_defense_score: 10, end_defense_score: 10, start_time_minutes: 3, start_time_seconds: 35, elapsed_minutes: 1, elapsed_seconds: 50 }),
  drive({ drive_number: 18, offense: GALLERY_OPPONENT, defense: GALLERY_TEAM, is_home_offense: false, start_period: 4, start_yards_to_goal: 52, end_yards_to_goal: 44, plays: 3, yards: 8, drive_result: 'PUNT', scoring: false, start_offense_score: 10, end_offense_score: 10, start_defense_score: 34, end_defense_score: 34, start_time_minutes: 1, start_time_seconds: 45, elapsed_minutes: 0, elapsed_seconds: 50 }),
  drive({ drive_number: 19, offense: GALLERY_TEAM, defense: GALLERY_OPPONENT, is_home_offense: true, start_period: 4, start_yards_to_goal: 44, end_yards_to_goal: 40, plays: 2, yards: 4, drive_result: 'PUNT', scoring: false, start_offense_score: 34, end_offense_score: 34, start_defense_score: 10, end_defense_score: 10, start_time_minutes: 0, start_time_seconds: 55, elapsed_minutes: 0, elapsed_seconds: 40 }),
  drive({ drive_number: 20, offense: GALLERY_OPPONENT, defense: GALLERY_TEAM, is_home_offense: false, start_period: 4, start_yards_to_goal: 60, end_yards_to_goal: 60, plays: 1, yards: 0, drive_result: 'END OF GAME', scoring: false, start_offense_score: 10, end_offense_score: 10, start_defense_score: 34, end_defense_score: 34, start_time_minutes: 0, start_time_seconds: 15, elapsed_minutes: 0, elapsed_seconds: 15 }),
]

/** Dense per-play win probability curve (many points, per task ask). */
export const WIN_PROBABILITY: GameWinProbability[] = Array.from({ length: 42 }, (_, i) => {
  const period = Math.min(4, Math.floor(i / 11) + 1)
  const withinPeriod = i % 11
  const clockMinutes = Math.max(0, 14 - withinPeriod)
  // Home (Ohio State) WP climbs from a coin flip to a near-lock, with two
  // short away-momentum dips (matching the away FG/TD scoring drives above).
  const base = 0.5 + (i / 41) * 0.46
  const dip = i > 16 && i < 20 ? -0.08 : i > 34 && i < 38 ? -0.1 : 0
  const wp = Math.max(0.04, Math.min(0.98, base + dip))
  return {
    play_id: String(401752894000 + i),
    home_win_probability: Math.round(wp * 1000) / 1000,
    period,
    clock_minutes: clockMinutes,
    clock_seconds: (i * 17) % 60,
  }
})

/** 10 snapshots x 2 providers, line moving toward the home favorite. */
export const LINE_MOVEMENT: LineMovementPoint[] = [
  { captured_at: '2025-10-06T08:00:00Z', provider: 'DraftKings', spread: -3.5, formatted_spread: 'Ohio State -3.5', over_under: 46.5, home_moneyline: -170, away_moneyline: 145 },
  { captured_at: '2025-10-06T08:00:00Z', provider: 'ESPN Bet', spread: -3, formatted_spread: 'Ohio State -3', over_under: 46, home_moneyline: -160, away_moneyline: 138 },
  { captured_at: '2025-10-07T08:00:00Z', provider: 'DraftKings', spread: -4, formatted_spread: 'Ohio State -4', over_under: 46.5, home_moneyline: -178, away_moneyline: 150 },
  { captured_at: '2025-10-07T08:00:00Z', provider: 'ESPN Bet', spread: -3.5, formatted_spread: 'Ohio State -3.5', over_under: 46, home_moneyline: -168, away_moneyline: 142 },
  { captured_at: '2025-10-08T08:00:00Z', provider: 'DraftKings', spread: -5, formatted_spread: 'Ohio State -5', over_under: 47, home_moneyline: -205, away_moneyline: 172 },
  { captured_at: '2025-10-08T08:00:00Z', provider: 'ESPN Bet', spread: -4.5, formatted_spread: 'Ohio State -4.5', over_under: 46.5, home_moneyline: -195, away_moneyline: 165 },
  { captured_at: '2025-10-09T08:00:00Z', provider: 'DraftKings', spread: -6, formatted_spread: 'Ohio State -6', over_under: 47.5, home_moneyline: -230, away_moneyline: 192 },
  { captured_at: '2025-10-09T08:00:00Z', provider: 'ESPN Bet', spread: -5.5, formatted_spread: 'Ohio State -5.5', over_under: 47, home_moneyline: -220, away_moneyline: 185 },
  { captured_at: '2025-10-10T08:00:00Z', provider: 'DraftKings', spread: -6.5, formatted_spread: 'Ohio State -6.5', over_under: 47.5, home_moneyline: -245, away_moneyline: 205 },
  { captured_at: '2025-10-10T08:00:00Z', provider: 'ESPN Bet', spread: -6, formatted_spread: 'Ohio State -6', over_under: 47, home_moneyline: -235, away_moneyline: 198 },
  { captured_at: '2025-10-11T08:00:00Z', provider: 'DraftKings', spread: -7, formatted_spread: 'Ohio State -7', over_under: 48, home_moneyline: -260, away_moneyline: 218 },
  { captured_at: '2025-10-11T08:00:00Z', provider: 'ESPN Bet', spread: -6.5, formatted_spread: 'Ohio State -6.5', over_under: 47.5, home_moneyline: -250, away_moneyline: 210 },
  { captured_at: '2025-10-11T14:00:00Z', provider: 'DraftKings', spread: -7.5, formatted_spread: 'Ohio State -7.5', over_under: 48, home_moneyline: -270, away_moneyline: 225 },
  { captured_at: '2025-10-11T14:00:00Z', provider: 'ESPN Bet', spread: -7, formatted_spread: 'Ohio State -7', over_under: 47.5, home_moneyline: -260, away_moneyline: 218 },
]

export const MODEL_MARGIN = 8.4

/**
 * REAL: Ohio State 2025 down x distance splits (CFBD MCP situational_splits).
 * `conversion_rate` is genuinely `null` on several real rows (1st/2nd down,
 * where the RPC has no meaningful conversion definition) even though the
 * generated `DownDistanceSplit` type declares it non-null -- DownDistanceHeatmap
 * never reads this field, so the cast below is safe (same `as GameDrive[]`
 * precedent the query tests use for row/prop shape gaps).
 */
const RAW_DOWN_DISTANCE_SPLITS = [
  { down: 1, distance_bucket: '1-3', side: 'defense', play_count: 3, success_rate: 0.333, epa_per_play: -0.394, conversion_rate: null },
  { down: 1, distance_bucket: '11+', side: 'defense', play_count: 6, success_rate: 0.5, epa_per_play: 0.189, conversion_rate: null },
  { down: 1, distance_bucket: '4-6', side: 'defense', play_count: 1, success_rate: 1, epa_per_play: 1.688, conversion_rate: null },
  { down: 1, distance_bucket: '7-10', side: 'defense', play_count: 259, success_rate: 0.371, epa_per_play: -0.137, conversion_rate: null },
  { down: 2, distance_bucket: '1-3', side: 'defense', play_count: 30, success_rate: 0.3, epa_per_play: -0.215, conversion_rate: null },
  { down: 2, distance_bucket: '11+', side: 'defense', play_count: 27, success_rate: 0.333, epa_per_play: 0.013, conversion_rate: null },
  { down: 2, distance_bucket: '4-6', side: 'defense', play_count: 51, success_rate: 0.294, epa_per_play: -0.112, conversion_rate: null },
  { down: 2, distance_bucket: '7-10', side: 'defense', play_count: 119, success_rate: 0.353, epa_per_play: -0.024, conversion_rate: null },
  { down: 3, distance_bucket: '1-3', side: 'defense', play_count: 46, success_rate: 0.478, epa_per_play: 0.198, conversion_rate: 0.478 },
  { down: 3, distance_bucket: '11+', side: 'defense', play_count: 22, success_rate: 0.409, epa_per_play: 0.298, conversion_rate: 0.136 },
  { down: 3, distance_bucket: '4-6', side: 'defense', play_count: 34, success_rate: 0.412, epa_per_play: 0.393, conversion_rate: 0.412 },
  { down: 3, distance_bucket: '7-10', side: 'defense', play_count: 57, success_rate: 0.351, epa_per_play: 0.267, conversion_rate: 0.193 },
  { down: 4, distance_bucket: '1-3', side: 'defense', play_count: 17, success_rate: 0.529, epa_per_play: 0.133, conversion_rate: 0.529 },
  { down: 4, distance_bucket: '11+', side: 'defense', play_count: 3, success_rate: 0.667, epa_per_play: 0.291, conversion_rate: 0.333 },
  { down: 4, distance_bucket: '4-6', side: 'defense', play_count: 3, success_rate: 0.333, epa_per_play: -0.52, conversion_rate: 0.333 },
  { down: 4, distance_bucket: '7-10', side: 'defense', play_count: 3, success_rate: 0, epa_per_play: -1.808, conversion_rate: 0 },
  { down: 1, distance_bucket: '1-3', side: 'offense', play_count: 11, success_rate: 0.273, epa_per_play: -0.771, conversion_rate: null },
  { down: 1, distance_bucket: '11+', side: 'offense', play_count: 9, success_rate: 0.333, epa_per_play: 0.035, conversion_rate: null },
  { down: 1, distance_bucket: '4-6', side: 'offense', play_count: 7, success_rate: 0, epa_per_play: -0.455, conversion_rate: null },
  { down: 1, distance_bucket: '7-10', side: 'offense', play_count: 357, success_rate: 0.529, epa_per_play: 0.223, conversion_rate: null },
  { down: 2, distance_bucket: '1-3', side: 'offense', play_count: 59, success_rate: 0.407, epa_per_play: 0.09, conversion_rate: null },
  { down: 2, distance_bucket: '11+', side: 'offense', play_count: 33, success_rate: 0.515, epa_per_play: 0.214, conversion_rate: null },
  { down: 2, distance_bucket: '4-6', side: 'offense', play_count: 77, success_rate: 0.558, epa_per_play: 0.181, conversion_rate: null },
  { down: 2, distance_bucket: '7-10', side: 'offense', play_count: 103, success_rate: 0.485, epa_per_play: 0.376, conversion_rate: null },
  { down: 3, distance_bucket: '1-3', side: 'offense', play_count: 52, success_rate: 0.75, epa_per_play: 0.844, conversion_rate: 0.75 },
  { down: 3, distance_bucket: '11+', side: 'offense', play_count: 20, success_rate: 0.65, epa_per_play: 0.998, conversion_rate: 0.25 },
  { down: 3, distance_bucket: '4-6', side: 'offense', play_count: 39, success_rate: 0.538, epa_per_play: 0.689, conversion_rate: 0.538 },
  { down: 3, distance_bucket: '7-10', side: 'offense', play_count: 30, success_rate: 0.633, epa_per_play: 0.515, conversion_rate: 0.3 },
  { down: 4, distance_bucket: '1-3', side: 'offense', play_count: 10, success_rate: 0.7, epa_per_play: 0.607, conversion_rate: 0.7 },
  { down: 4, distance_bucket: '11+', side: 'offense', play_count: 1, success_rate: 0, epa_per_play: -0.548, conversion_rate: 0 },
  { down: 4, distance_bucket: '4-6', side: 'offense', play_count: 6, success_rate: 0.667, epa_per_play: 1.136, conversion_rate: 0.667 },
]

export const DOWN_DISTANCE_SPLITS = RAW_DOWN_DISTANCE_SPLITS as DownDistanceSplit[]

/** Hand-authored aggregate drive-pattern outcomes (no MCP drive-pattern endpoint loaded). */
export const OFFENSE_DRIVE_PATTERNS: DrivePattern[] = [
  { outcome: 'touchdown', count: 6, avg_plays: 8.2, avg_yards: 71.4, start_yard: 30, end_yard: 99 },
  { outcome: 'field_goal', count: 2, avg_plays: 6.5, avg_yards: 55.0, start_yard: 33, end_yard: 88 },
  { outcome: 'punt', count: 6, avg_plays: 3.7, avg_yards: 8.8, start_yard: 32, end_yard: 41 },
  { outcome: 'turnover', count: 1, avg_plays: 3.0, avg_yards: 14.0, start_yard: 25, end_yard: 39 },
  { outcome: 'downs', count: 1, avg_plays: 4.0, avg_yards: 16.0, start_yard: 32, end_yard: 48 },
  { outcome: 'end_of_half', count: 4, avg_plays: 2.5, avg_yards: 5.5, start_yard: 27, end_yard: 33 },
]

export const DEFENSE_DRIVE_PATTERNS: DrivePattern[] = [
  { outcome: 'touchdown', count: 1, avg_plays: 11.0, avg_yards: 75.0, start_yard: 25, end_yard: 100 },
  { outcome: 'field_goal', count: 1, avg_plays: 8.0, avg_yards: 56.0, start_yard: 32, end_yard: 88 },
  { outcome: 'punt', count: 6, avg_plays: 3.5, avg_yards: 11.8, start_yard: 27, end_yard: 39 },
  { outcome: 'turnover', count: 1, avg_plays: 3.0, avg_yards: 14.0, start_yard: 25, end_yard: 39 },
  { outcome: 'end_of_half', count: 1, avg_plays: 1.0, avg_yards: 0.0, start_yard: 40, end_yard: 40 },
]
