/**
 * Analytics-family chart fixtures (ScatterPlot, OffenseRadar, DefenseRadar).
 *
 * REAL-SEEDED (2026-07-22, CFBD MCP `get_leaderboard({ season: 2025, metric:
 * "epa" })`): `LEADERBOARD` below is the tool's actual top-50 response
 * (team/conference/success_rate/explosiveness/epa_per_play/sp_rating/wins/
 * opp_ppg/defense_ppg_rank, transcribed verbatim). ScatterPlot's x/y
 * (success rate vs explosiveness) and OffenseRadar's successRate/
 * explosiveness axes are the real values. Everything derived from them below
 * (rush/pass EPA split, third-down rate, and every defense metric --
 * epaAllowed/havocRate/stuffRate/sacks/interceptions/tfls) is a deterministic
 * hand-authored formula anchored to the real epa_per_play / defense_ppg_rank
 * ordering, not a second real metric -- CFBD MCP has no rush/pass-split or
 * havoc/stuff/turnover leaderboard among the tools loaded for this task.
 */
import type { TeamOffenseData } from '@/components/analytics/OffenseRadar'
import type { TeamDefenseData } from '@/components/analytics/DefenseRadar'
import { teamColor } from './shared'

interface LeaderboardRow {
  team: string
  conference: string
  success_rate: number
  explosiveness: number
  epa_per_play: number
  sp_rating: number
  wins: number
  opp_ppg: number
  defense_ppg_rank: number
}

/** REAL: top 50 rows, CFBD MCP get_leaderboard(season=2025, metric='epa'). */
export const LEADERBOARD: LeaderboardRow[] = [
  { team: 'Vanderbilt', conference: 'SEC', success_rate: 0.5216, explosiveness: 1.3931, epa_per_play: 0.4254, sp_rating: 20.3, wins: 10, opp_ppg: 22.8, defense_ppg_rank: 47 },
  { team: 'North Texas', conference: 'American Athletic', success_rate: 0.536, explosiveness: 1.3358, epa_per_play: 0.3837, sp_rating: 13.8, wins: 12, opp_ppg: 26.5, defense_ppg_rank: 76 },
  { team: 'Notre Dame', conference: 'FBS Independents', success_rate: 0.5108, explosiveness: 1.4471, epa_per_play: 0.379, sp_rating: 24.4, wins: 10, opp_ppg: 17.6, defense_ppg_rank: 10 },
  { team: 'Oregon', conference: 'Big Ten', success_rate: 0.5237, explosiveness: 1.3191, epa_per_play: 0.36, sp_rating: 25.9, wins: 13, opp_ppg: 17.9, defense_ppg_rank: 12 },
  { team: 'USC', conference: 'Big Ten', success_rate: 0.5234, explosiveness: 1.3129, epa_per_play: 0.3597, sp_rating: 16.9, wins: 9, opp_ppg: 23, defense_ppg_rank: 51 },
  { team: 'South Florida', conference: 'American Athletic', success_rate: 0.4957, explosiveness: 1.3738, epa_per_play: 0.3481, sp_rating: 11.6, wins: 9, opp_ppg: 23.4, defense_ppg_rank: 53 },
  { team: 'Utah', conference: 'Big 12', success_rate: 0.5097, explosiveness: 1.2845, epa_per_play: 0.3403, sp_rating: 22.2, wins: 11, opp_ppg: 18.9, defense_ppg_rank: 17 },
  { team: 'Tennessee', conference: 'SEC', success_rate: 0.5177, explosiveness: 1.2815, epa_per_play: 0.3384, sp_rating: 15, wins: 8, opp_ppg: 28.8, defense_ppg_rank: 91 },
  { team: 'Indiana', conference: 'Big Ten', success_rate: 0.5176, explosiveness: 1.2225, epa_per_play: 0.3317, sp_rating: 32.4, wins: 16, opp_ppg: 11.7, defense_ppg_rank: 2 },
  { team: 'Texas State', conference: 'Sun Belt', success_rate: 0.4994, explosiveness: 1.2983, epa_per_play: 0.3273, sp_rating: 2.3, wins: 7, opp_ppg: 29, defense_ppg_rank: 95 },
  { team: 'Ole Miss', conference: 'SEC', success_rate: 0.4852, explosiveness: 1.3491, epa_per_play: 0.3202, sp_rating: 24, wins: 13, opp_ppg: 21.1, defense_ppg_rank: 37 },
  { team: 'Ohio State', conference: 'Big Ten', success_rate: 0.5319, explosiveness: 1.1875, epa_per_play: 0.3193, sp_rating: 30.1, wins: 12, opp_ppg: 9.3, defense_ppg_rank: 1 },
  { team: 'UConn', conference: 'FBS Independents', success_rate: 0.504, explosiveness: 1.2698, epa_per_play: 0.3162, sp_rating: 5.1, wins: 9, opp_ppg: 27, defense_ppg_rank: 81 },
  { team: 'Navy', conference: 'American Athletic', success_rate: 0.4912, explosiveness: 1.3143, epa_per_play: 0.315, sp_rating: 6.2, wins: 11, opp_ppg: 25, defense_ppg_rank: 69 },
  { team: 'Florida State', conference: 'ACC', success_rate: 0.4916, explosiveness: 1.3515, epa_per_play: 0.3138, sp_rating: 7.2, wins: 5, opp_ppg: 22, defense_ppg_rank: 43 },
  { team: 'Cincinnati', conference: 'Big 12', success_rate: 0.5002, explosiveness: 1.2864, epa_per_play: 0.3037, sp_rating: 4.5, wins: 7, opp_ppg: 25.6, defense_ppg_rank: 74 },
  { team: 'Washington', conference: 'Big Ten', success_rate: 0.5013, explosiveness: 1.2616, epa_per_play: 0.3003, sp_rating: 18.4, wins: 9, opp_ppg: 18.7, defense_ppg_rank: 15 },
  { team: 'UNLV', conference: 'Mountain West', success_rate: 0.4985, explosiveness: 1.3157, epa_per_play: 0.2959, sp_rating: 4.3, wins: 10, opp_ppg: 28, defense_ppg_rank: 89 },
  { team: 'Air Force', conference: 'Mountain West', success_rate: 0.4858, explosiveness: 1.2383, epa_per_play: 0.2952, sp_rating: -3.2, wins: 4, opp_ppg: 30.3, defense_ppg_rank: 108 },
  { team: 'Arkansas', conference: 'SEC', success_rate: 0.5061, explosiveness: 1.3659, epa_per_play: 0.2933, sp_rating: 5.1, wins: 2, opp_ppg: 33.8, defense_ppg_rank: 129 },
  { team: 'NC State', conference: 'ACC', success_rate: 0.4632, explosiveness: 1.3142, epa_per_play: 0.2797, sp_rating: 4.8, wins: 8, opp_ppg: 27.2, defense_ppg_rank: 82 },
  { team: 'Georgia Tech', conference: 'ACC', success_rate: 0.5064, explosiveness: 1.1602, epa_per_play: 0.2755, sp_rating: 9.3, wins: 9, opp_ppg: 25, defense_ppg_rank: 69 },
  { team: 'Texas Tech', conference: 'Big 12', success_rate: 0.4729, explosiveness: 1.2845, epa_per_play: 0.2671, sp_rating: 27.6, wins: 12, opp_ppg: 11.8, defense_ppg_rank: 3 },
  { team: 'Old Dominion', conference: 'Sun Belt', success_rate: 0.4682, explosiveness: 1.3528, epa_per_play: 0.2566, sp_rating: 5.9, wins: 10, opp_ppg: 18.5, defense_ppg_rank: 14 },
  { team: 'Memphis', conference: 'American Athletic', success_rate: 0.4837, explosiveness: 1.2727, epa_per_play: 0.2536, sp_rating: 7.6, wins: 8, opp_ppg: 23.2, defense_ppg_rank: 52 },
  { team: 'Duke', conference: 'ACC', success_rate: 0.4909, explosiveness: 1.2932, epa_per_play: 0.2504, sp_rating: 6.6, wins: 9, opp_ppg: 29.4, defense_ppg_rank: 98 },
  { team: 'Georgia', conference: 'SEC', success_rate: 0.5042, explosiveness: 1.112, epa_per_play: 0.2443, sp_rating: 24.1, wins: 12, opp_ppg: 17.6, defense_ppg_rank: 10 },
  { team: 'BYU', conference: 'Big 12', success_rate: 0.4897, explosiveness: 1.1851, epa_per_play: 0.2428, sp_rating: 15.9, wins: 12, opp_ppg: 19.1, defense_ppg_rank: 19 },
  { team: 'SMU', conference: 'ACC', success_rate: 0.4579, explosiveness: 1.3277, epa_per_play: 0.2395, sp_rating: 13.4, wins: 9, opp_ppg: 20.5, defense_ppg_rank: 30 },
  { team: 'Texas A&M', conference: 'SEC', success_rate: 0.4875, explosiveness: 1.2073, epa_per_play: 0.2393, sp_rating: 20.7, wins: 11, opp_ppg: 21, defense_ppg_rank: 36 },
  { team: 'Kansas', conference: 'Big 12', success_rate: 0.4929, explosiveness: 1.2027, epa_per_play: 0.2313, sp_rating: 4.1, wins: 5, opp_ppg: 26.8, defense_ppg_rank: 80 },
  { team: 'Penn State', conference: 'Big Ten', success_rate: 0.4727, explosiveness: 1.2199, epa_per_play: 0.2298, sp_rating: 18.1, wins: 7, opp_ppg: 20.5, defense_ppg_rank: 30 },
  { team: 'Toledo', conference: 'Mid-American', success_rate: 0.4873, explosiveness: 1.1811, epa_per_play: 0.2256, sp_rating: 6, wins: 8, opp_ppg: 13.3, defense_ppg_rank: 4 },
  { team: 'TCU', conference: 'Big 12', success_rate: 0.4659, explosiveness: 1.2742, epa_per_play: 0.216, sp_rating: 8.3, wins: 9, opp_ppg: 25.3, defense_ppg_rank: 72 },
  { team: 'UTSA', conference: 'American Athletic', success_rate: 0.4774, explosiveness: 1.2952, epa_per_play: 0.2145, sp_rating: 3.7, wins: 7, opp_ppg: 28.8, defense_ppg_rank: 91 },
  { team: 'Miami', conference: 'ACC', success_rate: 0.4822, explosiveness: 1.1677, epa_per_play: 0.2127, sp_rating: 20.7, wins: 13, opp_ppg: 14.8, defense_ppg_rank: 5 },
  { team: 'Arizona', conference: 'Big 12', success_rate: 0.4856, explosiveness: 1.2406, epa_per_play: 0.2117, sp_rating: 12, wins: 9, opp_ppg: 19.3, defense_ppg_rank: 21 },
  { team: 'James Madison', conference: 'Sun Belt', success_rate: 0.4578, explosiveness: 1.3109, epa_per_play: 0.2114, sp_rating: 12.3, wins: 12, opp_ppg: 18.4, defense_ppg_rank: 13 },
  { team: 'Tulane', conference: 'American Athletic', success_rate: 0.4659, explosiveness: 1.2189, epa_per_play: 0.2081, sp_rating: 6.3, wins: 11, opp_ppg: 23.9, defense_ppg_rank: 58 },
  { team: 'Alabama', conference: 'SEC', success_rate: 0.4582, explosiveness: 1.2259, epa_per_play: 0.2079, sp_rating: 14.8, wins: 11, opp_ppg: 19.2, defense_ppg_rank: 20 },
  { team: 'Utah State', conference: 'Mountain West', success_rate: 0.4438, explosiveness: 1.3118, epa_per_play: 0.2078, sp_rating: -3.1, wins: 6, opp_ppg: 28.7, defense_ppg_rank: 90 },
  { team: 'Missouri', conference: 'SEC', success_rate: 0.4625, explosiveness: 1.2388, epa_per_play: 0.2075, sp_rating: 14.4, wins: 8, opp_ppg: 18.9, defense_ppg_rank: 17 },
  { team: 'Boise State', conference: 'Mountain West', success_rate: 0.4429, explosiveness: 1.2683, epa_per_play: 0.2041, sp_rating: 3.1, wins: 9, opp_ppg: 24.1, defense_ppg_rank: 61 },
  { team: 'East Carolina', conference: 'American Athletic', success_rate: 0.469, explosiveness: 1.1769, epa_per_play: 0.2033, sp_rating: 8, wins: 9, opp_ppg: 20.1, defense_ppg_rank: 25 },
  { team: 'Eastern Michigan', conference: 'Mid-American', success_rate: 0.4586, explosiveness: 1.2093, epa_per_play: 0.2011, sp_rating: -14.7, wins: 4, opp_ppg: 29.8, defense_ppg_rank: 101 },
  { team: 'Illinois', conference: 'Big Ten', success_rate: 0.4956, explosiveness: 1.169, epa_per_play: 0.1996, sp_rating: 12.9, wins: 9, opp_ppg: 23.6, defense_ppg_rank: 56 },
  { team: 'Kansas State', conference: 'Big 12', success_rate: 0.4252, explosiveness: 1.3872, epa_per_play: 0.1982, sp_rating: 7, wins: 6, opp_ppg: 26.7, defense_ppg_rank: 79 },
  { team: 'Baylor', conference: 'Big 12', success_rate: 0.4647, explosiveness: 1.3003, epa_per_play: 0.1982, sp_rating: 1.4, wins: 5, opp_ppg: 32.6, defense_ppg_rank: 122 },
  { team: 'Ohio', conference: 'Mid-American', success_rate: 0.4709, explosiveness: 1.2136, epa_per_play: 0.1982, sp_rating: -4, wins: 9, opp_ppg: 21.9, defense_ppg_rank: 42 },
  { team: 'Texas', conference: 'SEC', success_rate: 0.4312, explosiveness: 1.3564, epa_per_play: 0.1977, sp_rating: 16.2, wins: 10, opp_ppg: 20.3, defense_ppg_rank: 28 },
]

/** ScatterPlot: success rate (x) vs explosiveness (y), both real. */
export const SCATTER_DATA = LEADERBOARD.map((row, i) => ({
  id: i + 1,
  name: row.team,
  x: row.success_rate,
  y: row.explosiveness,
  color: teamColor(row.team),
  logo: null, // logo CDN (a.espncdn.com) is blocked in dev/offline environments -- see ChartGallery comment
  conference: row.conference,
  compositeScore: row.sp_rating,
}))

export const SCATTER_QUADRANT_LABELS = {
  topLeft: 'Boom or Bust',
  topRight: 'Elite',
  bottomLeft: 'Struggling',
  bottomRight: 'Methodical',
}

export const HIGHLIGHTED_TEAM_ID = SCATTER_DATA.find(d => d.name === 'Ohio State')!.id

/** Derived (hand-authored split of the real epa_per_play aggregate). */
export const OFFENSE_POOL: TeamOffenseData[] = LEADERBOARD.map(row => ({
  team: row.team,
  metrics: {
    rushEpa: Math.round(row.epa_per_play * 0.82 * 1000) / 1000,
    passEpa: Math.round(row.epa_per_play * 1.18 * 1000) / 1000,
    successRate: row.success_rate, // real
    explosiveness: row.explosiveness, // real
    thirdDownRate: Math.min(0.72, Math.round((row.success_rate + 0.05) * 1000) / 1000),
  },
}))

export const OFFENSE_TEAM_DATA = OFFENSE_POOL.find(t => t.team === 'Ohio State')!

/**
 * Derived defense metrics: every value is a deterministic function of the
 * real `defense_ppg_rank` (1 = best scoring defense in FBS this season, 135
 * = worst) -- not a second real metric.
 */
export const DEFENSE_POOL: TeamDefenseData[] = LEADERBOARD.map(row => {
  const rankNorm = 1 - (row.defense_ppg_rank - 1) / 134 // 0 (worst) .. 1 (best)
  return {
    team: row.team,
    metrics: {
      epaAllowed: Math.round(((1 - rankNorm) * 0.35 - 0.05) * 1000) / 1000,
      havocRate: Math.round((0.12 + rankNorm * 0.14) * 1000) / 1000,
      stuffRate: Math.round((0.14 + rankNorm * 0.12) * 1000) / 1000,
      sacks: Math.round(18 + rankNorm * 22),
      interceptions: Math.round(6 + rankNorm * 10),
      tfls: Math.round(40 + rankNorm * 40),
    },
  }
})

export const DEFENSE_TEAM_DATA = DEFENSE_POOL.find(t => t.team === 'Ohio State')!
