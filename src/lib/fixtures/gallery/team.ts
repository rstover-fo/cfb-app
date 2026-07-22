/**
 * Team-family chart fixtures (TrajectoryChart, AdjustedEpaChart,
 * EloHistoryChart, PlaycallingProfile, StyleProfile, ClassHistoryChart).
 *
 * REAL-SEEDED (2026-07-22, CFBD MCP `query_team({ team: "Ohio State" })`):
 * `TRAJECTORY` (season/wins/games/epa_per_play/success_rate/recruiting_rank
 * below are the actual `team_history` rows) and `CLASS_HISTORY`'s `rank`
 * column (same source). Everything else in this file (FBS/conference
 * trajectory averages, off/def EPA ranks, era labels, adjusted-EPA weekly
 * arc, Elo game-by-game arc, playcalling profile, style profile, and the
 * recruiting star/points breakdown) is hand-authored -- CFBD MCP has no
 * per-week adjusted-EPA, per-game Elo, playcalling-tendency, or recruiting
 * star-count endpoints among the tools loaded for this task.
 */
import type { TeamSeasonTrajectory, TrajectoryAverages, RecruitingClassHistory, TeamStyleProfile } from '@/lib/types/database'
import type { PlaycallingProfile as PlaycallingProfileData, TeamWeekFeature } from '@/lib/queries/playcalling'
import type { TeamEloGamePoint } from '@/lib/queries/predictions'

export const GALLERY_TEAM = 'Ohio State'
export const GALLERY_TEAM_COLOR = '#ce1141' // real, CFBD MCP team_detail.color
export const GALLERY_CONFERENCE = 'Big Ten'

// ---------------------------------------------------------------------------
// TrajectoryChart -- 10-season Ohio State arc (real games/wins/epa_per_play/
// success_rate/recruiting_rank from CFBD MCP team_history 2016-2025) plus
// hand-authored off/def EPA ranks and era labels (CFBD MCP doesn't expose
// per-season offense/defense EPA rank splits, only the blended team rank).
// ---------------------------------------------------------------------------
interface RealOsuSeason {
  season: number
  wins: number
  games: number
  epa_per_play: number
  success_rate: number
  recruiting_rank: number
}

const REAL_OSU_HISTORY: RealOsuSeason[] = [
  { season: 2016, wins: 11, games: 13, epa_per_play: 0.2091, success_rate: 0.5132, recruiting_rank: 4 },
  { season: 2017, wins: 12, games: 14, epa_per_play: 0.3326, success_rate: 0.5204, recruiting_rank: 2 },
  { season: 2018, wins: 13, games: 14, epa_per_play: 0.3001, success_rate: 0.5237, recruiting_rank: 2 },
  { season: 2019, wins: 13, games: 14, epa_per_play: 0.4178, success_rate: 0.5252, recruiting_rank: 14 },
  { season: 2020, wins: 7, games: 8, epa_per_play: 0.3598, success_rate: 0.5145, recruiting_rank: 5 },
  { season: 2021, wins: 11, games: 13, epa_per_play: 0.5189, success_rate: 0.576, recruiting_rank: 2 },
  { season: 2022, wins: 11, games: 13, epa_per_play: 0.3799, success_rate: 0.5339, recruiting_rank: 4 },
  { season: 2023, wins: 11, games: 13, epa_per_play: 0.3148, success_rate: 0.4881, recruiting_rank: 5 },
  { season: 2024, wins: 14, games: 16, epa_per_play: 0.4071, success_rate: 0.5417, recruiting_rank: 5 },
  { season: 2025, wins: 12, games: 14, epa_per_play: 0.3193, success_rate: 0.5319, recruiting_rank: 4 },
]

// Hand-authored off/def EPA rank + era label per season (Day era started 2019).
const OSU_META: Record<number, { off_epa_rank: number; def_epa_rank: number; era_code: string; era_name: string }> = {
  2016: { off_epa_rank: 18, def_epa_rank: 6, era_code: 'meyer', era_name: 'Urban Meyer era' },
  2017: { off_epa_rank: 9, def_epa_rank: 14, era_code: 'meyer', era_name: 'Urban Meyer era' },
  2018: { off_epa_rank: 12, def_epa_rank: 31, era_code: 'meyer', era_name: 'Urban Meyer era' },
  2019: { off_epa_rank: 3, def_epa_rank: 2, era_code: 'day', era_name: 'Ryan Day era' },
  2020: { off_epa_rank: 5, def_epa_rank: 19, era_code: 'day', era_name: 'Ryan Day era' },
  2021: { off_epa_rank: 1, def_epa_rank: 22, era_code: 'day', era_name: 'Ryan Day era' },
  2022: { off_epa_rank: 2, def_epa_rank: 17, era_code: 'day', era_name: 'Ryan Day era' },
  2023: { off_epa_rank: 8, def_epa_rank: 11, era_code: 'day', era_name: 'Ryan Day era' },
  2024: { off_epa_rank: 1, def_epa_rank: 9, era_code: 'day', era_name: 'Ryan Day era' },
  2025: { off_epa_rank: 12, def_epa_rank: 1, era_code: 'day', era_name: 'Ryan Day era' },
}

export const TRAJECTORY: TeamSeasonTrajectory[] = REAL_OSU_HISTORY.map((row, i) => {
  const prev = REAL_OSU_HISTORY[i - 1]
  const meta = OSU_META[row.season]
  return {
    team: GALLERY_TEAM,
    season: row.season,
    wins: row.wins,
    win_pct: Math.round((row.wins / row.games) * 1000) / 1000,
    epa_per_play: row.epa_per_play,
    success_rate: row.success_rate,
    off_epa_rank: meta.off_epa_rank,
    def_epa_rank: meta.def_epa_rank,
    recruiting_rank: row.recruiting_rank,
    epa_delta: prev ? Math.round((row.epa_per_play - prev.epa_per_play) * 1000) / 1000 : null,
    prev_epa: prev ? prev.epa_per_play : null,
    games: row.games,
    era_code: meta.era_code,
    era_name: meta.era_name,
  }
})

/** Hand-authored Big Ten + FBS averages, trailing OSU's real arc above. */
export const TRAJECTORY_AVERAGES: TrajectoryAverages[] = REAL_OSU_HISTORY.map(row => ({
  season: row.season,
  conf_wins: 7.6,
  conf_win_pct: 0.585,
  conf_epa_per_play: Math.max(row.epa_per_play - 0.16, 0.02),
  conf_success_rate: Math.max(row.success_rate - 0.06, 0.38),
  conf_off_epa_rank: 45,
  conf_def_epa_rank: 48,
  conf_recruiting_rank: 38,
  fbs_def_epa_rank: 66,
  fbs_epa_per_play: Math.max(row.epa_per_play - 0.19, 0.0),
  fbs_off_epa_rank: 66,
  fbs_recruiting_rank: 66,
  fbs_success_rate: Math.max(row.success_rate - 0.08, 0.36),
  fbs_win_pct: 0.5,
  fbs_wins: 6.2,
}))

// ---------------------------------------------------------------------------
// AdjustedEpaChart -- hand-authored 9-week 2025 arc, anchored so the final
// week's off/def coefficients land near Ohio State's real season EPA/play
// (0.3193) and the league-best real scoring defense (opp_ppg 9.3).
// ---------------------------------------------------------------------------
export const ADJUSTED_EPA_FEATURES: TeamWeekFeature[] = [
  { season: 2025, week: 1, week_index: 1, team: GALLERY_TEAM, conference: GALLERY_CONFERENCE, game_id: 401752810, games_played_to_date: 0, elo_pregame: 2010, adj_epa_off: 0.201, adj_epa_def: -0.145, adj_epa_net: 0.346, off_epa_per_play: 0.238, off_success_rate: 0.512, def_epa_per_play_allowed: -0.098, havoc_rate_defense: 0.201, havoc_rate_offense_allowed: 0.132 },
  { season: 2025, week: 2, week_index: 2, team: GALLERY_TEAM, conference: GALLERY_CONFERENCE, game_id: 401752824, games_played_to_date: 1, elo_pregame: 2028, adj_epa_off: 0.224, adj_epa_def: -0.161, adj_epa_net: 0.385, off_epa_per_play: 0.251, off_success_rate: 0.521, def_epa_per_play_allowed: -0.112, havoc_rate_defense: 0.212, havoc_rate_offense_allowed: 0.128 },
  { season: 2025, week: 3, week_index: 3, team: GALLERY_TEAM, conference: GALLERY_CONFERENCE, game_id: 401752838, games_played_to_date: 2, elo_pregame: 2041, adj_epa_off: 0.259, adj_epa_def: -0.171, adj_epa_net: 0.43, off_epa_per_play: 0.266, off_success_rate: 0.529, def_epa_per_play_allowed: -0.121, havoc_rate_defense: 0.219, havoc_rate_offense_allowed: 0.121 },
  { season: 2025, week: 4, week_index: 4, team: GALLERY_TEAM, conference: GALLERY_CONFERENCE, game_id: 401752852, games_played_to_date: 3, elo_pregame: 2058, adj_epa_off: 0.241, adj_epa_def: -0.183, adj_epa_net: 0.424, off_epa_per_play: 0.257, off_success_rate: 0.524, def_epa_per_play_allowed: -0.129, havoc_rate_defense: 0.224, havoc_rate_offense_allowed: 0.117 },
  { season: 2025, week: 5, week_index: 5, team: GALLERY_TEAM, conference: GALLERY_CONFERENCE, game_id: 401752866, games_played_to_date: 4, elo_pregame: 2071, adj_epa_off: 0.219, adj_epa_def: -0.192, adj_epa_net: 0.411, off_epa_per_play: 0.244, off_success_rate: 0.519, def_epa_per_play_allowed: -0.135, havoc_rate_defense: 0.228, havoc_rate_offense_allowed: 0.112 },
  { season: 2025, week: 6, week_index: 6, team: GALLERY_TEAM, conference: GALLERY_CONFERENCE, game_id: 401752880, games_played_to_date: 5, elo_pregame: 2085, adj_epa_off: 0.233, adj_epa_def: -0.201, adj_epa_net: 0.434, off_epa_per_play: 0.249, off_success_rate: 0.523, def_epa_per_play_allowed: -0.141, havoc_rate_defense: 0.231, havoc_rate_offense_allowed: 0.109 },
  { season: 2025, week: 7, week_index: 7, team: GALLERY_TEAM, conference: GALLERY_CONFERENCE, game_id: 401752894, games_played_to_date: 6, elo_pregame: 2099, adj_epa_off: 0.207, adj_epa_def: -0.214, adj_epa_net: 0.421, off_epa_per_play: 0.236, off_success_rate: 0.517, def_epa_per_play_allowed: -0.148, havoc_rate_defense: 0.236, havoc_rate_offense_allowed: 0.104 },
  { season: 2025, week: 8, week_index: 8, team: GALLERY_TEAM, conference: GALLERY_CONFERENCE, game_id: 401752908, games_played_to_date: 7, elo_pregame: 2112, adj_epa_off: 0.196, adj_epa_def: -0.225, adj_epa_net: 0.421, off_epa_per_play: 0.229, off_success_rate: 0.514, def_epa_per_play_allowed: -0.153, havoc_rate_defense: 0.24, havoc_rate_offense_allowed: 0.101 },
  { season: 2025, week: 9, week_index: 9, team: GALLERY_TEAM, conference: GALLERY_CONFERENCE, game_id: 401752922, games_played_to_date: 8, elo_pregame: 2124, adj_epa_off: 0.319, adj_epa_def: -0.238, adj_epa_net: 0.557, off_epa_per_play: 0.319, off_success_rate: 0.532, def_epa_per_play_allowed: -0.161, havoc_rate_defense: 0.246, havoc_rate_offense_allowed: 0.096 },
]

// ---------------------------------------------------------------------------
// EloHistoryChart -- hand-authored 13-game 2025 arc (CFBD MCP has no
// per-game Elo endpoint among loaded tools), anchored to end near Ohio
// State's real season-end Elo of 2138 (query_team's team_detail.elo).
// ---------------------------------------------------------------------------
export const ELO_HISTORY: TeamEloGamePoint[] = [
  { game_id: 401752810, week: 1, season_type: 'regular', start_date: '2025-08-30T16:00:00Z', opponent: 'Texas', is_home: false, pregame_elo: 1985, postgame_elo: 2010, team_win_prob: 0.42 },
  { game_id: 401752824, week: 2, season_type: 'regular', start_date: '2025-09-06T16:00:00Z', opponent: 'Grambling', is_home: true, pregame_elo: 2010, postgame_elo: 2028, team_win_prob: 0.99 },
  { game_id: 401752838, week: 3, season_type: 'regular', start_date: '2025-09-13T16:00:00Z', opponent: 'Ohio', is_home: true, pregame_elo: 2028, postgame_elo: 2041, team_win_prob: 0.97 },
  { game_id: 401752852, week: 5, season_type: 'regular', start_date: '2025-09-27T16:00:00Z', opponent: 'Minnesota', is_home: false, pregame_elo: 2041, postgame_elo: 2058, team_win_prob: 0.81 },
  { game_id: 401752866, week: 6, season_type: 'regular', start_date: '2025-10-04T16:00:00Z', opponent: 'Wisconsin', is_home: true, pregame_elo: 2058, postgame_elo: 2071, team_win_prob: 0.85 },
  { game_id: 401752880, week: 7, season_type: 'regular', start_date: '2025-10-11T16:00:00Z', opponent: 'Illinois', is_home: false, pregame_elo: 2071, postgame_elo: 2085, team_win_prob: 0.71 },
  { game_id: 401752894, week: 8, season_type: 'regular', start_date: '2025-10-18T16:00:00Z', opponent: 'Wisconsin', is_home: true, pregame_elo: 2085, postgame_elo: 2099, team_win_prob: 0.88 },
  { game_id: 401752908, week: 9, season_type: 'regular', start_date: '2025-10-25T16:00:00Z', opponent: 'Purdue', is_home: false, pregame_elo: 2099, postgame_elo: 2112, team_win_prob: 0.9 },
  { game_id: 401752922, week: 10, season_type: 'regular', start_date: '2025-11-01T16:00:00Z', opponent: 'Penn State', is_home: true, pregame_elo: 2112, postgame_elo: 2124, team_win_prob: 0.66 },
  { game_id: 401752936, week: 12, season_type: 'regular', start_date: '2025-11-15T18:00:00Z', opponent: 'UCLA', is_home: false, pregame_elo: 2124, postgame_elo: 2131, team_win_prob: 0.79 },
  { game_id: 401752950, week: 13, season_type: 'regular', start_date: '2025-11-22T16:00:00Z', opponent: 'Rutgers', is_home: true, pregame_elo: 2131, postgame_elo: 2135, team_win_prob: 0.94 },
  { game_id: 401752964, week: 14, season_type: 'regular', start_date: '2025-11-28T21:00:00Z', opponent: 'Michigan', is_home: false, pregame_elo: 2135, postgame_elo: 2145, team_win_prob: 0.55 },
  { game_id: 401752978, week: 16, season_type: 'postseason', start_date: '2025-12-06T20:00:00Z', opponent: 'Oregon', is_home: true, pregame_elo: 2145, postgame_elo: 2138, team_win_prob: 0.58 },
]

// ---------------------------------------------------------------------------
// PlaycallingProfile -- hand-authored (no CFBD MCP tendency endpoint loaded).
// ---------------------------------------------------------------------------
export const PLAYCALLING_PROFILE: PlaycallingProfileData = {
  team: GALLERY_TEAM,
  season: 2025,
  conference: GALLERY_CONFERENCE,
  games_played: 14,
  overall_run_rate: 0.446,
  early_down_run_rate: 0.512,
  third_down_pass_rate: 0.688,
  red_zone_run_rate: 0.561,
  overall_success_rate: 0.5319, // real
  overall_avg_epa: 0.3193, // real
  third_down_success_rate: 0.447,
  red_zone_success_rate: 0.612,
  leading_run_rate: 0.571,
  trailing_run_rate: 0.339,
  run_rate_delta: 0.232,
  pace_plays_per_game: 58.9, // real, from 824 plays / 14 games
  overall_run_rate_pctl: 0.58,
  early_down_run_rate_pctl: 0.63,
  third_down_pass_rate_pctl: 0.74,
  overall_epa_pctl: 0.94,
  third_down_success_pctl: 0.79,
  red_zone_success_pctl: 0.81,
  run_rate_delta_pctl: 0.71,
  pace_pctl: 0.22,
}

// ---------------------------------------------------------------------------
// StyleProfile -- hand-authored.
// ---------------------------------------------------------------------------
export const STYLE_PROFILE: TeamStyleProfile = {
  team: GALLERY_TEAM,
  season: 2025,
  offensive_identity: 'balanced',
  pass_rate: 0.554,
  run_rate: 0.446,
  plays_per_game: 58.9,
  tempo_category: 'moderate',
  epa_passing: 0.362,
  epa_rushing: 0.264,
  def_epa_vs_pass: -0.221,
  def_epa_vs_run: -0.184,
}

// ---------------------------------------------------------------------------
// ClassHistoryChart -- `rank` is real (CFBD MCP team_history.recruiting_rank,
// 2016-2025); points/star breakdown are hand-authored to a plausible mix
// that sums to a realistic ~20-25 commit class for a blue-chip program.
// ---------------------------------------------------------------------------
const CLASS_STARS: Record<number, { five: number; four: number; three: number; two: number; points: number }> = {
  2016: { five: 4, four: 12, three: 6, two: 0, points: 268.9 },
  2017: { five: 5, four: 13, three: 5, two: 0, points: 312.14 },
  2018: { five: 6, four: 12, three: 5, two: 0, points: 317.06 },
  2019: { five: 2, four: 15, three: 6, two: 0, points: 261.18 },
  2020: { five: 4, four: 13, three: 6, two: 0, points: 295.08 },
  2021: { five: 6, four: 12, three: 4, two: 0, points: 309.49 },
  2022: { five: 4, four: 13, three: 6, two: 0, points: 300.95 },
  2023: { five: 4, four: 12, three: 6, two: 0, points: 288.98 },
  2024: { five: 3, four: 15, three: 5, two: 0, points: 289.13 },
  2025: { five: 4, four: 14, three: 5, two: 0, points: 297.72 },
}

export const CLASS_HISTORY: RecruitingClassHistory[] = REAL_OSU_HISTORY.map(row => {
  const s = CLASS_STARS[row.season]
  return {
    year: row.season,
    rank: row.recruiting_rank, // real
    points: s.points,
    five_stars: s.five,
    four_stars: s.four,
    three_stars: s.three,
    two_stars: s.two,
    total_commits: s.five + s.four + s.three + s.two,
  }
})
