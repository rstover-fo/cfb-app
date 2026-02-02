export interface Team {
  id: number
  school: string
  mascot: string | null
  abbreviation: string | null
  conference: string | null
  classification: string | null
  color: string | null
  alt_color: string | null
  logo: string | null
  alt_logo: string | null
}

export interface TeamSeasonEpa {
  season: number
  team: string
  games: number
  total_plays: number
  total_epa: number
  epa_per_play: number
  success_rate: number
  explosiveness: number
  off_epa_rank: number
  def_epa_rank: number
}

export interface TeamStyleProfile {
  season: number
  team: string
  run_rate: number
  pass_rate: number
  epa_rushing: number
  epa_passing: number
  plays_per_game: number
  tempo_category: 'up_tempo' | 'balanced' | 'slow'
  offensive_identity: 'run_heavy' | 'balanced' | 'pass_heavy'
  def_epa_vs_run: number
  def_epa_vs_pass: number
}

export interface TeamSeasonTrajectory {
  season: number
  team: string
  epa_per_play: number
  success_rate: number
  off_epa_rank: number
  def_epa_rank: number
  win_pct: number | null
  wins: number | null
  games: number | null
  recruiting_rank: number | null
  era_code: string | null
  era_name: string | null
  prev_epa: number | null
  epa_delta: number | null
}

export interface DrivePattern {
  start_yard: number
  end_yard: number
  outcome: 'touchdown' | 'field_goal' | 'punt' | 'turnover' | 'end_of_half' | 'downs'
  count: number
  avg_plays: number
  avg_yards: number
}

export interface DownDistanceSplit {
  down: 1 | 2 | 3 | 4
  distance_bucket: '1-3' | '4-6' | '7-10' | '11+'
  side: 'offense' | 'defense'
  play_count: number
  success_rate: number
  epa_per_play: number
  conversion_rate: number | null
  national_rank?: number
}

export interface KeySituation {
  label: string
  description: string
  value: number
  format: 'percent' | 'count'
  rank: number
  trend: number
}

export interface TrajectoryAverages {
  season: number
  conf_wins: number | null
  conf_win_pct: number | null
  conf_epa_per_play: number | null
  conf_success_rate: number | null
  conf_off_epa_rank: number | null
  conf_def_epa_rank: number | null
  conf_recruiting_rank: number | null
  fbs_wins: number | null
  fbs_win_pct: number | null
  fbs_epa_per_play: number | null
  fbs_success_rate: number | null
  fbs_off_epa_rank: number | null
  fbs_def_epa_rank: number | null
  fbs_recruiting_rank: number | null
}

export interface RedZoneSplit {
  side: 'offense' | 'defense'
  trips: number
  touchdowns: number
  field_goals: number
  turnovers: number
  td_rate: number
  fg_rate: number
  scoring_rate: number
  points_per_trip: number
  epa_per_play: number
}

export interface FieldPositionSplit {
  zone: 'own_1_20' | 'own_21_50' | 'opp_49_21' | 'opp_20_1'
  zone_label: string
  side: 'offense' | 'defense'
  play_count: number
  success_rate: number
  epa_per_play: number
  yards_per_play: number
  scoring_rate: number
}

export interface HomeAwaySplit {
  location: 'home' | 'away'
  games: number
  wins: number
  win_pct: number
  points_per_game: number
  points_allowed_per_game: number
  epa_per_play: number
  success_rate: number
  yards_per_play: number
}

export interface ConferenceSplit {
  opponent_type: 'conference' | 'non_conference'
  games: number
  wins: number
  win_pct: number
  points_per_game: number
  points_allowed_per_game: number
  epa_per_play: number
  success_rate: number
  margin_per_game: number
}

export interface RosterPlayer {
  id: string
  first_name: string
  last_name: string
  jersey: number | null
  position: string
  height: number | null
  weight: number | null
  home_city: string | null
  home_state: string | null
  year: number
}

export interface PlayerSeasonStat {
  player_id: string
  player: string
  position: string
  // Passing
  pass_att?: number
  pass_comp?: number
  pass_yds?: number
  pass_td?: number
  pass_int?: number
  // Rushing
  rush_car?: number
  rush_yds?: number
  rush_td?: number
  rush_ypc?: number
  // Receiving
  rec?: number
  rec_yds?: number
  rec_td?: number
  rec_ypr?: number
  // Defense
  tackles?: number
  solo?: number
  tfl?: number
  sacks?: number
  int?: number
  pd?: number
  // Kicking
  fg_made?: number
  fg_att?: number
  xp_made?: number
  xp_att?: number
  points?: number
}

export interface RosterPlayerWithStats extends RosterPlayer {
  stats: PlayerSeasonStat | null
}

export interface Game {
  id: number
  season: number
  week: number
  start_date: string
  home_team: string
  home_points: number | null
  away_team: string
  away_points: number | null
  completed: boolean
  conference_game: boolean
  neutral_site: boolean
}

export interface ScheduleGame extends Game {
  opponent: string
  opponent_logo: string | null
  is_home: boolean
  team_score: number | null
  opponent_score: number | null
  result: 'W' | 'L' | null
}
