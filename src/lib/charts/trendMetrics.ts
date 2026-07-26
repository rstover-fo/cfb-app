/**
 * The metric enum behind the `team-metric-trend` chart.
 *
 * ---------------------------------------------------------------------------
 * Why a registry instead of a free-text column name
 * ---------------------------------------------------------------------------
 * `team-metric-trend` is a *generative* primitive: one renderer over
 * (metric x teams x season range). The thing that keeps a generative chart
 * honest is a closed enum that maps to columns which genuinely exist. Without
 * it a model asks for `vibes_per_drive`, PostgREST returns an error, and the
 * route serves a plausible-looking empty chart -- a wrong answer that looks
 * like a right one.
 *
 * Every id below is a real column on the contracted `api.team_history` view
 * (one row per team-season). `src/lib/queries/__tests__/trend.test.ts` asserts
 * the select list this registry produces, and the ids double as the `metric`
 * URL parameter, so the URL is self-describing.
 *
 * ---------------------------------------------------------------------------
 * Direction
 * ---------------------------------------------------------------------------
 * Half of these metrics are better when they are *smaller* -- SP+ defensive
 * rating is points-per-drive-ish (lower = a better defense), and every `rank`
 * is best at 1. Plotting those on a conventional axis draws "improving" as a
 * line going down, which reads as decline at a glance. So `lowerIsBetter`
 * metrics get an inverted y-axis (better is always up) *and* an explicit
 * footnote saying so -- the spec allows either; a chart posted to Discord with
 * no hover affordance and no axis to interrogate deserves both.
 *
 * DOM-free and query-free on purpose: the server renderer
 * (`src/lib/charts/server/teamMetricTrend.tsx`), the route schema, the MCP
 * tool and the query layer all import it, and the renderer must never reach
 * Supabase.
 */

/** How a metric's values are read, which drives formatting and the footnote. */
export type TrendMetricKind = 'value' | 'rank'

export interface TrendMetric {
  /** Column on `api.team_history`. Equal to the id today; kept explicit so a
   *  future derived metric can diverge without changing the public enum. */
  column: string
  /** Axis/masthead label, sentence case. */
  label: string
  /** Noun phrase for alt text and the MCP tool description. */
  blurb: string
  /** Smaller is better -- inverts the y-axis and changes the footnote. */
  lowerIsBetter: boolean
  kind: TrendMetricKind
  /** Renders one value for an axis tick. */
  format: (value: number) => string
}

function fixed(digits: number): (value: number) => string {
  return value => value.toFixed(digits)
}

function whole(value: number): string {
  return String(Math.round(value))
}

function percent(value: number): string {
  return `${(value * 100).toFixed(0)}%`
}

/**
 * Every metric the trend chart can draw. Ordered roughly by how often a
 * reader asks for it, because this order is what the MCP tool's enum
 * documentation lists.
 */
export const TREND_METRICS = {
  sp_rating: {
    column: 'sp_rating',
    label: 'SP+ overall rating',
    blurb: 'overall SP+ rating',
    lowerIsBetter: false,
    kind: 'value',
    format: fixed(1),
  },
  sp_offense: {
    column: 'sp_offense',
    label: 'SP+ offense rating',
    blurb: 'SP+ offensive rating',
    lowerIsBetter: false,
    kind: 'value',
    format: fixed(1),
  },
  sp_defense: {
    column: 'sp_defense',
    label: 'SP+ defense rating',
    blurb: 'SP+ defensive rating',
    lowerIsBetter: true,
    kind: 'value',
    format: fixed(1),
  },
  sp_rank: {
    column: 'sp_rank',
    label: 'SP+ rank',
    blurb: 'national SP+ rank',
    lowerIsBetter: true,
    kind: 'rank',
    format: whole,
  },
  elo: {
    column: 'elo',
    label: 'Elo rating',
    blurb: 'end-of-season Elo rating',
    lowerIsBetter: false,
    kind: 'value',
    format: whole,
  },
  fpi: {
    column: 'fpi',
    label: 'FPI',
    blurb: 'ESPN Football Power Index',
    lowerIsBetter: false,
    kind: 'value',
    format: fixed(1),
  },
  wins: {
    column: 'wins',
    label: 'Wins',
    blurb: 'wins',
    lowerIsBetter: false,
    kind: 'value',
    format: whole,
  },
  losses: {
    column: 'losses',
    label: 'Losses',
    blurb: 'losses',
    lowerIsBetter: true,
    kind: 'value',
    format: whole,
  },
  ppg: {
    column: 'ppg',
    label: 'Points per game',
    blurb: 'points scored per game',
    lowerIsBetter: false,
    kind: 'value',
    format: fixed(1),
  },
  opp_ppg: {
    column: 'opp_ppg',
    label: 'Points allowed per game',
    blurb: 'points allowed per game',
    lowerIsBetter: true,
    kind: 'value',
    format: fixed(1),
  },
  avg_margin: {
    column: 'avg_margin',
    label: 'Average scoring margin',
    blurb: 'average scoring margin',
    lowerIsBetter: false,
    kind: 'value',
    format: fixed(1),
  },
  epa_per_play: {
    column: 'epa_per_play',
    label: 'EPA per play',
    blurb: 'expected points added per play',
    lowerIsBetter: false,
    kind: 'value',
    format: fixed(2),
  },
  success_rate: {
    column: 'success_rate',
    label: 'Success rate',
    blurb: 'offensive success rate',
    lowerIsBetter: false,
    kind: 'value',
    format: percent,
  },
  explosiveness: {
    column: 'explosiveness',
    label: 'Explosiveness',
    blurb: 'explosiveness (EPA on successful plays)',
    lowerIsBetter: false,
    kind: 'value',
    format: fixed(2),
  },
  recruiting_rank: {
    column: 'recruiting_rank',
    label: 'Recruiting class rank',
    blurb: 'recruiting class rank',
    lowerIsBetter: true,
    kind: 'rank',
    format: whole,
  },
} as const satisfies Record<string, TrendMetric>

export type TrendMetricId = keyof typeof TREND_METRICS

/**
 * Non-empty tuple for `z.enum()`, derived from the registry rather than
 * retyped, so the URL schema and the MCP tool can never list a metric the
 * renderer does not know how to draw.
 */
export const TREND_METRIC_IDS = Object.keys(TREND_METRICS) as [TrendMetricId, ...TrendMetricId[]]

export function isTrendMetricId(value: string): value is TrendMetricId {
  return Object.prototype.hasOwnProperty.call(TREND_METRICS, value)
}

/** The metric's `TrendMetric` record. Narrow with `isTrendMetricId` first. */
export function trendMetric(id: TrendMetricId): TrendMetric {
  return TREND_METRICS[id]
}

/**
 * The one-line direction note printed under every trend chart, immediately
 * below the axis it describes. Says out loud what the inverted axis is doing,
 * so the picture cannot be misread by someone who only glances at the shape.
 *
 * Deliberately free of the metric label: the chart's headline sits four lines
 * above this and already names the metric, and interpolating a label produces
 * either a casing bug ("lower sp+ defense rating") or a grammar one ("higher
 * wins is better").
 */
export function trendDirectionNote(id: TrendMetricId): string {
  const metric = TREND_METRICS[id]
  if (metric.kind === 'rank') {
    return 'Rank 1 is best — the axis is inverted, so a better ranking sits higher.'
  }
  if (metric.lowerIsBetter) {
    return 'Lower is better — the axis is inverted, so stronger seasons sit higher.'
  }
  return 'Higher is better.'
}
