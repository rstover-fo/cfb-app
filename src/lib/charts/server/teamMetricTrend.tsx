/**
 * `team-metric-trend` -- one metric, up to four teams, a range of seasons, as
 * hand-drawn lines on an editorial card.
 *
 * One of the `team-metric-*` shapes. Everything this chart shares with the
 * others -- metric resolution, the team/season query, series ink, the value
 * domain, the card chrome, the empty state -- lives upstream:
 *
 *   ../metrics.ts        the metric enum and its direction contract
 *   ../metricScale.ts    the value domain and its tick rules
 *   ./metricCard.tsx     card rhythm, masthead, legend, empty state, ink
 *   ../../queries/teamMetric.ts   the api.team_history read
 *
 * What is left here is the geometry a LINE needs and no other shape does: the
 * season x-axis, the inverted y-axis, gap-aware segmentation, per-season
 * markers, and dated annotation rules.
 *
 * ---------------------------------------------------------------------------
 * Distinguishing series without color
 * ---------------------------------------------------------------------------
 * This renders to a PNG that is read on a phone, in a Discord thread, by
 * people with every kind of color vision. So each series carries three
 * redundant channels: ink, a dash pattern, and a marker shape.
 *
 * The three are pairwise distinct at full raster, but they do NOT degrade
 * equally. `MARKER` is 7 viewBox units, which is roughly 4 css px once Discord
 * has scaled a 700-unit card down to a phone's column width -- at that size a
 * diamond, a square and a circle are the same dot, and enlarging them is not
 * the fix (7px marks on an eleven-season line already crowd it). So the honest
 * statement is: at desktop size all three channels carry, and at phone size the
 * greyscale/CVD guarantee rests on dash plus ink. Markers are a full-size
 * refinement, not part of the floor.
 *
 * (The bars shape needs none of this: every bar sits on its own labelled row,
 * and a row label is a stronger redundant channel than any dash. That
 * asymmetry is why the dash/marker table lives here and not in metricCard.)
 *
 * The ink comes from the `--series-*` ramp rather than team brand hex. Note
 * that avoiding brand hex is a choice made here, NOT a spec §6 requirement: §6
 * sanctions team brand hex as rough ink (BumpsChart, the site's own multi-team
 * line chart, uses it) and only bans it from native SVG attributes. The reason
 * for the choice is control -- two schools with near-identical brand colors
 * would collide, and `TeamMetricSeries` carries no color anyway. See
 * `seriesInk` in ./metricCard.tsx for why the ramp and not the semantic set.
 *
 * ---------------------------------------------------------------------------
 * Direction
 * ---------------------------------------------------------------------------
 * Metrics flagged `lowerIsBetter` (SP+ defensive rating, every rank, points
 * allowed) draw on an inverted y-axis so that "up" always means "better", and
 * say so in the footnote. See ../metrics.ts for why both, and for why the bars
 * shape discharges the same duty a different way.
 *
 * resvg constraints (see ./document.tsx): SVG 1.1 static, inline attributes
 * only, every `<text>` states font-family and font-size, no dominant-baseline.
 *
 * Pure by contract: data in, SVG markup out.
 */
import type { RoughGenerator } from 'roughjs/bin/generator'
import type { Options } from 'roughjs/bin/core'
import type { TeamMetricSeries } from '@/lib/queries/teamMetric'
import { axisLabelsX, axisLabelsY, gridLinesY, type ChartLayout } from '../axes'
import { METRICS, trendDirectionNote, type MetricId } from '../metrics'
import { niceScale } from '../metricScale'
import { CHART_FONT_SIZE, CHART_WIDTH, ROUGH_SECONDARY, ROUGH_SEED, ROUGH_TERTIARY } from '../presets'
import type { ChartInk } from '../tokens'
import { ChartDocument, cardGeometry } from './document'
import {
  LEGEND_ROW_H,
  MetricEmptyCard,
  MetricLegend,
  MetricMasthead,
  MissingTeamsNote,
  PLOT_TOP_BASE,
  approxTextWidth,
  joinList,
  legendRows,
  metricSubtitle,
  partitionSeries,
  seasonRangeLabel,
  seriesInk,
  seriesStrokeWeights,
} from './metricCard'
import { RoughShape, createRoughGenerator } from './rough'

const WIDTH = CHART_WIDTH

/** Reserved above the plot for annotation labels, only when there are any. */
const ANNOTATION_BAND = 18
/**
 * Gap between an annotation's rule and its label. Named because the label's
 * width budget is measured from the same point: move one and the other has to
 * follow, or the label runs off the card.
 */
const ANNOTATION_LABEL_GAP = 5
/**
 * Plot height. Held constant while the canvas grows with the legend and the
 * annotation band, so a four-team annotated chart is not a squashed version of
 * a one-team chart -- it is a taller card. (Spec §9 Gate B: 350 is a default,
 * not a mandate; the 700 width and the gutter conventions are what bind.)
 */
const PLOT_H = 204
/** x tick labels (+18), direction note (+34), data note (+50), card pad (28). */
const BELOW_PLOT = 78

// --- Horizontal geometry ---------------------------------------------------
/** Left gutter for y tick labels -- the spec's left-gutter axis convention. */
const PLOT_LEFT = 72
/**
 * Inside the card's content box (which ends at 672) by enough that the LAST x
 * tick label -- centered on this edge -- keeps a margin instead of crowding
 * the card. The left gutter is wider because it holds the y labels.
 */
const PLOT_RIGHT = 656

/** Marker box, in viewBox units. */
const MARKER = 7
/** Below this x spacing, per-season markers become noise; see `showMarkers`. */
const MARKER_MIN_SPACING = 16

/** Marker vocabulary. Shape is the channel that survives a greyscale print. */
type SeriesMarker = 'circle' | 'square' | 'diamond' | 'triangle'

/**
 * Per-series treatment, in slot order. Ink is not listed here: slot `i` draws
 * in `seriesInk(ink, i)`, the shared categorical ramp, so the light/dark
 * palettes still come from the token mirror and the dash/marker pairing stays
 * the only thing this table has to state.
 */
const SERIES_TREATMENTS = [
  { dash: undefined, marker: 'circle' },
  { dash: '9 5', marker: 'square' },
  { dash: '2 5', marker: 'diamond' },
  { dash: '13 4 3 4', marker: 'triangle' },
] as const satisfies ReadonlyArray<{
  dash: string | undefined
  marker: SeriesMarker
}>

/** A dated event drawn as a vertical rule, e.g. a coaching change. */
export interface TrendAnnotation {
  season: number
  label: string
}

/** Every event the caller dated to one season -- one rule, one label. */
interface SeasonAnnotation {
  season: number
  labels: string[]
}

/**
 * Groups annotations by season.
 *
 * A season is a single point on the time axis, so two events dated to it have
 * one rule to draw and one label position between them: rendered per
 * annotation they land on identical coordinates and superimpose into
 * unreadable ink. Nothing upstream prevents it -- the route's schema checks
 * parseability and a count, and `2024:SEC move|2024:new OC` is an ordinary
 * thing for a model composing a chart URL to emit.
 *
 * Merged rather than rejected: a 400 reaches Discord as a broken image with no
 * explanation, and this route's contract is that a valid signature always
 * yields a legible picture. Merging is also the honest reading -- the two
 * events really do share one x.
 *
 * Map insertion order keeps the rules in the order the caller first named each
 * season, and the labels within a season in the order given, so the output
 * stays byte-deterministic.
 */
function mergeAnnotations(annotations: readonly TrendAnnotation[]): SeasonAnnotation[] {
  const bySeason = new Map<number, SeasonAnnotation>()
  for (const { season, label } of annotations) {
    const existing = bySeason.get(season)
    if (existing) existing.labels.push(label)
    else bySeason.set(season, { season, labels: [label] })
  }
  return [...bySeason.values()]
}

/**
 * An annotation's label, trimmed to the paper it has.
 *
 * The label is placed beside its rule and flips anchor across the plot's
 * midpoint, so the room it has is the distance from the rule to the near edge
 * of the card's content box -- roughly half a card. One 40-character label fits
 * that; three merged ones (the route's ceiling) do not, and would run off the
 * card. Width is estimated, not measured -- see `approxTextWidth` -- so this
 * errs toward cutting early.
 *
 * Cut with an ellipsis rather than by dropping the last event: an event the
 * caller asked for that silently never appears is a chart that answers a
 * question it was not asked, while "Venables hired, new O…" still tells the
 * reader that more happened here and that the card ran out of room.
 */
function annotationLabel(labels: string[], season: number, available: number): string {
  const size = CHART_FONT_SIZE.footnote
  const suffix = ` · ${season}`
  const joined = labels.join(', ')

  if (approxTextWidth(`${joined}${suffix}`, size) <= available) return `${joined}${suffix}`

  let cut = joined.length
  while (cut > 0 && approxTextWidth(`${joined.slice(0, cut)}…${suffix}`, size) > available) cut--
  return `${joined.slice(0, cut).trimEnd()}…${suffix}`
}

/** Everything the renderer needs. Assembled by the route from the query. */
export interface TeamMetricTrend {
  metric: MetricId
  from: number
  to: number
  /** One entry per requested team, in request order. Empty `points` = no data. */
  series: TeamMetricSeries[]
  annotations?: TrendAnnotation[]
}

function plotTopFor(seriesCount: number, annotated: boolean): number {
  return (
    PLOT_TOP_BASE + (legendRows(seriesCount) - 1) * LEGEND_ROW_H + (annotated ? ANNOTATION_BAND : 0)
  )
}

/** Canvas height for a chart with `seriesCount` drawn lines. */
export function teamMetricTrendHeight(seriesCount: number, annotated: boolean): number {
  return plotTopFor(seriesCount, annotated) + PLOT_H + BELOW_PLOT
}

/**
 * Season tick positions, thinned so labels never collide. Always includes both
 * endpoints -- the range is the first thing a reader checks.
 */
function seasonTicks(from: number, to: number): number[] {
  const span = to - from + 1
  const step = Math.max(1, Math.ceil(span / 12))
  const ticks: number[] = []
  for (let season = from; season <= to; season += step) ticks.push(season)

  const last = ticks[ticks.length - 1]
  if (last !== to) {
    // Drop the penultimate label if forcing the endpoint would crowd it.
    if (to - last <= step / 2) ticks.pop()
    ticks.push(to)
  }
  return ticks
}

// ---------------------------------------------------------------------------
// Rough helpers
// ---------------------------------------------------------------------------

function markerDrawable(
  gen: RoughGenerator,
  marker: SeriesMarker,
  x: number,
  y: number,
  options: Options,
) {
  const r = MARKER / 2
  switch (marker) {
    case 'circle':
      return gen.circle(x, y, MARKER, options)
    case 'square':
      return gen.rectangle(x - r, y - r, MARKER, MARKER, options)
    case 'diamond':
      return gen.polygon(
        [
          [x, y - r - 0.5],
          [x + r + 0.5, y],
          [x, y + r + 0.5],
          [x - r - 0.5, y],
        ],
        options,
      )
    case 'triangle':
      return gen.polygon(
        [
          [x, y - r - 1],
          [x + r + 0.5, y + r],
          [x - r - 0.5, y + r],
        ],
        options,
      )
  }
}

/**
 * Point-mark options. Deliberately below §9's series weights: these are marks
 * *on* a line, and a 2-3px wobbling outline at 7px across reads as a blob.
 */
function markerOptions(color: string): Options {
  return {
    fill: color,
    fillStyle: 'solid',
    stroke: color,
    strokeWidth: 1,
    roughness: 0.6,
    bowing: 0.3,
    seed: ROUGH_SEED,
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface TeamMetricTrendProps {
  trend: TeamMetricTrend
  ink: ChartInk
}

export function TeamMetricTrendChart({ trend, ink }: TeamMetricTrendProps) {
  const metric = METRICS[trend.metric]
  const { from, to } = trend

  const { drawn, missing } = partitionSeries(trend.series, series => series.points.length > 0)

  const annotations = (trend.annotations ?? []).filter(a => a.season >= from && a.season <= to)
  const annotated = annotations.length > 0 && drawn.length > 0

  const plotTop = plotTopFor(drawn.length, annotated)
  const plotBottom = plotTop + PLOT_H
  const height = teamMetricTrendHeight(drawn.length, annotated)
  const geo = cardGeometry(WIDTH, height)

  const gen = createRoughGenerator()

  const range = seasonRangeLabel(from, to)
  const subtitle = metricSubtitle(drawn.map(series => series.team), range, geo.contentW)

  // --- Empty state ----------------------------------------------------------
  if (drawn.length === 0) {
    const teams = joinList(trend.series.map(series => series.team))
    return (
      <MetricEmptyCard
        width={WIDTH}
        title={metric.label}
        subtitle={range}
        sentence={`No ${metric.blurb} on record for ${teams} in ${range}.`}
        ariaLabel={`No ${metric.blurb} on record for ${teams}, ${range}.`}
        ink={ink}
        generator={gen}
      />
    )
  }

  const ariaLabel =
    `${metric.label} by season for ${joinList(drawn.map(s => s.team))}, ${from} through ${to}. ` +
    trendDirectionNote(trend.metric)

  // --- Scales ---------------------------------------------------------------
  const values = drawn.flatMap(series => series.points.map(point => point.value))
  // Lines pad the domain to the data rather than anchoring at zero: this chart
  // encodes *change*, and forcing zero into an SP+ domain that lives between 8
  // and 30 would flatten a decade of real movement. Bars make the opposite
  // trade for the opposite reason -- see ../metricScale.ts.
  const scale = niceScale(Math.min(...values), Math.max(...values), {
    isRank: metric.kind === 'rank',
  })

  const spanX = to - from
  const xFor = (season: number): number =>
    spanX === 0 ? (PLOT_LEFT + PLOT_RIGHT) / 2 : PLOT_LEFT + ((season - from) / spanX) * (PLOT_RIGHT - PLOT_LEFT)

  // The one line that implements "better is always up": for a lowerIsBetter
  // metric the domain runs top-to-bottom instead of bottom-to-top.
  const yFor = (value: number): number => {
    const t = (value - scale.lo) / (scale.hi - scale.lo)
    return metric.lowerIsBetter ? plotTop + t * PLOT_H : plotBottom - t * PLOT_H
  }

  /**
   * Layout handed to `axes.tsx`. `height` is not the canvas height: the
   * helpers place x labels at `height - 15`, so the layout describes the plot
   * box plus its label gutter. `padding.bottom` matches, which keeps
   * `plotHeight()` equal to PLOT_H.
   */
  const X_LABEL_GAP = 33
  const layout: ChartLayout = {
    width: WIDTH,
    height: plotBottom + X_LABEL_GAP,
    padding: { top: plotTop, right: WIDTH - PLOT_RIGHT, bottom: X_LABEL_GAP, left: PLOT_LEFT },
  }

  const yTicks = scale.ticks.map(value => ({ pct: (yFor(value) - plotTop) / PLOT_H, val: value }))
  const xTicks = seasonTicks(from, to).map(season => ({ x: xFor(season), label: season }))

  const showMarkers = spanX === 0 || (PLOT_RIGHT - PLOT_LEFT) / spanX >= MARKER_MIN_SPACING

  const seriesWeights = seriesStrokeWeights(drawn.length)

  return (
    <ChartDocument width={WIDTH} height={height} ink={ink} ariaLabel={ariaLabel}>
      <MetricMasthead geo={geo} generator={gen} title={metric.label} subtitle={subtitle} ink={ink} />

      {/* Legend. The swatch is a miniature of the line itself -- same dash, same
          marker -- so the key matches the plot on every channel, not just color. */}
      <MetricLegend
        series={drawn}
        geo={geo}
        ink={ink}
        swatch={(x, y, color, i) => (
          <>
            <RoughShape
              generator={gen}
              strokeDasharray={SERIES_TREATMENTS[i].dash}
              drawable={gen.line(x, y, x + 24, y, {
                stroke: color,
                seed: ROUGH_SEED,
                ...ROUGH_SECONDARY,
              })}
            />
            <RoughShape
              generator={gen}
              drawable={markerDrawable(gen, SERIES_TREATMENTS[i].marker, x + 12, y, markerOptions(color))}
            />
          </>
        )}
      />

      {/* Scaffold: gridlines and tick labels, plain SVG, never rough (spec §1). */}
      {gridLinesY(yTicks, layout, ink)}
      {axisLabelsY(yTicks, metric.format, layout, ink)}
      {axisLabelsX(xTicks, layout, ink)}
      <line
        x1={PLOT_LEFT}
        y1={plotBottom}
        x2={PLOT_RIGHT}
        y2={plotBottom}
        stroke={ink.border}
        strokeWidth={1.5}
      />

      {/* Annotations, under the series so a rule never sits on top of data.
          One rule per season, however many events share it -- see
          `mergeAnnotations`. */}
      {mergeAnnotations(annotations).map(annotation => {
        const x = xFor(annotation.season)
        const flip = x > (PLOT_LEFT + PLOT_RIGHT) / 2
        const available = flip
          ? x - ANNOTATION_LABEL_GAP - geo.contentX
          : geo.contentRight - (x + ANNOTATION_LABEL_GAP)
        return (
          <g key={`annotation-${annotation.season}`}>
            <RoughShape
              generator={gen}
              strokeDasharray="4 4"
              drawable={gen.line(x, plotTop, x, plotBottom, {
                stroke: ink.textMuted,
                seed: ROUGH_SEED,
                ...ROUGH_TERTIARY,
              })}
            />
            <text
              x={flip ? x - ANNOTATION_LABEL_GAP : x + ANNOTATION_LABEL_GAP}
              y={plotTop - 7}
              textAnchor={flip ? 'end' : 'start'}
              fill={ink.textMuted}
              fontFamily={ink.fontBody}
              fontSize={CHART_FONT_SIZE.footnote}
            >
              {annotationLabel(annotation.labels, annotation.season, available)}
            </text>
          </g>
        )
      })}

      {/* Series */}
      {drawn.map((series, i) => {
        const treatment = SERIES_TREATMENTS[i]
        const color = seriesInk(ink, i)

        // Break the line wherever a season is missing: a team's FCS years, or
        // a metric that predates the model, are gaps -- joining across them
        // would draw a trend that never happened.
        const segments: Array<Array<[number, number]>> = []
        let current: Array<[number, number]> = []
        let previousSeason: number | null = null
        for (const point of series.points) {
          if (previousSeason !== null && point.season !== previousSeason + 1) {
            segments.push(current)
            current = []
          }
          current.push([xFor(point.season), yFor(point.value)])
          previousSeason = point.season
        }
        if (current.length) segments.push(current)

        return (
          <g key={`series-${series.team}`}>
            {segments.map((segment, s) =>
              segment.length > 1 ? (
                <RoughShape
                  key={`path-${s}`}
                  generator={gen}
                  strokeDasharray={treatment.dash}
                  drawable={gen.linearPath(segment, { stroke: color, seed: ROUGH_SEED, ...seriesWeights })}
                />
              ) : null,
            )}
            {segments.map((segment, s) =>
              // Markers thin out on a long range, but an isolated season would
              // otherwise vanish entirely, so a one-point segment always keeps
              // its mark (spec §9, Gate C).
              segment.map(([x, y], p) =>
                showMarkers || segment.length === 1 ? (
                  <RoughShape
                    key={`marker-${s}-${p}`}
                    generator={gen}
                    drawable={markerDrawable(gen, treatment.marker, x, y, markerOptions(color))}
                  />
                ) : null,
              ),
            )}
          </g>
        )
      })}

      {/* The direction note is a legend for the y-axis, not a footnote: on an
          inverted axis it carries the chart's entire disambiguation, and at
          Discord's mobile column width `footnote` (11) in `textMuted` collapses
          to roughly 6 effective px -- the smallest and faintest thing on a card
          whose meaning depends on it. Sized and inked one step up accordingly.
          The genuinely secondary note (teams with no data) stays a footnote. */}
      <text
        x={geo.contentX}
        y={plotBottom + 34}
        fill={ink.textSecondary}
        fontFamily={ink.fontBody}
        fontSize={CHART_FONT_SIZE.xs}
      >
        {trendDirectionNote(trend.metric)}
      </text>
      <MissingTeamsNote
        teams={missing}
        blurb={metric.blurb}
        x={geo.contentX}
        y={plotBottom + 50}
        ink={ink}
      />
    </ChartDocument>
  )
}
