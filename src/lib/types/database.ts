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
// Player analytics types — from stats/marts schemas via RPCs
// ---------------------------------------------------------------------------

export interface PlayerLeaderRow {
  player_id: string
  player_name: string
  team: string
  conference: string
  position: string | null
  // passing
  yards: number | null
  touchdowns: number | null
  interceptions: number | null
  pct: number | null
  attempts: number | null
  completions: number | null
  // rushing
  carries: number | null
  yards_per_carry: number | null
  // receiving
  receptions: number | null
  yards_per_reception: number | null
  longest: number | null
  // defense
  total_tackles: number | null
  solo_tackles: number | null
  sacks: number | null
  tackles_for_loss: number | null
  passes_defended: number | null
  // rank
  yards_rank: number | null
}

export type LeaderCategory = 'passing' | 'rushing' | 'receiving' | 'defense'

export interface PlayerProfile {
  player_id: string
  name: string
  team: string
  position: string | null
  jersey: number | null
  height: number | null
  weight: number | null
  year: number | null
  home_city: string | null
  home_state: string | null
  season: number
  // recruiting
  stars: number | null
  recruit_rating: number | null
  national_ranking: number | null
  recruit_class: number | null
  // stats
  pass_att: number | null
  pass_cmp: number | null
  pass_yds: number | null
  pass_td: number | null
  pass_int: number | null
  pass_pct: number | null
  rush_car: number | null
  rush_yds: number | null
  rush_td: number | null
  rush_ypc: number | null
  rec: number | null
  rec_yds: number | null
  rec_td: number | null
  rec_ypr: number | null
  tackles: number | null
  solo: number | null
  sacks: number | null
  tfl: number | null
  pass_def: number | null
  def_int: number | null
  fg_made: number | null
  fg_att: number | null
  xp_made: number | null
  xp_att: number | null
  punt_yds: number | null
  // team display
  logo?: string | null
  color?: string | null
}

export interface PlayerGameLogEntry {
  game_id: number
  season: number
  team: string
  player_name: string
  play_category: string
  plays: number
  total_epa: number
  epa_per_play: number
  success_rate: number
  explosive_plays: number
  total_yards: number
  // enriched from games
  week?: number
  opponent?: string
  home_away?: string
  result?: string
}

export interface PlayerPercentiles {
  player_id: string
  name: string
  team: string
  position: string | null
  position_group: string | null
  season: number
  // raw stats
  pass_yds: number | null
  pass_td: number | null
  pass_pct: number | null
  rush_yds: number | null
  rush_td: number | null
  rush_ypc: number | null
  rec_yds: number | null
  rec_td: number | null
  tackles: number | null
  sacks: number | null
  tfl: number | null
  ppa_avg: number | null
  // percentiles (0-1)
  pass_yds_pctl: number | null
  pass_td_pctl: number | null
  pass_pct_pctl: number | null
  rush_yds_pctl: number | null
  rush_td_pctl: number | null
  rush_ypc_pctl: number | null
  rec_yds_pctl: number | null
  rec_td_pctl: number | null
  tackles_pctl: number | null
  sacks_pctl: number | null
  tfl_pctl: number | null
  ppa_avg_pctl: number | null
}

export interface PlayerSearchResult {
  player_id: string
  name: string
  team: string
  position: string | null
  season: number
  height: number | null
  weight: number | null
  jersey: number | null
  stars: number | null
  recruit_rating: number | null
  similarity_score: number
}

// ---------------------------------------------------------------------------
// Recruiting types — from RPCs wrapping recruiting/api schemas
// ---------------------------------------------------------------------------

export interface RecruitingClassHistory {
  year: number
  rank: number
  points: number
  five_stars: number
  four_stars: number
  three_stars: number
  two_stars: number
  total_commits: number
}

export interface RecruitingROI {
  season: number
  avg_class_rank_4yr: number
  avg_class_points_4yr: number
  total_blue_chips_4yr: number
  blue_chip_ratio: number
  wins: number
  losses: number
  win_pct: number
  sp_rating: number | null
  sp_rank: number | null
  epa_per_play: number | null
  wins_over_expected: number | null
  epa_over_expected: number | null
  recruiting_efficiency: number | null
  win_pct_pctl: number | null
  epa_pctl: number | null
  recruiting_efficiency_pctl: number | null
}

export interface Signee {
  ranking: number | null
  name: string
  position: string
  stars: number
  rating: number | null
  city: string | null
  state_province: string | null
}

export interface TransferRecord {
  season: number
  first_name: string
  last_name: string
  position: string
  origin: string | null
  destination: string | null
  transfer_date: string | null
  stars: number | null
  rating: number | null
  eligibility: string | null
}

export interface PortalSummary {
  team: string
  season: number
  transfers_in: number
  transfers_out: number
  net_transfers: number
  avg_incoming_stars: number | null
  avg_incoming_rating: number | null
  incoming_high_stars: number
  win_delta: number | null
  portal_dependency: number | null
  net_transfers_pctl: number | null
  win_delta_pctl: number | null
  portal_dependency_pctl: number | null
}

export interface PortalActivity {
  summary: PortalSummary | null
  transfers_in: TransferRecord[]
  transfers_out: TransferRecord[]
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
