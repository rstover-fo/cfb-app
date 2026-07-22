/**
 * Misc/primitive-family chart fixtures (ScoringTrendChart, AccuracyTrendChart,
 * a direct RoughRadar usage, and the StatBar variants row).
 *
 * REAL-SEEDED (2026-07-22, CFBD MCP
 * `query_matchup({ team_a: "Oklahoma", team_b: "Texas" })`): `MATCHUP_GAMES`
 * below is the tool's actual 27-game `games` array (gameId/season/week/
 * seasonType/startDate/neutralSite/teamAScore/teamBScore/teamAHome/winner/
 * result/venue), used verbatim -- CFBD MCP's field names already match
 * `MatchupGame` exactly. `PREDICTION_ACCURACY` and the direct `RoughRadar`
 * demo below are hand-authored (no accuracy-backtest or arbitrary-radar
 * endpoint among the tools loaded for this task); the radar's percentiles
 * are computed against the real `LEADERBOARD` pool from ./analytics.
 */
import type { MatchupGame } from '@/lib/queries/matchups'
import type { PredictionAccuracyRow } from '@/lib/queries/predictions'
import type { RoughRadarAxis, RoughRadarSeries } from '@/lib/charts/RoughRadar'
import { LEADERBOARD } from './analytics'
import { teamColor } from './shared'

export const SCORING_TREND_TEAM_A = { name: 'Oklahoma', logo: null, color: teamColor('Oklahoma') }
export const SCORING_TREND_TEAM_B = { name: 'Texas', logo: null, color: teamColor('Texas') }

/** REAL: full Oklahoma-Texas ("Red River Rivalry") game log, 2000-2025. */
export const MATCHUP_GAMES: MatchupGame[] = [
  { gameId: 401752736, season: 2025, week: 7, seasonType: 'regular', startDate: '2025-10-11T19:30:00+00:00', neutralSite: true, teamAScore: 6, teamBScore: 23, teamAHome: false, winner: 'Texas', result: 'L', venue: 'Cotton Bowl' },
  { gameId: 401628390, season: 2024, week: 7, seasonType: 'regular', startDate: '2024-10-12T19:30:00+00:00', neutralSite: true, teamAScore: 3, teamBScore: 34, teamAHome: true, winner: 'Texas', result: 'L', venue: 'Cotton Bowl' },
  { gameId: 401525861, season: 2023, week: 6, seasonType: 'regular', startDate: '2023-10-07T16:00:00+00:00', neutralSite: true, teamAScore: 34, teamBScore: 30, teamAHome: false, winner: 'Oklahoma', result: 'W', venue: 'Cotton Bowl' },
  { gameId: 401404090, season: 2022, week: 6, seasonType: 'regular', startDate: '2022-10-08T16:00:00+00:00', neutralSite: true, teamAScore: 0, teamBScore: 49, teamAHome: true, winner: 'Texas', result: 'L', venue: 'Cotton Bowl' },
  { gameId: 401287918, season: 2021, week: 6, seasonType: 'regular', startDate: '2021-10-09T16:00:00+00:00', neutralSite: true, teamAScore: 55, teamBScore: 48, teamAHome: false, winner: 'Oklahoma', result: 'W', venue: 'Cotton Bowl' },
  { gameId: 401236005, season: 2020, week: 6, seasonType: 'regular', startDate: '2020-10-10T16:00:00+00:00', neutralSite: true, teamAScore: 53, teamBScore: 45, teamAHome: true, winner: 'Oklahoma', result: 'W', venue: 'Cotton Bowl' },
  { gameId: 401112118, season: 2019, week: 7, seasonType: 'regular', startDate: '2019-10-12T16:00:00+00:00', neutralSite: true, teamAScore: 34, teamBScore: 27, teamAHome: false, winner: 'Oklahoma', result: 'W', venue: 'Cotton Bowl' },
  { gameId: 401056698, season: 2018, week: 14, seasonType: 'regular', startDate: '2018-12-01T17:00:00+00:00', neutralSite: true, teamAScore: 39, teamBScore: 27, teamAHome: true, winner: 'Oklahoma', result: 'W', venue: 'AT&T Stadium' },
  { gameId: 401013067, season: 2018, week: 6, seasonType: 'regular', startDate: '2018-10-06T16:00:00+00:00', neutralSite: true, teamAScore: 45, teamBScore: 48, teamAHome: true, winner: 'Texas', result: 'L', venue: 'Cotton Bowl' },
  { gameId: 400934528, season: 2017, week: 7, seasonType: 'regular', startDate: '2017-10-14T19:30:00+00:00', neutralSite: true, teamAScore: 29, teamBScore: 24, teamAHome: false, winner: 'Oklahoma', result: 'W', venue: 'Cotton Bowl' },
  { gameId: 400869615, season: 2016, week: 6, seasonType: 'regular', startDate: '2016-10-08T16:00:00+00:00', neutralSite: true, teamAScore: 45, teamBScore: 40, teamAHome: true, winner: 'Oklahoma', result: 'W', venue: 'Cotton Bowl' },
  { gameId: 400763434, season: 2015, week: 6, seasonType: 'regular', startDate: '2015-10-10T16:00:00+00:00', neutralSite: true, teamAScore: 17, teamBScore: 24, teamAHome: false, winner: 'Texas', result: 'L', venue: 'Cotton Bowl' },
  { gameId: 400547870, season: 2014, week: 7, seasonType: 'regular', startDate: '2014-10-11T16:00:00+00:00', neutralSite: true, teamAScore: 31, teamBScore: 26, teamAHome: true, winner: 'Oklahoma', result: 'W', venue: 'Cotton Bowl' },
  { gameId: 332850251, season: 2013, week: 7, seasonType: 'regular', startDate: '2013-10-12T16:00:00+00:00', neutralSite: true, teamAScore: 20, teamBScore: 36, teamAHome: false, winner: 'Texas', result: 'L', venue: null },
  { gameId: 322870201, season: 2012, week: 7, seasonType: 'regular', startDate: '2012-10-13T16:00:00+00:00', neutralSite: true, teamAScore: 63, teamBScore: 21, teamAHome: true, winner: 'Oklahoma', result: 'W', venue: null },
  { gameId: 312810251, season: 2011, week: 6, seasonType: 'regular', startDate: '2011-10-08T16:00:00+00:00', neutralSite: true, teamAScore: 55, teamBScore: 17, teamAHome: false, winner: 'Oklahoma', result: 'W', venue: null },
  { gameId: 302750201, season: 2010, week: 5, seasonType: 'regular', startDate: '2010-10-02T19:30:00+00:00', neutralSite: true, teamAScore: 28, teamBScore: 20, teamAHome: true, winner: 'Oklahoma', result: 'W', venue: null },
  { gameId: 292900251, season: 2009, week: 7, seasonType: 'regular', startDate: '2009-10-17T16:00:00+00:00', neutralSite: true, teamAScore: 13, teamBScore: 16, teamAHome: false, winner: 'Texas', result: 'L', venue: null },
  { gameId: 282850201, season: 2008, week: 7, seasonType: 'regular', startDate: '2008-10-11T16:00:00+00:00', neutralSite: true, teamAScore: 35, teamBScore: 45, teamAHome: true, winner: 'Texas', result: 'L', venue: null },
  { gameId: 272790251, season: 2007, week: 6, seasonType: 'regular', startDate: '2007-10-06T19:30:00+00:00', neutralSite: false, teamAScore: 28, teamBScore: 21, teamAHome: false, winner: 'Oklahoma', result: 'W', venue: null },
  { gameId: 262800201, season: 2006, week: 6, seasonType: 'regular', startDate: '2006-10-07T19:30:00+00:00', neutralSite: false, teamAScore: 10, teamBScore: 28, teamAHome: true, winner: 'Texas', result: 'L', venue: null },
  { gameId: 252810251, season: 2005, week: 6, seasonType: 'regular', startDate: '2005-10-08T17:00:00+00:00', neutralSite: false, teamAScore: 12, teamBScore: 45, teamAHome: false, winner: 'Texas', result: 'L', venue: null },
  { gameId: 242830201, season: 2004, week: 7, seasonType: 'regular', startDate: '2004-10-09T16:00:00+00:00', neutralSite: false, teamAScore: 12, teamBScore: 0, teamAHome: true, winner: 'Oklahoma', result: 'W', venue: 'Memorial Stadium (Norman, OK)' },
  { gameId: 232840251, season: 2003, week: 8, seasonType: 'regular', startDate: '2003-10-11T19:30:00+00:00', neutralSite: false, teamAScore: 65, teamBScore: 13, teamAHome: false, winner: 'Oklahoma', result: 'W', venue: null },
  { gameId: 222850201, season: 2002, week: 8, seasonType: 'regular', startDate: '2002-10-12T19:30:00+00:00', neutralSite: false, teamAScore: 35, teamBScore: 24, teamAHome: true, winner: 'Oklahoma', result: 'W', venue: null },
  { gameId: 212790251, season: 2001, week: 7, seasonType: 'regular', startDate: '2001-10-06T19:30:00+00:00', neutralSite: false, teamAScore: 14, teamBScore: 3, teamAHome: false, winner: 'Oklahoma', result: 'W', venue: null },
  { gameId: 63388, season: 2000, week: 7, seasonType: 'regular', startDate: '2000-10-07T00:00:00+00:00', neutralSite: false, teamAScore: 63, teamBScore: 14, teamAHome: true, winner: 'Oklahoma', result: 'W', venue: null },
]

/** Hand-authored: 2 models x 5 seasons at edge_threshold 0 (10 rows). */
export const PREDICTION_ACCURACY: PredictionAccuracyRow[] = [
  { model_version: 'elo_epa_blend_v1', season: 2021, edge_threshold: 0, n_games: 720, n_with_market: 668, margin_mae: 11.6, margin_rmse: 14.8, ats_wins: 328, ats_losses: 327, ats_pushes: 13, ats_hit_rate: 0.5008, brier: 0.214, cfbd_brier: 0.211, n_scored_win_prob: 720 },
  { model_version: 'elo_v1', season: 2021, edge_threshold: 0, n_games: 720, n_with_market: 668, margin_mae: 12.1, margin_rmse: 15.3, ats_wins: 320, ats_losses: 335, ats_pushes: 13, ats_hit_rate: 0.4885, brier: 0.221, cfbd_brier: 0.211, n_scored_win_prob: 720 },
  { model_version: 'elo_epa_blend_v1', season: 2022, edge_threshold: 0, n_games: 748, n_with_market: 701, margin_mae: 11.2, margin_rmse: 14.3, ats_wins: 351, ats_losses: 337, ats_pushes: 13, ats_hit_rate: 0.5102, brier: 0.209, cfbd_brier: 0.206, n_scored_win_prob: 748 },
  { model_version: 'elo_v1', season: 2022, edge_threshold: 0, n_games: 748, n_with_market: 701, margin_mae: 11.7, margin_rmse: 14.9, ats_wins: 342, ats_losses: 346, ats_pushes: 13, ats_hit_rate: 0.4971, brier: 0.216, cfbd_brier: 0.206, n_scored_win_prob: 748 },
  { model_version: 'elo_epa_blend_v1', season: 2023, edge_threshold: 0, n_games: 762, n_with_market: 719, margin_mae: 10.9, margin_rmse: 13.8, ats_wins: 368, ats_losses: 339, ats_pushes: 12, ats_hit_rate: 0.5205, brier: 0.203, cfbd_brier: 0.201, n_scored_win_prob: 762 },
  { model_version: 'elo_v1', season: 2023, edge_threshold: 0, n_games: 762, n_with_market: 719, margin_mae: 11.5, margin_rmse: 14.5, ats_wins: 355, ats_losses: 352, ats_pushes: 12, ats_hit_rate: 0.5021, brier: 0.212, cfbd_brier: 0.201, n_scored_win_prob: 762 },
  { model_version: 'elo_epa_blend_v1', season: 2024, edge_threshold: 0, n_games: 771, n_with_market: 733, margin_mae: 10.6, margin_rmse: 13.5, ats_wins: 378, ats_losses: 342, ats_pushes: 13, ats_hit_rate: 0.5250, brier: 0.199, cfbd_brier: 0.198, n_scored_win_prob: 771 },
  { model_version: 'elo_v1', season: 2024, edge_threshold: 0, n_games: 771, n_with_market: 733, margin_mae: 11.3, margin_rmse: 14.4, ats_wins: 362, ats_losses: 359, ats_pushes: 12, ats_hit_rate: 0.5017, brier: 0.210, cfbd_brier: 0.198, n_scored_win_prob: 771 },
  { model_version: 'elo_epa_blend_v1', season: 2025, edge_threshold: 0, n_games: 780, n_with_market: 742, margin_mae: 10.8, margin_rmse: 13.9, ats_wins: 380, ats_losses: 350, ats_pushes: 12, ats_hit_rate: 0.5205, brier: 0.201, cfbd_brier: 0.198, n_scored_win_prob: 780 },
  { model_version: 'elo_v1', season: 2025, edge_threshold: 0, n_games: 780, n_with_market: 742, margin_mae: 11.4, margin_rmse: 14.6, ats_wins: 365, ats_losses: 365, ats_pushes: 12, ats_hit_rate: 0.5, brier: 0.209, cfbd_brier: 0.198, n_scored_win_prob: 780 },
]

// ---------------------------------------------------------------------------
// Direct RoughRadar usage -- offensive-identity profile, Ohio State vs Texas,
// percentiles computed against the real LEADERBOARD pool (./analytics).
// ---------------------------------------------------------------------------
function percentileOf(team: string, pick: (r: (typeof LEADERBOARD)[number]) => number, higherIsBetter = true): number {
  const values = LEADERBOARD.map(pick)
  const value = pick(LEADERBOARD.find(r => r.team === team)!)
  const sorted = [...values].sort((a, b) => a - b)
  const rank = sorted.filter(v => v < value).length
  const pct = (rank / Math.max(sorted.length - 1, 1)) * 100
  return Math.round(higherIsBetter ? pct : 100 - pct)
}

export const ROUGH_RADAR_AXES: RoughRadarAxis[] = [
  { key: 'success', label: 'Success Rate' },
  { key: 'explosive', label: 'Explosiveness' },
  { key: 'epa', label: 'EPA / Play' },
  { key: 'sp', label: 'SP+ Rating' },
  { key: 'defense', label: 'Scoring Defense' },
]

export const ROUGH_RADAR_SERIES: RoughRadarSeries[] = [
  {
    label: 'Ohio State',
    color: teamColor('Ohio State'),
    values: [
      percentileOf('Ohio State', r => r.success_rate),
      percentileOf('Ohio State', r => r.explosiveness),
      percentileOf('Ohio State', r => r.epa_per_play),
      percentileOf('Ohio State', r => r.sp_rating),
      percentileOf('Ohio State', r => r.defense_ppg_rank, false),
    ],
  },
  {
    label: 'Texas',
    color: teamColor('Texas'),
    values: [
      percentileOf('Texas', r => r.success_rate),
      percentileOf('Texas', r => r.explosiveness),
      percentileOf('Texas', r => r.epa_per_play),
      percentileOf('Texas', r => r.sp_rating),
      percentileOf('Texas', r => r.defense_ppg_rank, false),
    ],
  },
]

// ---------------------------------------------------------------------------
// StatBar variants row -- direction (ltr/rtl) x color source (team hex,
// semantic tone). Hand-authored prop combinations, not chart data.
// ---------------------------------------------------------------------------
export const STAT_BAR_VARIANTS: {
  label: string
  value: number
  direction?: 'ltr' | 'rtl'
  color?: string
  thresholdTone?: 'positive' | 'neutral' | 'negative'
}[] = [
  { label: 'ltr, team color', value: 72, direction: 'ltr', color: teamColor('Ohio State') },
  { label: 'rtl, team color', value: 58, direction: 'rtl', color: teamColor('Texas') },
  { label: 'positive tone', value: 84, thresholdTone: 'positive' },
  { label: 'neutral tone', value: 50, thresholdTone: 'neutral' },
  { label: 'negative tone', value: 22, thresholdTone: 'negative' },
]
