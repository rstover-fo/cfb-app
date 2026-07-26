/**
 * Fixtures for the `team-metric-trend` chart.
 *
 * The numbers are real `api.team_history` values for Oklahoma and Clemson,
 * 2015-2025 -- the exact request that motivated building a generative chart
 * primitive ("plot the last decade of SP+ defense for OU and Clemson, mark
 * where Brent took over"). Real data keeps the SVG snapshots honest about
 * what the scales, gaps and label widths actually do; invented round numbers
 * would flatter the layout.
 */
import type { TeamTrendPoint, TeamTrendSeries } from '../../trend'

function seasonsFrom(first: number, values: number[]): TeamTrendPoint[] {
  return values.map((value, index) => ({ season: first + index, value }))
}

/** SP+ defensive rating (lower is better), 2015-2025. */
export const OKLAHOMA_SP_DEFENSE: TeamTrendSeries = {
  team: 'Oklahoma',
  points: seasonsFrom(2015, [19.3, 22.9, 24.2, 30, 24.9, 25.2, 25.6, 26.5, 22.6, 17.8, 12.9]),
}

export const CLEMSON_SP_DEFENSE: TeamTrendSeries = {
  team: 'Clemson',
  points: seasonsFrom(2015, [17.2, 14.1, 8.3, 12.6, 14.6, 16.7, 11.6, 18.5, 19, 20.9, 18.9]),
}

/** SP+ rank (1 is best), 2015-2025 -- the inverted-rank-axis fixture. */
export const OKLAHOMA_SP_RANK: TeamTrendSeries = {
  team: 'Oklahoma',
  points: seasonsFrom(2015, [7, 4, 7, 4, 8, 12, 13, 19, 17, 33, 14]),
}

export const CLEMSON_SP_RANK: TeamTrendSeries = {
  team: 'Clemson',
  points: seasonsFrom(2015, [4, 2, 5, 3, 4, 4, 8, 13, 22, 22, 34]),
}

export const TEXAS_SP_RANK: TeamTrendSeries = {
  team: 'Texas',
  points: seasonsFrom(2015, [62, 36, 30, 31, 26, 29, 48, 7, 6, 7, 17]),
}

export const OHIO_STATE_SP_RANK: TeamTrendSeries = {
  team: 'Ohio State',
  points: seasonsFrom(2015, [1, 10, 2, 6, 1, 1, 2, 3, 4, 1, 2]),
}

/** Wins, 2015-2025 -- a single-series, whole-number fixture. */
export const OKLAHOMA_WINS: TeamTrendSeries = {
  team: 'Oklahoma',
  points: seasonsFrom(2015, [11, 11, 12, 12, 12, 9, 11, 6, 10, 6, 10]),
}

/**
 * A team whose FBS record starts mid-range, with a hole in the middle: the
 * renderer must break the line at both discontinuities rather than drawing a
 * trend across seasons that never happened.
 */
export const GAPPED_SERIES: TeamTrendSeries = {
  team: 'James Madison',
  points: [
    { season: 2015, value: 30.1 },
    { season: 2016, value: 28.4 },
    { season: 2022, value: 36.2 },
    { season: 2023, value: 31.9 },
    { season: 2025, value: 33 },
  ],
}

/** One season only -- an isolated point that must still get a marker. */
export const SINGLE_POINT_SERIES: TeamTrendSeries = {
  team: 'Sam Houston',
  points: [{ season: 2023, value: 19.4 }],
}

/** A requested team the view has nothing for. */
export const EMPTY_SERIES: TeamTrendSeries = { team: 'Nobody State', points: [] }
