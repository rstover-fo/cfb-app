/**
 * Re-exports from Supabase-generated types where possible.
 * UI-only types (not backed by a DB view/function) are defined manually below.
 *
 * Regenerate database.generated.ts with:
 *   supabase gen types typescript --project-id <id> > src/lib/types/database.generated.ts
 */

import type { Database } from './database.generated'

// ---------------------------------------------------------------------------
// View-backed types
// ---------------------------------------------------------------------------

export type Team = Database['public']['Views']['teams_with_logos']['Row']
export type TeamSeasonEpa = Database['public']['Views']['team_epa_season']['Row']
export type TeamStyleProfile = Database['public']['Views']['team_style_profile']['Row']
export type TeamSeasonTrajectory = Database['public']['Views']['team_season_trajectory']['Row']
export type DefensiveHavoc = Database['public']['Views']['defensive_havoc']['Row']
export type TeamTempoMetrics = Database['public']['Views']['team_tempo_metrics']['Row']
export type TeamSpecialTeamsSos = Database['public']['Views']['team_special_teams_sos']['Row']
export type RosterPlayer = Database['public']['Views']['roster']['Row']
export type Game = Database['public']['Views']['games']['Row']

// ---------------------------------------------------------------------------
// Function-backed types
// ---------------------------------------------------------------------------

export type DrivePattern = Database['public']['Functions']['get_drive_patterns']['Returns'][number]
export type DownDistanceSplit = Database['public']['Functions']['get_down_distance_splits']['Returns'][number]
export type RedZoneSplit = Database['public']['Functions']['get_red_zone_splits']['Returns'][number]
export type FieldPositionSplit = Database['public']['Functions']['get_field_position_splits']['Returns'][number]
export type HomeAwaySplit = Database['public']['Functions']['get_home_away_splits']['Returns'][number]
export type ConferenceSplit = Database['public']['Functions']['get_conference_splits']['Returns'][number]
export type TrajectoryAverages = Database['public']['Functions']['get_trajectory_averages']['Returns'][number]
export type PlayerSeasonStat = Database['public']['Functions']['get_player_season_stats_pivoted']['Returns'][number]

// ---------------------------------------------------------------------------
// Manual types — records table is in core schema, not public views
// ---------------------------------------------------------------------------

export interface TeamRecord {
  year: number
  team: string
  team_id: number
  classification: string
  conference: string
  total__wins: number
  total__losses: number
  total__ties: number
  conference_games__wins: number
  conference_games__losses: number
  conference_games__ties: number
}

// ---------------------------------------------------------------------------
// UI-only types — constructed in app code, not from DB
// ---------------------------------------------------------------------------

export interface KeySituation {
  label: string
  description: string
  value: number
  format: 'percent' | 'count'
  rank: number
  trend: number
}

export interface ScheduleGame extends Game {
  opponent: string | null
  opponent_logo: string | null
  is_home: boolean | null
  team_score: number | null
  opponent_score: number | null
  result: 'W' | 'L' | null
}

export interface RosterPlayerWithStats extends RosterPlayer {
  stats: PlayerSeasonStat | null
}

// ---------------------------------------------------------------------------
// Rankings types — from core schema
// ---------------------------------------------------------------------------

export interface PollRanking {
  rank: number
  school: string
  conference: string
  first_place_votes: number
  points: number
  season: number
  week: number
  poll: string
}

export interface EnrichedPollRanking extends PollRanking {
  logo: string | null
  color: string | null
  wins: number
  losses: number
  prev_rank: number | null
  movement: number | null
}

export interface LineScores {
  home: number[]
  away: number[]
}

// ---------------------------------------------------------------------------
// Box score types — from core schema, not public views
// ---------------------------------------------------------------------------

export interface GameTeamStat {
  category: string
  stat: string
}

export interface BoxScoreTeam {
  team: string
  homeAway: 'home' | 'away'
  stats: Record<string, string>
}

export interface GameBoxScore {
  home: BoxScoreTeam
  away: BoxScoreTeam
}

// ---------------------------------------------------------------------------
// Player leader types — from core schema, not public views
// ---------------------------------------------------------------------------

export interface PlayerStat {
  id: string
  name: string
  stats: Record<string, string>
}

export interface TeamLeaders {
  passing: PlayerStat[]
  rushing: PlayerStat[]
  receiving: PlayerStat[]
  defense: PlayerStat[]
}

export interface PlayerLeaders {
  away: TeamLeaders
  home: TeamLeaders
}

// ---------------------------------------------------------------------------
// Game detail types — from core schema drives and plays tables
// ---------------------------------------------------------------------------

export interface GameDrive {
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

export interface GamePlay {
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
