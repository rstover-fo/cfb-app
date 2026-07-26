/**
 * `team-metric-trend` -- one metric, up to four teams, a range of seasons, as
 * hand-drawn lines on an editorial card.
 *
 * This is the *generative* chart primitive: where `team-playcalling` answers
 * exactly one question, this renderer covers (metric x teams x season range)
 * and is parameterized entirely by a small spec that fits in a signed query
 * string. The metric enum lives in `src/lib/charts/trendMetrics.ts`; the data
 * comes from `src/lib/queries/trend.ts`, fetched by the route, never here.
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
 * The ink comes from the `--series-*` ramp rather than team brand hex. Note
 * that avoiding brand hex is a choice made here, NOT a spec §6 requirement: §6
 * sanctions team brand hex as rough ink (BumpsChart, the site's own multi-team
 * line chart, uses it) and only bans it from native SVG attributes. The reason
 * for the choice is control -- two schools with near-identical brand colors
 * would collide, and `TeamTrendSeries` carries no color anyway.
 *
 * The ramp is dedicated rather than borrowed from the `--color-*` semantic set,
 * for two reasons that the design gate treated as blocking:
 *
 *   - Semantics. `--color-positive` means *good* app-wide, so handing it to
 *     whoever placed third in the request order makes the chart assert a
 *     judgement it does not hold -- on a four-team rank chart it drew the worst
 *     team on the card in "positive" green. §6 bans exactly that.
 *   - Contrast. The semantic set is theme-invariant, and several members fail
 *     WCAG 1.4.11's 3:1 for non-text against the dark card #252019:
 *     `--color-pass` #5C5A7A managed 2.46:1, `--color-neutral` 2.74:1,
 *     `--color-positive` 3.26:1. A 2px hand-drawn line is not a large filled
 *     bar; series 2 visibly receded in dark mode, inventing a
 *     primary/secondary reading between teams this chart asserts are peers.
 *     Discord defaults to dark, so that was the common path. There are not
 *     enough valence-free semantic tokens that also clear dark contrast, so
 *     re-shuffling the slots could not have fixed it.
 *
 * `--series-1` .. `--series-4` are per-mode, and every one of the eight values
 * clears 3:1 against BOTH #FFFFFF and #252019 (worst case 3.26:1). See
 * globals.css for the values and the reasoning.
 *
 * ---------------------------------------------------------------------------
 * Direction
 * ---------------------------------------------------------------------------
 * Metrics flagged `lowerIsBetter` (SP+ defensive rating, every rank, points
 * allowed) draw on an inverted y-axis so that "up" always means "better", and
 * say so in the footnote. See trendMetrics.ts for why both.
 *
 * resvg constraints (see ./document.tsx): SVG 1.1 static, inline attributes
 * only, every `<text>` states font-family and font-size, no dominant-baseline.
 *
 * Pure by contract: data in, SVG markup out.
 */
import type { RoughGenerator } from 'roughjs/bin/generator'
import type { Options } from 'roughjs/bin/core'
import type { TeamTrendSeries } from '@/lib/queries/trend'
import { axisLabelsX, axisLabelsY, gridLinesY, type ChartLayout } from '../axes'
import {
  CHART_FONT_SIZE,
  CHART_WIDTH,
  ROUGH_PRIMARY,
  ROUGH_SECONDARY,
  ROUGH_SEED,
  ROUGH_TERTIARY,
} from '../presets'
import type { ChartInk } from '../tokens'
import { TREND_METRICS, trendDirectionNote, type TrendMetricId } from '../trendMetrics'
import { ChartDocument, cardGeometry } from './document'
import { RoughShape, createRoughGenerator } from './rough'

const WIDTH = CHART_WIDTH

// --- Vertical rhythm (baselines, not box tops) -----------------------------
const TITLE_BASELINE = 44
const SUBTITLE_BASELINE = 63
const RULE_Y = 76
const LEGEND_BASELINE = 95
/** One legend row per two series; the second row pushes everything below it. */
const LEGEND_ROW_H = 17
/** Reserved above the plot for annotation labels, only when there are any. */
const ANNOTATION_BAND = 18
const PLOT_TOP_BASE = 118
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

const TITLE_SIZE = 19
const LEGEND_SIZE = 12
/** Marker box, in viewBox units. */
const MARKER = 7
/** Below this x spacing, per-season markers become noise; see `showMarkers`. */
const MARKER_MIN_SPACING = 16
/** Target y tick count before nice-rounding. */
const Y_TICK_TARGET = 5

/** Marker vocabulary. Shape is the channel that survives a greyscale print. */
type SeriesMarker = 'circle' | 'square' | 'diamond' | 'triangle'

/**
 * Per-series treatment, in slot order. Ink is not listed here: slot `i` draws
 * in `ink.series[i]`, the categorical ramp, so the light/dark palettes still
 * come from the token mirror and the dash/marker pairing stays the only thing
 * this table has to state.
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

/** Everything the renderer needs. Assembled by the route from the query. */
export interface TeamMetricTrend {
  metric: TrendMetricId
  from: number
  to: number
  /** One entry per requested team, in request order. Empty `points` = no data. */
  series: TeamTrendSeries[]
  annotations?: TrendAnnotation[]
}

function legendRows(seriesCount: number): number {
  return seriesCount > 2 ? 2 : 1
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
 * Canvas height when there is nothing to draw: masthead plus one sentence,
 * matching `EmptyCard`'s 200 rather than reserving a plot's worth of blank
 * paper for data that does not exist.
 */
export const TREND_EMPTY_HEIGHT = PLOT_TOP_BASE + 84

// ---------------------------------------------------------------------------
// Scales
// ---------------------------------------------------------------------------

/** Rounds away float accumulation so tick labels and snapshots stay stable. */
function tidy(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

/** Classic "nice number" rounding (Heckbert): 1, 2, 5 or 10 x a power of ten. */
function niceNum(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range))
  const fraction = range / 10 ** exponent
  let nice: number
  if (round) nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10
  else nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return nice * 10 ** exponent
}

interface YScale {
  lo: number
  hi: number
  ticks: number[]
}

function niceScale(min: number, max: number, isRank: boolean): YScale {
  // A flat series (one season, or an unchanged value) has no range to divide;
  // give it a symmetric window so the line lands mid-plot instead of on an
  // edge or on a division by zero.
  if (!(max > min)) {
    const pad = Math.abs(max) * 0.1 || 1
    min -= pad
    max += pad
  }

  const step = niceNum((max - min) / (Y_TICK_TARGET - 1), true)
  let lo = tidy(Math.floor(min / step) * step)
  let hi = tidy(Math.ceil(max / step) * step)

  // Nice-rounding widens the domain but never *pads* it: when the extreme is
  // already a nice number -- the normal case for an integer metric like wins,
  // and for every rank -- floor/ceil are identities and the domain edge lands
  // exactly on the data. The marker there is then centred on plotTop or
  // plotBottom and the 1.5px frame rule cuts it in half. So give a
  // coincident extreme one step of air, which is TrajectoryChart's
  // `valuePadding = valueRange * 0.1` arriving by the nice-number route
  // instead of a percentage (a percentage would knock the ticks off their
  // round values, which is the whole point of nice-rounding).
  if (min === lo) lo = tidy(lo - step)
  if (max === hi) hi = tidy(hi + step)

  const ticks: number[] = []
  // Rank 0 does not exist, so a rank axis starts at 1 and keeps the rounded
  // grid above it (1, 10, 20, 30 rather than a bogus 0).
  if (isRank && lo < 1) {
    lo = 1
    ticks.push(1)
    for (let value = step; value <= hi + step / 1e6; value += step) ticks.push(tidy(value))
  } else {
    // The padding above is unconditional, which is right for the plot box --
    // it is what keeps a marker off the frame rule. It is wrong for the tick
    // LABELS when the metric cannot go negative: an undefeated season (0
    // losses) or a winless one would otherwise put "-5" on a wins axis.
    //
    // So pad the domain but floor the labels at zero. The two are allowed to
    // disagree: `lo` still sits a step below, so the 0-value marker keeps its
    // air, while the axis stops saying something impossible. Clamping `lo`
    // itself instead would reinstate exactly the bisection the padding fixes.
    //
    // Detected from the DATA (`min >= 0`), not from a per-metric floor flag:
    // every metric here is non-negative in practice, and a real negative
    // value (were one ever added) would keep its negative ticks correctly.
    const tickStart = min >= 0 && lo < 0 ? 0 : lo
    for (let value = tickStart; value <= hi + step / 1e6; value += step) ticks.push(tidy(value))
  }

  return { lo, hi, ticks }
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
// Text measurement
// ---------------------------------------------------------------------------

/**
 * Rough advance-width estimate. resvg does the real shaping and there is no
 * text metrics API on this side, so layout decisions that depend on width
 * (does the subtitle fit?) use a deliberately generous per-character average
 * for the vendored faces and degrade gracefully when wrong.
 */
function approxTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.56
}

/** "a", "a and b", "a, b and c". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
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
  const metric = TREND_METRICS[trend.metric]
  const { from, to } = trend

  const drawn = trend.series.filter(series => series.points.length > 0).slice(0, SERIES_TREATMENTS.length)
  const missing = trend.series.filter(series => series.points.length === 0).map(series => series.team)

  const annotations = (trend.annotations ?? []).filter(a => a.season >= from && a.season <= to)
  const annotated = annotations.length > 0 && drawn.length > 0

  const plotTop = plotTopFor(drawn.length, annotated)
  const plotBottom = plotTop + PLOT_H
  const height = teamMetricTrendHeight(drawn.length, annotated)
  const geo = cardGeometry(WIDTH, height)

  const gen = createRoughGenerator()

  const range = from === to ? `${from}` : `${from}–${to}`
  const teamList = drawn.map(series => series.team).join('  ·  ')
  const teamsAndRange = `${teamList}  ·  ${range}`
  const subtitle =
    drawn.length === 0
      ? range
      : approxTextWidth(teamsAndRange, CHART_FONT_SIZE.xs) <= geo.contentW
        ? teamsAndRange
        : `${drawn.length} teams  ·  ${range}`

  const ariaLabel =
    drawn.length === 0
      ? `No ${metric.blurb} on record for ${joinList(trend.series.map(s => s.team))}, ${range}.`
      : `${metric.label} by season for ${joinList(drawn.map(s => s.team))}, ${from} through ${to}. ${trendDirectionNote(trend.metric)}`

  // --- Masthead, shared by the drawn and empty variants ---------------------
  const masthead = (
    <>
      <text
        x={geo.contentX}
        y={TITLE_BASELINE}
        fill={ink.textPrimary}
        fontFamily={ink.fontHeadline}
        fontSize={TITLE_SIZE}
      >
        {metric.label}
      </text>
      <text
        x={geo.contentX}
        y={SUBTITLE_BASELINE}
        fill={ink.textMuted}
        fontFamily={ink.fontBody}
        fontSize={CHART_FONT_SIZE.xs}
      >
        {subtitle}
      </text>
      <RoughShape
        generator={gen}
        drawable={gen.line(geo.contentX, RULE_Y, geo.contentRight, RULE_Y, {
          stroke: ink.border,
          seed: ROUGH_SEED,
          ...ROUGH_TERTIARY,
        })}
      />
    </>
  )

  // --- Empty state ----------------------------------------------------------
  // The route normally catches this and serves the empty card, but a spec with
  // no drawable series must never reach the scale math -- and an axes-only
  // chart with an unexplained blank plot is worse than a sentence.
  if (drawn.length === 0) {
    return (
      <ChartDocument width={WIDTH} height={TREND_EMPTY_HEIGHT} ink={ink} ariaLabel={ariaLabel}>
        {masthead}
        <text
          x={WIDTH / 2}
          y={PLOT_TOP_BASE + 30}
          textAnchor="middle"
          fill={ink.textMuted}
          fontFamily={ink.fontBody}
          fontSize={CHART_FONT_SIZE.sm}
        >
          {`No ${metric.blurb} on record for ${joinList(trend.series.map(s => s.team))} in ${range}.`}
        </text>
      </ChartDocument>
    )
  }

  // --- Scales ---------------------------------------------------------------
  const values = drawn.flatMap(series => series.points.map(point => point.value))
  const scale = niceScale(Math.min(...values), Math.max(...values), metric.kind === 'rank')

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

  // Peer series carry equal weight: §9's primary/secondary hierarchy encodes
  // rank, and no team here outranks another. So every drawn line gets the
  // house primary 3px -- including both lines of a two-team comparison, which
  // is this primitive's reference case and the chart it emits most often.
  //
  // The drop to secondary applies to the 3-4 series case ONLY. That is a
  // density escape hatch, not a demotion: four 3px hand-drawn lines with
  // roughness 1.0 on a 700px canvas overlap into a single band through the
  // crowded middle of the plot, and an unreadable chart is worse than a
  // slightly lighter one. §9 Gate C explicitly does not extend that hatch to
  // charts with a handful of series, and at n<=2 there is no collision to
  // trade against -- dropping there would have drawn a peer in the same weight
  // TrajectoryChart reserves for its conference-average *context* line.
  const seriesWeights = drawn.length <= 2 ? ROUGH_PRIMARY : ROUGH_SECONDARY

  return (
    <ChartDocument width={WIDTH} height={height} ink={ink} ariaLabel={ariaLabel}>
      {masthead}

      {/* Legend. In-SVG because a PNG has no HTML legend to defer to (spec §4
          retires in-SVG legends only where an HTML one is available). Two
          columns so a long school name can never run past the card. */}
      {drawn.map((series, i) => {
        const treatment = SERIES_TREATMENTS[i]
        const color = ink.series[i]
        const col = i % 2
        const row = Math.floor(i / 2)
        const x = geo.contentX + col * (geo.contentW / 2)
        const y = LEGEND_BASELINE + row * LEGEND_ROW_H
        const swatchY = y - 4
        return (
          <g key={`legend-${series.team}`}>
            <RoughShape
              generator={gen}
              strokeDasharray={treatment.dash}
              drawable={gen.line(x, swatchY, x + 24, swatchY, {
                stroke: color,
                seed: ROUGH_SEED,
                ...ROUGH_SECONDARY,
              })}
            />
            <RoughShape
              generator={gen}
              drawable={markerDrawable(gen, treatment.marker, x + 12, swatchY, markerOptions(color))}
            />
            <text
              x={x + 32}
              y={y}
              fill={ink.textSecondary}
              fontFamily={ink.fontBody}
              fontSize={LEGEND_SIZE}
            >
              {series.team}
            </text>
          </g>
        )
      })}

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

      {/* Annotations, under the series so a rule never sits on top of data. */}
      {annotations.map(annotation => {
        const x = xFor(annotation.season)
        const flip = x > (PLOT_LEFT + PLOT_RIGHT) / 2
        return (
          <g key={`annotation-${annotation.season}-${annotation.label}`}>
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
              x={flip ? x - 5 : x + 5}
              y={plotTop - 7}
              textAnchor={flip ? 'end' : 'start'}
              fill={ink.textMuted}
              fontFamily={ink.fontBody}
              fontSize={CHART_FONT_SIZE.footnote}
            >
              {`${annotation.label} · ${annotation.season}`}
            </text>
          </g>
        )
      })}

      {/* Series */}
      {drawn.map((series, i) => {
        const treatment = SERIES_TREATMENTS[i]
        const color = ink.series[i]

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
      {missing.length > 0 && (
        <text
          x={geo.contentX}
          y={plotBottom + 50}
          fill={ink.textMuted}
          fontFamily={ink.fontBody}
          fontSize={CHART_FONT_SIZE.footnote}
        >
          {`No ${metric.blurb} on record for ${joinList(missing)}.`}
        </text>
      )}
    </ChartDocument>
  )
}

/** Exported for tests and for the y-axis assertions in the route's fixtures. */
export const __internals = { niceScale, seasonTicks }
