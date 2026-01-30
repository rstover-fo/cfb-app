export interface Team {
  id: number
  school: string
  mascot: string | null
  abbreviation: string | null
  conference: string | null
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
