/**
 * The metric enum behind every `team-metric-*` chart.
 *
 * ---------------------------------------------------------------------------
 * Why a registry instead of a free-text column name
 * ---------------------------------------------------------------------------
 * The `team-metric-*` family is *generative*: the data axes (which metric,
 * which teams, which seasons) are parameters, and only the SHAPE is fixed per
 * chart id. The thing that keeps a generative chart honest is a closed enum
 * that maps to columns which genuinely exist. Without it a model asks for
 * `vibes_per_drive`, PostgREST returns an error, and the route serves a
 * plausible-looking empty chart -- a wrong answer that looks like a right one.
 *
 * Every id below is a real column on the contracted `api.team_history` view
 * (one row per team-season). `src/lib/queries/__tests__/teamMetric.test.ts`
 * asserts the select list this registry produces, and the ids double as the
 * `metric` URL parameter, so the URL is self-describing.
 *
 * ---------------------------------------------------------------------------
 * Direction, and why each shape says it differently
 * ---------------------------------------------------------------------------
 * Half of these metrics are better when they are *smaller* -- SP+ defensive
 * rating is points-per-drive-ish (lower = a better defense), and every `rank`
 * is best at 1. A chart that draws "improving" as a line going down reads as
 * decline at a glance, so every shape owes the reader a direction treatment
 * plus a sentence naming it. What the treatment IS depends on the shape, and
 * the two notes below are deliberately separate strings rather than one
 * parameterized sentence:
 *
 * - **Lines** (`team-metric-trend`) invert the y-axis, so "up" is always
 *   "better" and the metric's own units still label the axis.
 * - **Bars** (`team-metric-bars`) cannot invert anything without lying about
 *   length: a bar's whole encoding is "longer = more", and rescaling it to
 *   "longer = better" would draw a quantity that does not exist. So bars keep
 *   the honest length and move the direction into *sort order* -- best team on
 *   top, always -- and say which end of the axis is good.
 * - **Scatter** (`team-metric-scatter`) applies the LINE treatment twice, once
 *   per axis, so the good corner is always the top right. Nothing about a
 *   scatter's encoding resists it -- position is not length, so reversing an
 *   axis costs nothing -- and a fixed good corner is worth more than each axis
 *   running its natural way, because otherwise a reader has to work out which
 *   of four corners is the good one on every single chart.
 *
 * DOM-free and query-free on purpose: the server renderers, the route schema,
 * the MCP tool and the query layer all import this, and a renderer must never
 * reach Supabase.
 */

/** How a metric's values are read, which drives formatting and the footnote. */
export type MetricKind = 'value' | 'rank'

export interface ChartMetric {
  /** Column on `api.team_history`. Equal to the id today; kept explicit so a
   *  future derived metric can diverge without changing the public enum. */
  column: string
  /** Axis/masthead label, sentence case. */
  label: string
  /** Noun phrase for alt text and the MCP tool description. */
  blurb: string
  /** Smaller is better -- inverts the y-axis and changes the footnote. */
  lowerIsBetter: boolean
  kind: MetricKind
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
export const METRICS = {
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
} as const satisfies Record<string, ChartMetric>

export type MetricId = keyof typeof METRICS

/**
 * Non-empty tuple for `z.enum()`, derived from the registry rather than
 * retyped, so the URL schema and the MCP tool can never list a metric the
 * renderer does not know how to draw.
 */
export const METRIC_IDS = Object.keys(METRICS) as [MetricId, ...MetricId[]]

export function isMetricId(value: string): value is MetricId {
  return Object.prototype.hasOwnProperty.call(METRICS, value)
}

/** The metric's `ChartMetric` record. Narrow with `isMetricId` first. */
export function chartMetric(id: MetricId): ChartMetric {
  return METRICS[id]
}

/**
 * Does an axis carrying this metric run backwards?
 *
 * The single predicate behind every shape's direction treatment, so "better is
 * up" and "better is right" can never disagree about the same metric.
 *
 * `kind === 'rank'` is tested even though every rank in the registry is also
 * flagged `lowerIsBetter` (and `teamMetric.test.ts` asserts that). A rank whose
 * flag was mis-set would otherwise draw rank 1 at the bottom of the plot while
 * the card's own note claimed rank 1 was best -- and of the two, the rank is
 * the fact that cannot be wrong.
 */
export function axisIsReversed(id: MetricId): boolean {
  // Read through `chartMetric` rather than indexing `METRICS` directly, for the
  // same reason `barsDirectionNote` hoists its `isRank`: on the literal-typed
  // registry, a falsy `lowerIsBetter` narrows the union to members whose `kind`
  // is `'value'`, and the compiler then rejects the second test as one that can
  // never be true. Widening to `ChartMetric` keeps the belt-and-braces check
  // the doc comment above is about.
  const metric: ChartMetric = chartMetric(id)
  return metric.lowerIsBetter || metric.kind === 'rank'
}

/**
 * The caption printed along one axis of a SCATTER card.
 *
 * This is the one place the family interpolates a metric label into prose, and
 * it is safe here precisely because it is not prose: the label leads, and the
 * reversal reason follows in its own parenthesis, so no casing or number
 * agreement has to work out ("SP+ defense rating (reversed — lower is better)"
 * rather than "lower sp+ defense rating is better").
 *
 * The reason travels WITH the axis rather than living only in the note below
 * the plot: with two axes, a note that says "an axis is reversed" leaves the
 * reader to work out which, and on a mixed pair -- offense unreversed, defense
 * reversed -- that is exactly the thing they cannot guess.
 */
export function scatterAxisLabel(id: MetricId): string {
  const metric = METRICS[id]
  if (!axisIsReversed(id)) return metric.label
  return `${metric.label} (reversed — ${metric.kind === 'rank' ? 'rank 1 is best' : 'lower is better'})`
}

/**
 * The scatter's direction note, discharging the same duty as its line and bar
 * siblings -- see the module header -- for a shape with two axes.
 *
 * It leads with the claim that is true of EVERY scatter this family draws,
 * whatever the two metrics are: the good corner is the top right. That is the
 * whole reason the axes get reversed, and it is a claim the rendered picture
 * always holds by construction, so unlike `barsDirectionNote` there is no
 * domain-shaped way for it to become false.
 *
 * The clause after the dash then says how many axes paid for it, because
 * "reversed" is a surprising thing to do to an axis and a reader who spots
 * ticks running backwards deserves to find that stated rather than assume a
 * bug. Which axis is which is named on the axis itself (`scatterAxisLabel`).
 */
export function scatterDirectionNote(x: MetricId, y: MetricId): string {
  const reversedX = axisIsReversed(x)
  const reversedY = axisIsReversed(y)

  if (reversedX && reversedY) {
    return 'Top-right is best — both axes are reversed, because a lower number is the better one on each.'
  }
  if (reversedX || reversedY) {
    const which = reversedX ? 'horizontal' : 'vertical'
    return `Top-right is best — the ${which} axis is reversed, because a lower number is the better one on it.`
  }
  return 'Top-right is best — both axes run low to high.'
}

/**
 * The one-line direction note printed under every LINE chart, immediately
 * below the axis it describes. Says out loud what the inverted axis is doing,
 * so the picture cannot be misread by someone who only glances at the shape.
 *
 * Deliberately free of the metric label: the chart's headline sits four lines
 * above this and already names the metric, and interpolating a label produces
 * either a casing bug ("lower sp+ defense rating") or a grammar one ("higher
 * wins is better").
 */
export function trendDirectionNote(id: MetricId): string {
  const metric = METRICS[id]
  if (metric.kind === 'rank') {
    return 'Rank 1 is best — the axis is inverted, so a better ranking sits higher.'
  }
  if (metric.lowerIsBetter) {
    return 'Lower is better — the axis is inverted, so stronger seasons sit higher.'
  }
  return 'Higher is better.'
}

/**
 * The same duty for a BAR chart, discharged differently -- see the module
 * header. A bar encodes value as length from a zero baseline; there is no
 * inversion available that does not either invent a quantity (`max - value`)
 * or truncate the axis. So the sentence has two jobs the line version does not
 * need: state that the rows are ranked best-first (the direction treatment),
 * and disarm the "longer must be better" reflex for a lower-is-better metric.
 *
 * Same no-metric-label rule as above, for the same grammar reasons.
 */
export function barsDirectionNote(id: MetricId, opts: { spansZero?: boolean } = {}): string {
  const metric = METRICS[id]
  // Hoisted rather than re-tested below: `metric.lowerIsBetter` narrows the
  // union to the value variant, which makes a later `kind === 'rank'` a
  // comparison the compiler knows can never be true.
  const isRank = metric.kind === 'rank'
  const lead = isRank ? 'Rank 1 is best' : metric.lowerIsBetter ? 'Lower is better' : 'Higher is better'

  // A domain that crosses zero breaks the length rule outright: bars run both
  // ways from the baseline, so length encodes MAGNITUDE, not quality. On a
  // margin chart holding Oklahoma +3.1 and Purdue -24.6, the longest bar is
  // the worst team -- "the longest bar is the strongest" is then precisely
  // inverted, and it is the one sentence the picture depends on.
  //
  // So drop the length claim and keep the claim that survives: the row order.
  // Keyed off the rendered DOMAIN rather than a per-metric flag, so it stays
  // correct if a negative-capable lower-is-better metric is ever added (today
  // every rank and lowerIsBetter metric is non-negative, so only
  // higher-is-better metrics can reach this branch).
  if (opts.spansZero) {
    return `${lead} — ranked best first, so read the row order, not the bar length.`
  }

  const best = isRank || metric.lowerIsBetter ? 'shortest' : 'longest'
  return `${lead} — ranked best first, so the ${best} bar is the strongest team.`
}
