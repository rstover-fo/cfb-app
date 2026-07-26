/**
 * `team-metric-bars` -- one metric, one season, up to four teams, as ranked
 * hand-drawn horizontal bars on an editorial card.
 *
 * The second `team-metric-*` shape. It shares everything upstream of the
 * picture with `team-metric-trend`:
 *
 *   ../metrics.ts        the metric enum and its direction contract
 *   ../metricScale.ts    the value domain and its tick rules
 *   ./metricCard.tsx     card rhythm, masthead, empty state, series ink
 *   ../../queries/teamMetric.ts   the api.team_history read
 *
 * and differs only in geometry, which is the whole point of the split.
 *
 * ---------------------------------------------------------------------------
 * Why bars, and not a one-season trend
 * ---------------------------------------------------------------------------
 * A line across a single season is a dot. "Compare 2025 SP+ defense across four
 * teams" is a *ranking* question, and a ranking reads off length and vertical
 * order far faster than off four points sharing one x. Same metric registry,
 * same teams, same ink -- `season` where the trend takes `from`/`to`.
 *
 * ---------------------------------------------------------------------------
 * Direction, done the bar way
 * ---------------------------------------------------------------------------
 * The trend chart inverts its y-axis so "up" always means "better". A bar
 * cannot borrow that. Its entire encoding is length from a baseline, so:
 *
 *   - rescaling to `max - value` would invent a quantity that is not the
 *     metric, and label it with the metric's units;
 *   - moving the baseline off zero to compress the "bad" end would corrupt the
 *     ratio between two bars, which is the one thing a bar chart promises.
 *
 * So the bars stay honest about length -- a rank-34 team really does get a
 * longer bar than a rank-2 team -- and direction moves into the two channels a
 * bar chart does own:
 *
 *   1. **Sort order.** Rows are ranked best-first, always, whichever way the
 *      metric runs. Vertical position is the "better is up" the trend gets from
 *      its axis, and it works without touching the length encoding.
 *   2. **The direction note**, one step up in size and ink from a footnote (as
 *      on the trend card, and for the same reason: it is the sentence the whole
 *      picture depends on). It names which end is good AND which bar length is
 *      good, so "shortest bar wins" is stated rather than inferred --
 *      `barsDirectionNote` in ../metrics.ts.
 *
 * Direct value labels sit at every bar end, so the reader never has to
 * estimate a length against the grid to recover the number.
 *
 * ---------------------------------------------------------------------------
 * Redundant channels
 * ---------------------------------------------------------------------------
 * The trend chart works hard at dashes and marker shapes because its lines
 * overlap and colour is otherwise the only way to tell them apart. Bars have no
 * such problem: every bar owns a row, and every row is captioned with its team
 * name. The name is a stronger non-colour channel than any dash. What the ±41°
 * `pairedBarOptions` lean adds here is texture separation between vertically
 * adjacent bars, which is a legibility nicety rather than a colour fallback.
 *
 * resvg constraints (see ./document.tsx): SVG 1.1 static, inline attributes
 * only, every `<text>` states font-family and font-size, no dominant-baseline.
 *
 * Pure by contract: data in, SVG markup out.
 */
import type { TeamMetricValue } from '@/lib/queries/teamMetric'
import { axisLabelsX, gridLinesX, type ChartLayout } from '../axes'
import { METRICS, barsDirectionNote, type MetricId } from '../metrics'
import { niceScale } from '../metricScale'
import {
  CHART_FONT_SIZE,
  CHART_WIDTH,
  ROUGH_SEED,
  centerDy,
  pairedBarOptions,
} from '../presets'
import type { ChartInk } from '../tokens'
import { ChartDocument, cardGeometry } from './document'
import {
  MetricEmptyCard,
  MetricMasthead,
  MissingTeamsNote,
  PLOT_TOP_BASE,
  joinList,
  metricSubtitle,
  partitionSeries,
  seriesInk,
} from './metricCard'
import { RoughShape, createRoughGenerator } from './rough'

const WIDTH = CHART_WIDTH

// --- Vertical geometry -----------------------------------------------------
/**
 * Top of the first row. Above the trend's `PLOT_TOP_BASE` because bars carry no
 * legend: each row is captioned with its own team name, so a key repeating
 * those four names two-up would be redundant chrome on a card that has room to
 * spare. The masthead rhythm above this is shared and unchanged.
 */
const ROWS_TOP = PLOT_TOP_BASE - 22
/** Row pitch. Generous: 1-4 rows on a 700px canvas can afford the air. */
const ROW_HEIGHT = 46
const BAR_HEIGHT = 22
/** x tick labels (+18), direction note (+42), data note (+58), card pad (28). */
const BELOW_ROWS = 86

// --- Horizontal geometry ---------------------------------------------------
/**
 * Gutter for team names, right-aligned against the plot -- the same
 * label-left/plot-right arrangement `teamPlaycalling` uses, at the same
 * `CHART_FONT_SIZE.xs`.
 */
const LABEL_W = 132
const PLOT_LEFT = 28 + LABEL_W + 14
/**
 * Space reserved beyond the plot for the direct value labels. Keeping them
 * outside the plot rather than inside the bar end is what lets the value scale
 * run to the last gridline without a label ever colliding with the frame -- and
 * it means a very short bar's label is legible instead of overhanging a 6px
 * stub.
 */
const VALUE_GUTTER = 54
const PLOT_RIGHT = 672 - VALUE_GUTTER

/** Everything the renderer needs. Assembled by the route from the query. */
export interface TeamMetricBars {
  metric: MetricId
  season: number
  /** One entry per requested team, in request order. `null` value = no data. */
  series: TeamMetricValue[]
}

/** Canvas height for a chart with `rowCount` drawn bars. */
export function teamMetricBarsHeight(rowCount: number): number {
  return ROWS_TOP + rowCount * ROW_HEIGHT + BELOW_ROWS
}

/** A team with a value the view actually published. */
type DrawnBar = TeamMetricValue & { value: number }

export interface TeamMetricBarsProps {
  bars: TeamMetricBars
  ink: ChartInk
}

export function TeamMetricBarsChart({ bars, ink }: TeamMetricBarsProps) {
  const metric = METRICS[bars.metric]
  const season = String(bars.season)

  const { drawn, missing } = partitionSeries(bars.series, entry => entry.value !== null)

  const gen = createRoughGenerator()

  // --- Empty state ----------------------------------------------------------
  if (drawn.length === 0) {
    const teams = joinList(bars.series.map(entry => entry.team))
    return (
      <MetricEmptyCard
        width={WIDTH}
        title={metric.label}
        subtitle={season}
        sentence={`No ${metric.blurb} on record for ${teams} in ${season}.`}
        ariaLabel={`No ${metric.blurb} on record for ${teams}, ${season}.`}
        ink={ink}
        generator={gen}
      />
    )
  }

  // Slot order is request order, and it survives the sort: `seriesInk` keys off
  // it so a team's colour is its identity, not its placing (see ./metricCard).
  const ranked: Array<DrawnBar & { slot: number }> = (drawn as DrawnBar[])
    .map((entry, slot) => ({ ...entry, slot }))
    // Best first, whichever way the metric runs. This is the bar chart's
    // "better is up" -- see the module header.
    .sort((a, b) => (metric.lowerIsBetter ? a.value - b.value : b.value - a.value))

  const height = teamMetricBarsHeight(ranked.length)
  const geo = cardGeometry(WIDTH, height)
  const rowsBottom = ROWS_TOP + ranked.length * ROW_HEIGHT

  const values = ranked.map(entry => entry.value)
  // Zero-anchored, unlike the trend's data-padded domain: a bar's length is
  // read as a magnitude and compared against its neighbours, so a truncated
  // axis would misstate the ratio between two teams. See ../metricScale.ts.
  const scale = niceScale(Math.min(...values), Math.max(...values), {
    isRank: metric.kind === 'rank',
    anchorZero: true,
  })

  const xFor = (value: number): number =>
    PLOT_LEFT + ((value - scale.lo) / (scale.hi - scale.lo)) * (PLOT_RIGHT - PLOT_LEFT)
  const baselineX = xFor(0)

  /**
   * Layout handed to `axes.tsx`. As on the trend card, `height` is the plot box
   * plus its label gutter rather than the canvas height -- `axisLabelsX` places
   * labels at `height - 15`.
   */
  const X_LABEL_GAP = 33
  const layout: ChartLayout = {
    width: WIDTH,
    height: rowsBottom + X_LABEL_GAP,
    padding: { top: ROWS_TOP, right: WIDTH - PLOT_RIGHT, bottom: X_LABEL_GAP, left: PLOT_LEFT },
  }
  const xTicks = scale.ticks.map(value => ({ x: xFor(value), label: metric.format(value) }))

  const ariaLabel =
    `${metric.label} in ${season} for ${joinList(ranked.map(entry => entry.team))}, ` +
    `ranked best first. ${barsDirectionNote(bars.metric)}`

  return (
    <ChartDocument width={WIDTH} height={height} ink={ink} ariaLabel={ariaLabel}>
      <MetricMasthead
        geo={geo}
        generator={gen}
        title={metric.label}
        subtitle={metricSubtitle(ranked.map(entry => entry.team), season, geo.contentW)}
        ink={ink}
      />

      {/* Alternating row bands. Static token fills on scaffold elements stay
          legal (spec §6); only data marks must be rough-drawn. */}
      {ranked.map((entry, i) =>
        i % 2 === 1 ? (
          <rect
            key={`band-${entry.team}`}
            x={geo.contentX}
            y={ROWS_TOP + i * ROW_HEIGHT}
            width={geo.contentW}
            height={ROW_HEIGHT}
            fill={ink.bgSurfaceAlt}
            opacity={0.55}
          />
        ) : null,
      )}

      {/* Scaffold: gridlines and tick labels, plain SVG, never rough (spec §1). */}
      {gridLinesX(xTicks, layout, ink)}
      {axisLabelsX(xTicks, layout, ink)}

      {/* The zero baseline every bar is measured from, plus the value axis
          under the rows -- the same 1.5px frame the trend card closes its plot
          with, so the two shapes read as the same publication. Solid, not
          rough: this is the axis, and a wobbling origin would undercut the one
          line on the card the reader has to trust. */}
      <line
        x1={baselineX}
        y1={ROWS_TOP - 6}
        x2={baselineX}
        y2={rowsBottom}
        stroke={ink.border}
        strokeWidth={1.5}
      />
      <line
        x1={PLOT_LEFT}
        y1={rowsBottom}
        x2={PLOT_RIGHT}
        y2={rowsBottom}
        stroke={ink.border}
        strokeWidth={1.5}
      />

      {/* Bars */}
      {ranked.map((entry, i) => {
        const y = ROWS_TOP + i * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2
        const end = xFor(entry.value)
        const x = Math.min(baselineX, end)
        const width = Math.abs(end - baselineX)
        // A value of exactly zero has no rectangle to draw; the direct label at
        // the baseline is what reports it.
        if (width < 0.5) return null
        return (
          <RoughShape
            key={`bar-${entry.team}`}
            generator={gen}
            // ±41° per spec §10, alternating down the card so vertically
            // adjacent bars lean apart. Texture separation, not a colour
            // fallback -- the row label is that (see the module header).
            drawable={gen.rectangle(
              x,
              y,
              width,
              BAR_HEIGHT,
              pairedBarOptions(seriesInk(ink, entry.slot), i % 2 === 0 ? 'left' : 'right', ROUGH_SEED),
            )}
          />
        )
      })}

      {/* Row labels and direct value labels */}
      {ranked.map((entry, i) => {
        const midY = ROWS_TOP + i * ROW_HEIGHT + ROW_HEIGHT / 2
        const end = xFor(entry.value)
        const pointsLeft = end < baselineX
        return (
          <g key={`labels-${entry.team}`}>
            <text
              x={geo.contentX + LABEL_W}
              y={midY + centerDy(CHART_FONT_SIZE.xs)}
              textAnchor="end"
              fill={ink.textSecondary}
              fontFamily={ink.fontBody}
              fontSize={CHART_FONT_SIZE.xs}
            >
              {entry.team}
            </text>
            <text
              x={pointsLeft ? end - 8 : end + 8}
              y={midY + centerDy(CHART_FONT_SIZE.xs)}
              textAnchor={pointsLeft ? 'end' : 'start'}
              fill={ink.textPrimary}
              fontFamily={ink.fontBody}
              fontSize={CHART_FONT_SIZE.xs}
            >
              {metric.format(entry.value)}
            </text>
          </g>
        )
      })}

      {/* Sized and inked one step above a footnote for the same reason as the
          trend card's: at Discord's mobile column width `footnote` (11) in
          `textMuted` collapses to roughly 6 effective px, and this sentence is
          what stops a long bar being read as a good one. */}
      <text
        x={geo.contentX}
        y={rowsBottom + 42}
        fill={ink.textSecondary}
        fontFamily={ink.fontBody}
        fontSize={CHART_FONT_SIZE.xs}
      >
        {barsDirectionNote(bars.metric)}
      </text>
      <MissingTeamsNote
        teams={missing}
        blurb={metric.blurb}
        x={geo.contentX}
        y={rowsBottom + 58}
        ink={ink}
      />
    </ChartDocument>
  )
}
