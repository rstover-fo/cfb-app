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
import { METRICS, axisIsReversed, type MetricId } from '@/lib/charts/metrics'

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

/**
 * How many teams a scatter draws as its background field.
 *
 * A scatter of the four teams a caller named is four dots and no context --
 * whatever it shows, the reader cannot tell whether 12.9 is good. The whole
 * FBS field is the opposite failure: ~130 hand-drawn marks on a 584-unit plot
 * is a texture, not a chart. 25 is the size the audience already reads a
 * college football field at, and it is roughly the density where individual
 * marks still separate.
 */
export const METRIC_FIELD_SIZE = 25

/**
 * Row ceiling on the field read. One row per team-season, so a season is a
 * couple of hundred rows at most; stated explicitly rather than relying on
 * PostgREST's default page size, and generous enough that the ranking below is
 * computed over the whole season rather than over an arbitrary prefix of it.
 */
const MAX_FIELD_ROWS = 400

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

// ---------------------------------------------------------------------------
// The field read -- `team-metric-scatter`
// ---------------------------------------------------------------------------

/** One team's position in a two-metric field, plus where it placed. */
export interface TeamMetricFieldPoint {
  team: string
  x: number
  y: number
  /**
   * 1-based placing on the ranking metric across the whole season, or `null`
   * when the view published no ranking value for this team. Null is a real
   * outcome, not an error: a team can have both plotted metrics and no SP+
   * rating, and dropping it would silently delete a team the caller named.
   */
  placing: number | null
}

export interface TeamMetricField {
  /** The top `size` teams by the ranking metric, plus any named team outside them. */
  points: TeamMetricFieldPoint[]
  /** Named teams the view had no usable row for -- they survive to the footnote. */
  missing: string[]
}

interface FieldRow {
  team: string | null
  [column: string]: unknown
}

/** A finite number, or null -- the same "a gap is not a zero" rule as above. */
function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Fetch a season's field on two metrics, ranked by a third.
 *
 * ---------------------------------------------------------------------------
 * One read for the whole season, ranked here
 * ---------------------------------------------------------------------------
 * The obvious implementation is two PostgREST calls -- `order(rankBy).limit(25)`
 * for the field, `.in('team', highlight)` for the named teams -- and it is
 * worse in every way that matters. A season is a couple of hundred rows, so the
 * saving is nothing; the two calls can disagree (a team in both comes back
 * twice, and de-duplicating it is code that only exists because of the split);
 * and, decisively, the second call cannot tell you a named team's PLACING,
 * which is the number that makes "#80, drawn against the top 25" legible rather
 * than mysterious. So: one read of the season, ranked in memory.
 *
 * A row needs BOTH plotted metrics to be a point -- half a coordinate pair is
 * not a position -- but only the field cares about the ranking metric; a named
 * team without one still plots, with a null placing.
 *
 * On a query error the field comes back empty and every named team lands in
 * `missing`, so the route draws its empty card. A scatter that quietly plotted
 * six of the top 25 would read as a complete picture of the season.
 */
export async function getTeamMetricField(
  x: MetricId,
  y: MetricId,
  season: number,
  rankBy: MetricId,
  highlight: readonly string[] = [],
  size: number = METRIC_FIELD_SIZE,
): Promise<TeamMetricField> {
  const empty = (): TeamMetricField => ({ points: [], missing: [...highlight] })

  const xColumn = METRICS[x].column
  const yColumn = METRICS[y].column
  const rankColumn = METRICS[rankBy].column

  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('team_history')
    // Explicit columns, never select('*'), and de-duplicated because the
    // ranking metric is very often one of the two plotted ones (the default
    // `sp_rating` against `sp_offense`/`sp_defense` is the reference request).
    // All three names come from the registry, never from caller input.
    .select([...new Set(['team', xColumn, yColumn, rankColumn])].join(', '))
    .eq('season', season)
    .limit(MAX_FIELD_ROWS)

  if (error || !data) {
    console.error('[teamMetric] getTeamMetricField error:', error)
    return empty()
  }

  const rows: Array<TeamMetricFieldPoint & { rankValue: number | null }> = []
  for (const raw of data as unknown as FieldRow[]) {
    if (!raw.team) continue
    const xValue = numberOrNull(raw[xColumn])
    const yValue = numberOrNull(raw[yColumn])
    // Half a pair is not a position. A team missing one metric is dropped from
    // the field entirely rather than plotted at an invented coordinate.
    if (xValue === null || yValue === null) continue
    rows.push({ team: raw.team, x: xValue, y: yValue, placing: null, rankValue: numberOrNull(raw[rankColumn]) })
  }

  // Best first on the ranking metric, whichever way it runs. Rows with no
  // ranking value sink to the end rather than sorting as zero, and the team
  // name is the tie-break so the same season always produces the same field --
  // which is what makes the rendered PNG cacheable.
  const reversed = axisIsReversed(rankBy)
  rows.sort((a, b) => {
    if (a.rankValue === null || b.rankValue === null) {
      if (a.rankValue !== b.rankValue) return a.rankValue === null ? 1 : -1
      return a.team.localeCompare(b.team)
    }
    const delta = reversed ? a.rankValue - b.rankValue : b.rankValue - a.rankValue
    return delta !== 0 ? delta : a.team.localeCompare(b.team)
  })

  let placing = 0
  for (const row of rows) {
    if (row.rankValue === null) continue
    row.placing = ++placing
  }

  const named = new Set(highlight)
  // The field, plus every named team that missed the cut. Union rather than
  // replacement: a team someone asked about is the SUBJECT of the chart, and it
  // has to appear whether it placed 3rd or 80th -- but it does not displace a
  // top-25 team, because the field is what gives its position meaning.
  const points = rows.filter((row, index) => index < size || named.has(row.team))

  const plotted = new Set(points.map(row => row.team))
  return {
    points: points.map(({ team, x: px, y: py, placing: place }) => ({ team, x: px, y: py, placing: place })),
    missing: highlight.filter(team => !plotted.has(team)),
  }
}
