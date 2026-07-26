/**
 * The editorial card every `team-metric-*` shape is drawn on.
 *
 * ---------------------------------------------------------------------------
 * What belongs here, and what deliberately does not
 * ---------------------------------------------------------------------------
 * The `team-metric-*` family is combinatorial along its DATA axes (15 metrics
 * x 1-4 teams x seasons) and fixed along its shape. Adding a shape must
 * therefore cost a renderer's worth of *geometry* and nothing else -- if a
 * second shape had to restate the masthead rhythm, the series-ink rule, the
 * §9 stroke tier, the missing-team sentence and the empty state, the family
 * would be three charts that merely rhyme.
 *
 * So this module owns everything downstream of "which metric, which teams":
 * the card rhythm, the masthead, the legend frame, series ink assignment, the
 * stroke-tier ruling, the empty state, and the sentences a chart says about
 * teams it could not draw.
 *
 * It owns none of the geometry. There is no `orientation` prop, no
 * `drawMark()` callback, no shared "plot area" abstraction -- a line's y-axis
 * inversion and a bar's zero baseline are different ideas that happen to
 * occupy the same rectangle, and parameterizing them into one function
 * produces something no reviewer can read. Shapes import these pieces and lay
 * themselves out.
 *
 * resvg constraints (see ./document.tsx): SVG 1.1 static, inline attributes
 * only, every `<text>` states font-family and font-size, no dominant-baseline.
 */
import type { ReactNode } from 'react'
import type { RoughGenerator } from 'roughjs/bin/generator'
import { CHART_FONT_SIZE, ROUGH_PRIMARY, ROUGH_SECONDARY, ROUGH_SEED, ROUGH_TERTIARY } from '../presets'
import type { ChartInk } from '../tokens'
import { ChartDocument, cardGeometry } from './document'
import { RoughShape } from './rough'

/** Geometry of the card and its content box, as `cardGeometry` returns it. */
export type CardGeometry = ReturnType<typeof cardGeometry>

// ---------------------------------------------------------------------------
// Vertical rhythm (baselines, not box tops -- resvg positions text by baseline
// and we never rely on inherited line boxes)
// ---------------------------------------------------------------------------

export const TITLE_BASELINE = 44
export const SUBTITLE_BASELINE = 63
export const RULE_Y = 76
export const TITLE_SIZE = 19

/** First legend row's baseline. Shapes without a legend start their plot above this. */
export const LEGEND_BASELINE = 95
/** One legend row per two series; the second row pushes everything below it. */
export const LEGEND_ROW_H = 17
export const LEGEND_SIZE = 12

/** Top of the plot for a one-legend-row chart with nothing above the plot. */
export const PLOT_TOP_BASE = 118

/**
 * Canvas height when there is nothing to draw: masthead plus one sentence,
 * matching `EmptyCard`'s 200 rather than reserving a plot's worth of blank
 * paper for data that does not exist. Shared so every shape's empty card is
 * the same object, whatever its populated card would have been.
 */
export const METRIC_EMPTY_HEIGHT = PLOT_TOP_BASE + 84

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * Rough advance-width estimate. resvg does the real shaping and there is no
 * text metrics API on this side, so layout decisions that depend on width
 * (does the subtitle fit?) use a deliberately generous per-character average
 * for the vendored faces and degrade gracefully when wrong.
 */
export function approxTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.56
}

/** "a", "a and b", "a, b and c". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** "2015–2025", or just "2025" when a shape covers a single season. */
export function seasonRangeLabel(from: number, to: number): string {
  return from === to ? `${from}` : `${from}–${to}`
}

/**
 * The masthead's second line: the teams and the seasons, collapsed to a count
 * when the full list would run past the card. Estimated, not measured -- see
 * `approxTextWidth` -- so it errs toward collapsing early.
 */
export function metricSubtitle(teams: string[], range: string, contentW: number): string {
  if (teams.length === 0) return range
  const full = `${teams.join('  ·  ')}  ·  ${range}`
  if (approxTextWidth(full, CHART_FONT_SIZE.xs) <= contentW) return full
  return `${teams.length} teams  ·  ${range}`
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

/** How many series a card can distinguish -- the `--series-*` ramp's width. */
export const MAX_DRAWN_SERIES = 4

/**
 * Splits requested series into the ones that can be drawn and the names of the
 * ones that cannot.
 *
 * A team the view has nothing for keeps its identity all the way to the
 * footnote: silently dropping it would leave the reader believing the chart
 * answered their question. Generic over the series shape because a line
 * carries points and a bar carries one value, and the only field this cares
 * about is the name.
 */
export function partitionSeries<T extends { team: string }>(
  all: readonly T[],
  hasData: (entry: T) => boolean,
): { drawn: T[]; missing: string[] } {
  return {
    drawn: all.filter(hasData).slice(0, MAX_DRAWN_SERIES),
    missing: all.filter(entry => !hasData(entry)).map(entry => entry.team),
  }
}

/**
 * Ink for slot `i`: the categorical `--series-*` ramp, indexed by the order the
 * caller named the teams.
 *
 * Two rulings are baked in here rather than restated per shape.
 *
 * **The ramp, not the semantic set.** `--color-positive` means *good*
 * app-wide, so handing it to whoever placed third in the request order makes a
 * chart assert a judgement it does not hold -- on a four-team rank chart it
 * drew the worst team on the card in "positive" green. Spec §6 bans exactly
 * that. The semantic set also fails WCAG 1.4.11's 3:1 for non-text against the
 * dark card #252019 in several members (`--color-pass` 2.46:1,
 * `--color-neutral` 2.74:1), and Discord defaults to dark. Every one of the
 * eight `--series-*` values clears 3:1 against BOTH #FFFFFF and #252019.
 *
 * **Request order, not rank order.** Colour encodes *identity* here, so a team
 * keeps its ink between a trend and a bars chart of the same request. Bars
 * additionally sort their rows, and letting ink follow the sort would make
 * colour a second, redundant encoding of rank -- and would put the same team
 * in a different colour depending on who else was asked about.
 */
export function seriesInk(ink: ChartInk, slot: number): string {
  return ink.series[slot % ink.series.length]
}

/**
 * Rough weights for a card carrying `count` peer series (spec §9).
 *
 * Peers carry equal weight: §9's primary/secondary hierarchy encodes rank, and
 * no team here outranks another. So every drawn mark gets the house primary --
 * including both sides of a two-team comparison, which is this family's
 * reference case and the chart it emits most often.
 *
 * The drop to secondary applies to the 3-4 series case ONLY. That is a density
 * escape hatch, not a demotion: four 3px hand-drawn strokes with roughness 1.0
 * on a 700px canvas overlap into a single band through the crowded middle of a
 * plot, and an unreadable chart is worse than a slightly lighter one. §9 Gate C
 * explicitly does not extend that hatch to charts with a handful of series, and
 * at n<=2 there is no collision to trade against -- dropping there would draw a
 * peer in the weight TrajectoryChart reserves for its conference-average
 * *context* line.
 */
export function seriesStrokeWeights(count: number): typeof ROUGH_PRIMARY | typeof ROUGH_SECONDARY {
  return count <= 2 ? ROUGH_PRIMARY : ROUGH_SECONDARY
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

interface MetricMastheadProps {
  geo: CardGeometry
  generator: RoughGenerator
  title: string
  subtitle: string
  ink: ChartInk
}

/** Headline, subtitle, and the hand-drawn rule under them. */
export function MetricMasthead({ geo, generator, title, subtitle, ink }: MetricMastheadProps): ReactNode {
  return (
    <>
      <text
        x={geo.contentX}
        y={TITLE_BASELINE}
        fill={ink.textPrimary}
        fontFamily={ink.fontHeadline}
        fontSize={TITLE_SIZE}
      >
        {title}
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
        generator={generator}
        drawable={generator.line(geo.contentX, RULE_Y, geo.contentRight, RULE_Y, {
          stroke: ink.border,
          seed: ROUGH_SEED,
          ...ROUGH_TERTIARY,
        })}
      />
    </>
  )
}

/** Legend rows for `count` series -- two-up, so a long school name never runs past the card. */
export function legendRows(count: number): number {
  return count > 2 ? 2 : 1
}

interface MetricLegendProps<T extends { team: string }> {
  series: readonly T[]
  geo: CardGeometry
  ink: ChartInk
  /**
   * Draws slot `i`'s mark, centred on (`x`, `y`). Shape-specific by design: a
   * line's swatch is a dashed rule with a marker on it, a bar's would be a
   * hachured chip, and there is no useful common denominator between them.
   */
  swatch: (x: number, y: number, color: string, index: number) => ReactNode
}

/**
 * In-SVG legend. A PNG has no HTML legend to defer to -- spec §4 retires
 * in-SVG legends only where an HTML one is available.
 */
export function MetricLegend<T extends { team: string }>({
  series,
  geo,
  ink,
  swatch,
}: MetricLegendProps<T>): ReactNode {
  return (
    <>
      {series.map((entry, i) => {
        const x = geo.contentX + (i % 2) * (geo.contentW / 2)
        const y = LEGEND_BASELINE + Math.floor(i / 2) * LEGEND_ROW_H
        return (
          <g key={`legend-${entry.team}`}>
            {swatch(x, y - 4, seriesInk(ink, i), i)}
            <text
              x={x + 32}
              y={y}
              fill={ink.textSecondary}
              fontFamily={ink.fontBody}
              fontSize={LEGEND_SIZE}
            >
              {entry.team}
            </text>
          </g>
        )
      })}
    </>
  )
}

interface MissingTeamsNoteProps {
  teams: string[]
  blurb: string
  x: number
  y: number
  ink: ChartInk
}

/**
 * "No X on record for Y." -- the secondary note, kept at footnote size. The
 * genuinely load-bearing sentence on these cards is the direction note, which
 * each shape places itself one step larger.
 */
export function MissingTeamsNote({ teams, blurb, x, y, ink }: MissingTeamsNoteProps): ReactNode {
  if (teams.length === 0) return null
  return (
    <text x={x} y={y} fill={ink.textMuted} fontFamily={ink.fontBody} fontSize={CHART_FONT_SIZE.footnote}>
      {`No ${blurb} on record for ${joinList(teams)}.`}
    </text>
  )
}

interface MetricEmptyCardProps {
  width: number
  title: string
  subtitle: string
  sentence: string
  ariaLabel: string
  ink: ChartInk
  generator: RoughGenerator
}

/**
 * The in-chart empty state: masthead plus one sentence saying what is missing.
 *
 * The route normally catches "no data" earlier and serves `EmptyCard`, but a
 * spec with no drawable series must never reach a shape's scale math -- and an
 * axes-only chart with an unexplained blank plot is worse than a sentence.
 * Shared so that failure looks identical whichever shape was asked for.
 */
export function MetricEmptyCard({
  width,
  title,
  subtitle,
  sentence,
  ariaLabel,
  ink,
  generator,
}: MetricEmptyCardProps): ReactNode {
  const geo = cardGeometry(width, METRIC_EMPTY_HEIGHT)
  return (
    <ChartDocument width={width} height={METRIC_EMPTY_HEIGHT} ink={ink} ariaLabel={ariaLabel}>
      <MetricMasthead geo={geo} generator={generator} title={title} subtitle={subtitle} ink={ink} />
      <text
        x={width / 2}
        y={PLOT_TOP_BASE + 30}
        textAnchor="middle"
        fill={ink.textMuted}
        fontFamily={ink.fontBody}
        fontSize={CHART_FONT_SIZE.sm}
      >
        {sentence}
      </text>
    </ChartDocument>
  )
}
