/**
 * Fixtures for the `team-metric-*` chart family.
 *
 * The numbers are real `api.team_history` values for Oklahoma and Clemson,
 * 2015-2025 -- the exact request that motivated building a generative chart
 * primitive ("plot the last decade of SP+ defense for OU and Clemson, mark
 * where Brent took over"). Real data keeps the SVG snapshots honest about
 * what the scales, gaps and label widths actually do; invented round numbers
 * would flatter the layout.
 */
import type { ScatterMark } from '@/lib/charts/server/teamMetricScatter'
import type { TeamMetricPoint, TeamMetricSeries, TeamMetricValue } from '../../teamMetric'

function seasonsFrom(first: number, values: number[]): TeamMetricPoint[] {
  return values.map((value, index) => ({ season: first + index, value }))
}

/** SP+ defensive rating (lower is better), 2015-2025. */
export const OKLAHOMA_SP_DEFENSE: TeamMetricSeries = {
  team: 'Oklahoma',
  points: seasonsFrom(2015, [19.3, 22.9, 24.2, 30, 24.9, 25.2, 25.6, 26.5, 22.6, 17.8, 12.9]),
}

export const CLEMSON_SP_DEFENSE: TeamMetricSeries = {
  team: 'Clemson',
  points: seasonsFrom(2015, [17.2, 14.1, 8.3, 12.6, 14.6, 16.7, 11.6, 18.5, 19, 20.9, 18.9]),
}

/** SP+ rank (1 is best), 2015-2025 -- the inverted-rank-axis fixture. */
export const OKLAHOMA_SP_RANK: TeamMetricSeries = {
  team: 'Oklahoma',
  points: seasonsFrom(2015, [7, 4, 7, 4, 8, 12, 13, 19, 17, 33, 14]),
}

export const CLEMSON_SP_RANK: TeamMetricSeries = {
  team: 'Clemson',
  points: seasonsFrom(2015, [4, 2, 5, 3, 4, 4, 8, 13, 22, 22, 34]),
}

export const TEXAS_SP_RANK: TeamMetricSeries = {
  team: 'Texas',
  points: seasonsFrom(2015, [62, 36, 30, 31, 26, 29, 48, 7, 6, 7, 17]),
}

export const OHIO_STATE_SP_RANK: TeamMetricSeries = {
  team: 'Ohio State',
  points: seasonsFrom(2015, [1, 10, 2, 6, 1, 1, 2, 3, 4, 1, 2]),
}

/** Wins, 2015-2025 -- a single-series, whole-number fixture. */
export const OKLAHOMA_WINS: TeamMetricSeries = {
  team: 'Oklahoma',
  points: seasonsFrom(2015, [11, 11, 12, 12, 12, 9, 11, 6, 10, 6, 10]),
}

/**
 * A team whose FBS record starts mid-range, with a hole in the middle: the
 * renderer must break the line at both discontinuities rather than drawing a
 * trend across seasons that never happened.
 */
export const GAPPED_SERIES: TeamMetricSeries = {
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
export const SINGLE_POINT_SERIES: TeamMetricSeries = {
  team: 'Sam Houston',
  points: [{ season: 2023, value: 19.4 }],
}

/** A requested team the view has nothing for. */
export const EMPTY_SERIES: TeamMetricSeries = { team: 'Nobody State', points: [] }

// ---------------------------------------------------------------------------
// Single-season shapes (`team-metric-bars`)
// ---------------------------------------------------------------------------
// Same view, same metrics, projected to one season -- the shape
// `getTeamMetricSeason` returns. Derived from the series above where they
// overlap, so the two shapes cannot drift into telling different stories about
// the same team-season.

/** 2025 SP+ defensive rating (lower is better) across four programs. */
export const SP_DEFENSE_2025: TeamMetricValue[] = [
  { team: 'Oklahoma', value: 12.9 },
  { team: 'Texas', value: 16.4 },
  { team: 'Ohio State', value: 9.1 },
  { team: 'Clemson', value: 18.9 },
]

/** 2025 SP+ rank (1 is best) -- the rank-axis bars fixture. */
export const SP_RANK_2025: TeamMetricValue[] = [
  { team: 'Oklahoma', value: 14 },
  { team: 'Clemson', value: 34 },
  { team: 'Texas', value: 17 },
  { team: 'Ohio State', value: 2 },
]

/** 2025 wins (higher is better) -- a whole-number, two-team fixture. */
export const WINS_2025: TeamMetricValue[] = [
  { team: 'Oklahoma', value: 10 },
  { team: 'Clemson', value: 4 },
]

/**
 * Average scoring margin, which genuinely goes both ways: the bar domain has
 * to span zero and some bars point left.
 */
export const MARGIN_2025: TeamMetricValue[] = [
  { team: 'Ohio State', value: 21.4 },
  { team: 'Oklahoma', value: 6.2 },
  { team: 'Clemson', value: -3.8 },
]

/** Nobody has a number: the bars empty state. */
export const NO_VALUES_2025: TeamMetricValue[] = [
  { team: 'Nobody State', value: null },
  { team: 'Nowhere Tech', value: null },
]

// ---------------------------------------------------------------------------
// Two-metric field shapes (`team-metric-scatter`)
// ---------------------------------------------------------------------------

/**
 * Stand-in logos: 4x4 solid-colour PNGs, ~120 bytes each as a data URI.
 *
 * Fixtures rather than real assets, for two reasons that both matter. Nothing
 * in the suite may touch the network -- the renderer is pure and the logo fetch
 * lives in the route, so a test that fetched would be testing the wrong module
 * anyway -- and a real 500px crest is ~20KB of base64 that would make the SVG
 * snapshots unreadable even after elision.
 *
 * Two distinct colours so a mark drawn with the wrong team's logo is a visible
 * snapshot diff rather than a silent pass.
 */
export const FIXTURE_LOGO_A =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGM4UhUFRwzEcQCd8hmBQP+p3gAAAABJRU5ErkJggg=='
export const FIXTURE_LOGO_B =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGMIzdkFRwzEcQBh4hexmrLwZgAAAABJRU5ErkJggg=='

/**
 * Real 2025 `api.team_history` rows: SP+ offense, SP+ defense and the SP+
 * overall rating that ranks them. The top 25 by rating, in rating order, so
 * `placing` here is the real placing.
 *
 * The mixed-direction case, and the one that motivated the shape: offense is
 * higher-is-better, defense is lower-is-better, so exactly one axis reverses.
 *
 * Every other team carries a logo; North Texas deliberately carries none, so
 * the fallback mark is exercised by the ordinary reference fixture rather than
 * only by a special-case test.
 */
export const SP_FIELD_2025: ScatterMark[] = [
  { team: 'Indiana', x: 40.8, y: 9.9, placing: 1, logo: FIXTURE_LOGO_A },
  { team: 'Ohio State', x: 37.6, y: 7.7, placing: 2, logo: FIXTURE_LOGO_B },
  { team: 'Texas Tech', x: 39.3, y: 12.3, placing: 3, logo: FIXTURE_LOGO_A },
  { team: 'Oregon', x: 38.7, y: 13.5, placing: 4, logo: FIXTURE_LOGO_B },
  { team: 'Notre Dame', x: 40, y: 16.3, placing: 5, logo: FIXTURE_LOGO_A },
  { team: 'Georgia', x: 37, y: 14.8, placing: 6, logo: FIXTURE_LOGO_B },
  { team: 'Ole Miss', x: 40.4, y: 18.3, placing: 7, logo: FIXTURE_LOGO_A },
  { team: 'Utah', x: 39.7, y: 17.5, placing: 8, logo: FIXTURE_LOGO_B },
  { team: 'Miami', x: 34.2, y: 14.3, placing: 9, logo: FIXTURE_LOGO_A },
  { team: 'Texas A&M', x: 38, y: 16.4, placing: 10, logo: FIXTURE_LOGO_B },
  { team: 'Vanderbilt', x: 39.9, y: 21.4, placing: 11, logo: FIXTURE_LOGO_A },
  { team: 'Iowa', x: 32.1, y: 14.2, placing: 12, logo: FIXTURE_LOGO_B },
  { team: 'Washington', x: 34.5, y: 15.3, placing: 13, logo: FIXTURE_LOGO_A },
  { team: 'Oklahoma', x: 30.1, y: 12.9, placing: 14, logo: FIXTURE_LOGO_B },
  { team: 'Penn State', x: 35.1, y: 18.8, placing: 15, logo: FIXTURE_LOGO_A },
  { team: 'USC', x: 38.9, y: 21, placing: 16, logo: FIXTURE_LOGO_B },
  { team: 'Texas', x: 32.9, y: 17.9, placing: 17, logo: FIXTURE_LOGO_A },
  { team: 'BYU', x: 33.9, y: 18.8, placing: 18, logo: FIXTURE_LOGO_B },
  { team: 'Tennessee', x: 39.3, y: 25.4, placing: 19, logo: FIXTURE_LOGO_A },
  { team: 'Alabama', x: 32.2, y: 16.1, placing: 20, logo: FIXTURE_LOGO_B },
  { team: 'Missouri', x: 31.2, y: 15.4, placing: 21, logo: FIXTURE_LOGO_A },
  // No logo row at all -- the fallback mark, in the reference fixture.
  { team: 'North Texas', x: 43.1, y: 28.6, placing: 22, logo: null },
  { team: 'SMU', x: 34.2, y: 19.5, placing: 23, logo: FIXTURE_LOGO_B },
  { team: 'Illinois', x: 33.3, y: 21.7, placing: 24, logo: FIXTURE_LOGO_A },
  { team: 'Michigan', x: 30.9, y: 17, placing: 25, logo: FIXTURE_LOGO_B },
]

/**
 * Purdue's real 2025 row: 90th by SP+ rating, so far outside the field, and
 * worse than every team in it on BOTH metrics. Union it in and the domain has
 * to stretch to hold it -- which is the whole point of drawing a named team
 * that missed the cut.
 */
export const OUTSIDE_FIELD_2025: ScatterMark = {
  team: 'Purdue',
  x: 21.9,
  y: 29.9,
  placing: 90,
  logo: FIXTURE_LOGO_A,
}

/** A team the ranking metric has nothing for, but both plotted metrics do. */
export const UNRANKED_FIELD_2025: ScatterMark = {
  team: 'Sam Houston',
  x: 24.2,
  y: 27.1,
  placing: null,
  logo: FIXTURE_LOGO_B,
}
