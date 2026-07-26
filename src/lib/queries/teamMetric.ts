/**
 * Query layer for the `team-metric-*` chart family: one metric, up to four
 * teams, read from the contracted `api.team_history` view (one row per
 * team-season -- the same view `getTeamHistory` in ./compare.ts reads for the
 * /compare route's history section).
 *
 * ONE read serves every shape. `team-metric-trend` asks for a season range and
 * draws the points as lines; `team-metric-bars` asks for a single season and
 * draws one bar per team. That is a difference in the arguments, not in the
 * query, so `getTeamMetricSeason` is a thin projection over
 * `getTeamMetricHistory` rather than a second PostgREST call with its own
 * null-handling and its own error contract to keep in step.
 *
 * Which columns are legal is not decided here: `src/lib/charts/metrics.ts` owns
 * the enum, and this module derives its select list from it. That is the whole
 * point of the registry -- a metric no renderer can draw is a metric this query
 * cannot ask for.
 *
 * Deliberately NOT wrapped in React's `cache()`, for the reason documented at
 * src/lib/queries/mcp.ts:18-24: `cache()` de-duplicates within a single React
 * Server Component render pass, and the only caller here is a Route Handler
 * (src/app/api/chart/[chart]/route.ts), which is not a render pass. Wrapping
 * it would buy nothing and risk an unscoped cache shared across requests.
 */
import { createClient } from '@/lib/supabase/server'
import { METRICS, type MetricId } from '@/lib/charts/metrics'

/** One team-season with a value for the requested metric. */
export interface TeamMetricPoint {
  season: number
  value: number
}

/**
 * One team's series. `points` is chronological and contains only seasons where
 * the view published a number -- a season the team did not play, or played
 * outside FBS, is a *gap*, not a zero, and a line renderer breaks there.
 * A team with nothing on record keeps its entry with an empty `points` array
 * so callers can name it in the "no data for..." note rather than silently
 * dropping it.
 */
export interface TeamMetricSeries {
  team: string
  points: TeamMetricPoint[]
}

/**
 * One team's value for a single season, or `null` when the view published
 * nothing. Same contract as the empty `points` array above: the team survives
 * as far as the footnote.
 */
export interface TeamMetricValue {
  team: string
  value: number | null
}

/**
 * Series cap. Four is where distinguishable treatments run out (the
 * `--series-*` ramp is four wide) and where a legend still fits two-up above a
 * 700px canvas.
 */
export const MAX_METRIC_TEAMS = 4

/**
 * Season floor for a metric request. `api.team_history` reaches back further
 * than any of these metrics are populated, but a floor that admits 1869 makes
 * every "last decade" request a candidate for a 150-tick x-axis if a caller
 * fat-fingers the range. 1950 is comfortably before any metric here exists.
 */
export const MIN_METRIC_SEASON = 1950

/** Longest span a single trend chart will draw, in seasons. */
export const MAX_TREND_SPAN = 40

interface TeamHistoryMetricRow {
  team: string | null
  season: number | null
  [column: string]: unknown
}

/**
 * Fetch one metric across a season range for up to `MAX_METRIC_TEAMS` teams.
 *
 * Returns one series per requested team, in the order given (the caller has
 * already normalized that order -- see the route -- so the same request always
 * produces the same chart and the same cacheable URL). On a query error every
 * series comes back empty, which the route renders as the empty card: a chart
 * that silently drew three of four teams would be a lie.
 */
export async function getTeamMetricHistory(
  teams: string[],
  metric: MetricId,
  from: number,
  to: number,
): Promise<TeamMetricSeries[]> {
  const column = METRICS[metric].column
  const empty = (): TeamMetricSeries[] => teams.map(team => ({ team, points: [] }))

  if (teams.length === 0 || to < from) return empty()

  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('team_history')
    // Explicit columns, never select('*') -- same convention as
    // TEAM_HISTORY_COLUMNS in ./compare.ts. `column` comes from the registry,
    // never from caller input, so this is not string-built SQL from a user.
    .select(`team, season, ${column}`)
    .in('team', teams)
    .gte('season', from)
    .lte('season', to)
    .order('season', { ascending: true })
    // One row per team-season, so the true ceiling is teams x seasons. Stated
    // explicitly rather than relying on PostgREST's default page size.
    .limit(teams.length * (to - from + 1))

  if (error || !data) {
    console.error('[teamMetric] getTeamMetricHistory error:', error)
    return empty()
  }

  const byTeam = new Map<string, TeamMetricPoint[]>(teams.map(team => [team, []]))

  for (const raw of data as unknown as TeamHistoryMetricRow[]) {
    const points = raw.team === null ? undefined : byTeam.get(raw.team)
    if (!points || raw.season === null) continue

    const value = raw[column]
    // Nulls are real here (a metric that predates the team's FBS era, a season
    // the model never fit) and must stay gaps rather than becoming zeros.
    if (typeof value !== 'number' || !Number.isFinite(value)) continue

    points.push({ season: raw.season, value })
  }

  return teams.map(team => ({
    team,
    // `.order()` above already sorts, but the sort is what a line renderer's
    // segment-on-gap logic depends on; asserting it here keeps that dependency
    // local instead of resting on PostgREST's ordering forever.
    points: (byTeam.get(team) ?? []).slice().sort((a, b) => a.season - b.season),
  }))
}

/**
 * Fetch one metric for one season -- the read `team-metric-bars` makes.
 *
 * A projection of `getTeamMetricHistory`, not a second query. The range read
 * with `from === to === season` already returns exactly the rows this needs,
 * and every subtlety worth getting right (nulls stay absent rather than
 * becoming zeros, requested teams survive with no data, a query error empties
 * everything rather than drawing a partial field) is then inherited instead of
 * re-implemented and kept in step by hand.
 */
export async function getTeamMetricSeason(
  teams: string[],
  metric: MetricId,
  season: number,
): Promise<TeamMetricValue[]> {
  const series = await getTeamMetricHistory(teams, metric, season, season)
  return series.map(entry => ({
    team: entry.team,
    value: entry.points[0]?.value ?? null,
  }))
}
