/**
 * Player-family chart fixtures (GameTrendChart, PercentileBars,
 * PercentileRadar). Hand-authored throughout -- CFBD MCP has no per-game
 * player log or percentile endpoint among the tools loaded for this task;
 * `player1`/`player2` reuse the verified `createPlayerComparisonRow`
 * builder from src/lib/queries/__tests__/fixtures/players.ts per the task's
 * reuse instruction, which is itself hand-authored realistic data (not MCP).
 */
import type { PlayerGameLogEntry, PlayerPercentiles } from '@/lib/types/database'
import { createPlayerComparisonRow } from '@/lib/queries/__tests__/fixtures/players'

export const GALLERY_PLAYER = 'Jackson Arnold'
export const GALLERY_PLAYER_TEAM = 'Oklahoma'

function gameLogEntry(overrides: Partial<PlayerGameLogEntry>): PlayerGameLogEntry {
  return {
    game_id: 1000,
    season: 2025,
    team: GALLERY_PLAYER_TEAM,
    player_name: GALLERY_PLAYER,
    play_category: 'passing',
    plays: 32,
    total_epa: 6.4,
    epa_per_play: 0.2,
    success_rate: 0.5,
    explosive_plays: 3,
    total_yards: 240,
    week: 1,
    opponent: 'Tennessee',
    home_away: 'home',
    result: 'W',
    over_under: 51.5,
    ou_result: 'over',
    ...overrides,
  }
}

/** 12-game 2025 log, EPA/play trending up across the season. */
export const GAME_LOG: PlayerGameLogEntry[] = [
  gameLogEntry({ game_id: 1001, week: 1, opponent: 'Tennessee', home_away: 'away', result: 'L', plays: 34, total_epa: 3.4, epa_per_play: 0.1, success_rate: 0.41, explosive_plays: 2, total_yards: 198, over_under: 50.5, ou_result: 'under' }),
  gameLogEntry({ game_id: 1002, week: 2, opponent: 'Temple', home_away: 'home', result: 'W', plays: 28, total_epa: 8.96, epa_per_play: 0.32, success_rate: 0.57, explosive_plays: 4, total_yards: 265, over_under: 55.5, ou_result: 'over' }),
  gameLogEntry({ game_id: 1003, week: 3, opponent: 'Houston', home_away: 'home', result: 'W', plays: 30, total_epa: 5.4, epa_per_play: 0.18, success_rate: 0.47, explosive_plays: 2, total_yards: 221, over_under: 48.5, ou_result: 'over' }),
  gameLogEntry({ game_id: 1004, week: 4, opponent: 'Auburn', home_away: 'away', result: 'W', plays: 36, total_epa: 10.08, epa_per_play: 0.28, success_rate: 0.53, explosive_plays: 5, total_yards: 289, over_under: 47.0, ou_result: 'over' }),
  gameLogEntry({ game_id: 1005, week: 6, opponent: 'Texas', home_away: 'home', result: 'W', plays: 33, total_epa: 9.9, epa_per_play: 0.3, success_rate: 0.55, explosive_plays: 4, total_yards: 271, over_under: 49.5, ou_result: 'over' }),
  gameLogEntry({ game_id: 1006, week: 7, opponent: 'South Carolina', home_away: 'away', result: 'W', plays: 29, total_epa: 4.35, epa_per_play: 0.15, success_rate: 0.45, explosive_plays: 2, total_yards: 205, over_under: 46.5, ou_result: 'under' }),
  gameLogEntry({ game_id: 1007, week: 8, opponent: 'Missouri', home_away: 'home', result: 'W', plays: 31, total_epa: 9.3, epa_per_play: 0.3, success_rate: 0.55, explosive_plays: 3, total_yards: 258, over_under: 51.0, ou_result: 'over' }),
  gameLogEntry({ game_id: 1008, week: 9, opponent: 'Vanderbilt', home_away: 'away', result: 'L', plays: 35, total_epa: 3.85, epa_per_play: 0.11, success_rate: 0.4, explosive_plays: 1, total_yards: 210, over_under: 52.5, ou_result: 'under' }),
  gameLogEntry({ game_id: 1009, week: 10, opponent: 'Kentucky', home_away: 'home', result: 'W', plays: 27, total_epa: 10.53, epa_per_play: 0.39, success_rate: 0.59, explosive_plays: 5, total_yards: 294, over_under: 45.5, ou_result: 'over' }),
  gameLogEntry({ game_id: 1010, week: 11, opponent: 'Alabama', home_away: 'away', result: 'W', plays: 38, total_epa: 12.16, epa_per_play: 0.32, success_rate: 0.53, explosive_plays: 6, total_yards: 312, over_under: 49.0, ou_result: 'over' }),
  gameLogEntry({ game_id: 1011, week: 13, opponent: 'LSU', home_away: 'home', result: 'W', plays: 32, total_epa: 11.2, epa_per_play: 0.35, success_rate: 0.56, explosive_plays: 5, total_yards: 301, over_under: 53.5, ou_result: 'over' }),
  gameLogEntry({ game_id: 1012, week: 14, opponent: 'Oklahoma State', home_away: 'away', result: 'W', plays: 26, total_epa: 10.66, epa_per_play: 0.41, success_rate: 0.6, explosive_plays: 4, total_yards: 268, over_under: 44.5, ou_result: 'over' }),
]

/** Reuses the verified players fixture builder (task instruction). */
export const PLAYER_1 = createPlayerComparisonRow()

/** A second QB season for the comparison pair. */
export const PLAYER_2 = createPlayerComparisonRow({
  player_id: 'athlete-2',
  name: 'Arch Manning',
  team: 'Texas',
  height: 76,
  weight: 226,
  jersey: 16,
  home_city: 'New Orleans',
  home_state: 'LA',
  stars: 5,
  recruit_rating: 0.9998,
  national_ranking: 1,
  recruit_class: 2023,
  pass_att: 362,
  pass_cmp: 234,
  pass_yds: 3021,
  pass_td: 27,
  pass_int: 8,
  pass_pct: 0.646,
  rush_car: 88,
  rush_yds: 312,
  rush_td: 4,
  rush_ypc: 3.5,
  ppa_avg: 0.301,
  ppa_total: 108.9,
  pass_yds_pctl: 0.85,
  pass_td_pctl: 0.89,
  pass_pct_pctl: 0.71,
  rush_yds_pctl: 0.48,
  rush_td_pctl: 0.41,
  rush_ypc_pctl: 0.39,
  ppa_avg_pctl: 0.93,
})

export const PERCENTILES: PlayerPercentiles = {
  player_id: 'athlete-1',
  name: GALLERY_PLAYER,
  team: GALLERY_PLAYER_TEAM,
  position: 'QB',
  position_group: 'QB',
  season: 2025,
  pass_yds: 3182,
  pass_td: 24,
  pass_pct: 0.652,
  rush_yds: 444,
  rush_td: 6,
  rush_ypc: 4.3,
  rec_yds: null,
  rec_td: null,
  tackles: null,
  sacks: null,
  tfl: null,
  ppa_avg: 0.287,
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
}
