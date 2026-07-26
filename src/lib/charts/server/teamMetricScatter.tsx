/**
 * `team-metric-scatter` -- two metrics, one season, a ~25-team field drawn as
 * team logos, with the teams the caller named highlighted against it.
 *
 * The third `team-metric-*` shape. As with the other two, everything upstream
 * of the picture is shared and only the geometry lives here:
 *
 *   ../metrics.ts        the metric enum and its direction contract
 *   ../metricScale.ts    the value domain and its tick rules
 *   ./metricCard.tsx     card rhythm, masthead, legend, empty state, series ink
 *   ../../queries/teamMetric.ts   the api.team_history field read
 *   ../../queries/teamLogos.ts    logos, resolved by the ROUTE (see below)
 *
 * ---------------------------------------------------------------------------
 * Top-right is always the good corner
 * ---------------------------------------------------------------------------
 * The trend chart inverts its single y-axis for a lower-is-better metric so
 * that "up" means "better". This shape does the same thing twice, once per
 * axis, and the result is a rule that holds across every scatter this family
 * will ever draw, whatever the two metrics are: **the good corner is the top
 * right**.
 *
 * The alternative -- each axis running its natural direction, with a caption
 * explaining which corner is good on this particular pairing -- was considered
 * and rejected. It makes every chart a small puzzle, and the reader who does
 * not solve it does not get a wrong-ish answer, they get the exactly inverted
 * one. Consistency across charts beats per-axis naturalness here. Nothing in a
 * scatter's encoding resists the flip either: position is not length, so unlike
 * the bars shape there is no quantity being misstated (see ../metrics.ts).
 *
 * The cost is real and is paid explicitly: ticks run backwards on a reversed
 * axis, exactly as they do on the trend card. So it is said twice, because a
 * PNG has no hover to interrogate -- and twice rather than three times because
 * each survivor carries something the other cannot. The axis caption names
 * WHICH axis reversed and why (`scatterAxisLabel`); on a mixed pair that is
 * the thing a reader cannot guess. The note below the plot names the good
 * corner (`scatterDirectionNote`), in the same slot the trend and bars cards
 * put their direction sentence.
 *
 * ---------------------------------------------------------------------------
 * Logos, and why they arrive as `data:` URIs
 * ---------------------------------------------------------------------------
 * The marks are team logos: on a 25-team field, a logo is recognised faster
 * than any dot-plus-label arrangement, and it is the only way to caption 25
 * marks without printing 25 labels. Spec §7 already exempts raster imagery from
 * roughification, so a logo is drawn as a plain `<image>` and nothing is done
 * to it.
 *
 * They arrive here **already resolved**. `renderChartSvg` is pure -- no I/O, no
 * clock -- which is what makes the byte-hash tests, the SVG snapshots and the
 * route's `immutable` caching sound, so the fetching lives in the route (see
 * ../../queries/teamLogos.ts). resvg also fetches nothing at all, so a remote
 * href would render as a hole rather than fail loudly; the bytes have to be in
 * the document.
 *
 * A team with no logo -- and there are always some, plus whatever did not come
 * back in time -- draws a rough mark instead. Never a hole.
 *
 * A crest is also artwork drawn for somebody else's background: ESPN's are made
 * for a white page, and on the dark card the navy and black ones vanish
 * outright. In dark mode each one is therefore given paper to sit on --
 * `ink.crestPaper`, which is the light card's own surface. The measurements and
 * the treatments that were rejected are on `ChartInk.crestPaper`; how it is
 * applied is on `ScatterMarkShape`.
 *
 * ---------------------------------------------------------------------------
 * The field is context; the named teams are the subject
 * ---------------------------------------------------------------------------
 * 25 logos at full strength is mud, and 25 labels is worse. So:
 *
 *   - the field draws small and at reduced opacity, and is NOT labelled. It is
 *     there to give the highlighted teams a position worth reading, and a
 *     reader who wants to identify a particular grey logo can still do it;
 *   - the highlighted teams draw larger, at full strength, inside a rough ring
 *     in their `--series-*` ink, and are the only marks that carry a name.
 *
 * The muted treatment is opacity, not a colour: `ink.textMuted`/`ink.border`
 * are the field's ink where anything is drawn rather than imaged (spec §6 bans
 * inventing a colour, and a logo has its own colours anyway).
 *
 * Overlap is handled by draw order rather than by displacement -- nothing is
 * nudged off its true position. The field draws worst-placed first, so better
 * teams sit on top of worse ones, and every highlighted mark draws last, so the
 * subject is never buried. Where field logos collide they read as a cloud,
 * which is the honest picture of a crowded region.
 *
 * resvg constraints (see ./document.tsx): SVG 1.1 static, inline attributes
 * only, every `<text>` states font-family and font-size, no dominant-baseline.
 *
 * Pure by contract: data in, SVG markup out.
 */
import type { ReactNode } from 'react'
import type { RoughGenerator } from 'roughjs/bin/generator'
import { axisLabelsX, axisLabelsY, gridLinesX, gridLinesY, type ChartLayout } from '../axes'
import { METRICS, scatterAxisLabel, scatterDirectionNote, axisIsReversed, type MetricId } from '../metrics'
import { niceScale } from '../metricScale'
import { CHART_FONT_SIZE, CHART_WIDTH, ROUGH_SECONDARY, ROUGH_SEED, centerDy } from '../presets'
import type { ChartInk } from '../tokens'
import { ChartDocument, cardGeometry } from './document'
import {
  LEGEND_ROW_H,
  MetricEmptyCard,
  MetricLegend,
  MetricMasthead,
  MissingTeamsNote,
  RULE_Y,
  joinList,
  legendRows,
  partitionSeries,
  seriesInk,
} from './metricCard'
import { RoughShape, createRoughGenerator } from './rough'

const WIDTH = CHART_WIDTH

// --- Vertical geometry -----------------------------------------------------
/**
 * Plot height. Taller than the trend card's 204 because a scatter spends its
 * vertical extent on a second data axis rather than on one series' range, and
 * because a 20-unit logo needs room not to touch its neighbour (spec §9 Gate B:
 * 350 is a default, the 700 width and the gutter conventions are what bind).
 */
const PLOT_H = 300
/** Reserved above the plot for the y-axis caption. */
const Y_CAPTION_BAND = 20
/** Gap from the masthead rule to the first legend row (or to the caption band). */
const ABOVE_LEGEND = 22
/** x ticks (+18), x caption (+36), direction note (+54), data note (+70), card pad. */
const BELOW_PLOT = 98

// --- Horizontal geometry ---------------------------------------------------
/** Left gutter for y tick labels -- the spec's left-gutter axis convention. */
const PLOT_LEFT = 72
/** Inside the card's content box (which ends at 672) by a tick label's margin. */
const PLOT_RIGHT = 656

// --- Marks -----------------------------------------------------------------
/** Field logo box, in viewBox units. */
const FIELD_LOGO = 20
/** Highlighted logo box -- half again as large, so the subject reads first. */
const HIGHLIGHT_LOGO = 30
/**
 * Field LOGOS are drawn down to this opacity. The one channel available for
 * "this is context": a logo carries its school's own colours, so there is no
 * ink to mute, and desaturating raster imagery is not something SVG 1.1 static
 * offers (nor something spec §7 would allow doing to a logo).
 *
 * Not lower than this. Size, the absent ring and the absent label already say
 * "context" three times over, and a crest has little contrast to give away
 * before it stops being a logo at all.
 *
 * Not HIGHER either, and raising it was never the fix for the dark card: on
 * `#252019` a navy crest measures 1.03:1 at opacity 1.0, so the whole range
 * this dial can travel is worth 0.01. What that problem needed was a different
 * surface, not more of the mark -- see `ink.crestPaper`.
 *
 * Logos only, never the rough fallback -- see `ScatterMarkShape`.
 */
const FIELD_OPACITY = 0.65
/**
 * Air between a crest's box and the edge of the paper disc drawn under it in
 * dark mode (`ink.crestPaper`).
 *
 * Small on purpose. The disc has to read as the stock the crest is printed on,
 * not as a plotted bubble -- this shape encodes position and size, and a disc
 * with a generous margin starts making a claim of its own. Two units past the
 * box is enough that a crest which fills its box does not touch the edge; the
 * corners of a square-ish crest still overhang slightly, which is what keeps it
 * looking like backing rather than like a mark.
 */
const CREST_PAPER_PAD = 2
/** Rough fallback marks, for a team with no logo. */
const FIELD_MARK = 11
const HIGHLIGHT_MARK = 16
/** Ring clearance around a highlighted mark, per side. */
const RING_PAD = 6
/**
 * Clearance held between the plot frame and the extremes of the data.
 *
 * A mark is not a point: the widest one is a 30-unit logo inside a ring, so a
 * team at the edge of the domain would hang half of itself over the axis rule
 * and into the tick labels -- and the teams at the edges of a scatter's domain
 * are exactly the ones the reader came for. The trend card buys the same
 * clearance from `niceScale` (one step of air on a coincident extreme), but a
 * step here is a fifth of the plot and the marks are ten times the size, so
 * this shape insets the mapped range instead: the frame keeps the round tick
 * values, and no mark can reach it.
 */
const MARK_INSET = HIGHLIGHT_LOGO / 2 + RING_PAD

/** One team's position, plus whatever raster we managed to resolve for it. */
export interface ScatterMark {
  team: string
  x: number
  y: number
  /**
   * 1-based placing on the ranking metric, or null when the view published no
   * ranking value. Drives draw order, and is printed beside a highlighted team
   * that placed outside the field.
   */
  placing: number | null
  /**
   * An already-resolved `data:` URI, or null/absent to draw the rough fallback.
   * A remote URL renders as a hole under resvg -- see the module header.
   */
  logo?: string | null
}

/** Everything the renderer needs. Assembled by the route from the query. */
export interface TeamMetricScatter {
  /** Metric on the horizontal axis. */
  x: MetricId
  /** Metric on the vertical axis. */
  y: MetricId
  season: number
  /** Which metric chose the field. */
  rankBy: MetricId
  /** How many teams the field was asked for -- the subtitle's "top N". */
  fieldSize: number
  /** The field plus any named team outside it, in any order. */
  marks: ScatterMark[]
  /**
   * Teams to draw as the subject, in the order the caller named them. That
   * order is the `--series-*` slot (see `seriesInk` in ./metricCard), so a team
   * keeps its ink across shapes of the same request.
   */
  highlight: string[]
}

function plotTopFor(highlightCount: number): number {
  const legendBand = highlightCount === 0 ? 0 : legendRows(highlightCount) * LEGEND_ROW_H
  return RULE_Y + ABOVE_LEGEND + legendBand + Y_CAPTION_BAND
}

/** Canvas height for a chart highlighting `highlightCount` teams. */
export function teamMetricScatterHeight(highlightCount: number): number {
  return plotTopFor(highlightCount) + PLOT_H + BELOW_PLOT
}

/**
 * Rough options for a mark drawn instead of a logo.
 *
 * Below §9's series weights for the same reason the trend card's markers are:
 * these are small round marks, and a 3px wobbling outline at 9 units across
 * reads as a blob rather than as a point.
 */
function markOptions(color: string, filled: boolean) {
  return {
    stroke: color,
    ...(filled ? { fill: color, fillStyle: 'solid' as const } : {}),
    strokeWidth: filled ? 1 : 1.2,
    roughness: 0.7,
    bowing: 0.3,
    seed: ROUGH_SEED,
  }
}

interface MarkProps {
  generator: RoughGenerator
  mark: ScatterMark
  cx: number
  cy: number
  /** Ink for the rough fallback. Never applied to a logo (spec §7). */
  color: string
  logoBox: number
  markSize: number
  /**
   * Muting for the raster only. Named for what it applies to, because the
   * fallback deliberately does NOT take it -- see `ScatterMarkShape`.
   */
  logoOpacity?: number
  /**
   * `ink.crestPaper`: the backing to lay under a crest, or null for none.
   * Non-null in dark mode only.
   */
  paper: string | null
}

/**
 * One team's mark: its logo where we have one, a rough circle where we do not.
 *
 * The fallback is a real mark, not an apology -- it sits at the same position
 * and the same visual weight, so a team whose logo failed is still IN the
 * chart. The alternative (skipping it) would quietly change what the picture
 * claims the field is.
 *
 * `FIELD_OPACITY` reaches the logo and stops there. A logo is somebody else's
 * artwork at an unknown contrast, and muting it is the only lever this shape
 * has; the fallback is OUR ink, and `--text-muted` at 0.65 lands at 2.6:1 on
 * the dark card and 2.8:1 on the light one -- under WCAG 1.4.11's 3:1 floor
 * for a non-text mark, in both modes. Drawn at full strength it is 4.4:1 and
 * 5.9:1. Nothing is lost by that: the field's "this is context" signal is
 * carried by the smaller box, the absent ring and the absent label, all three
 * of which still apply.
 *
 * In dark mode a crest is drawn on its own paper (`ink.crestPaper`), because a
 * navy or black crest on `#252019` is not a muted mark, it is an absent one --
 * the full argument, with the measured ratios, is on `ChartInk.crestPaper`. Two
 * things about how it is applied here:
 *
 *   - **The paper is opaque; the crest keeps its own opacity.** That is what
 *     makes the claim "back at its light-mode legibility" literally true: a
 *     field crest at 0.65 over `#FFFFFF` is pixel-for-pixel what the light card
 *     already draws. Muting the disc to match would compound the two and land
 *     somewhere neither mode has ever shown.
 *   - **Crests only, never the rough fallback.** The fallback is OUR ink, drawn
 *     at full strength against a card it was chosen for -- `--text-muted` on
 *     the dark card is 4.36:1. Putting it on paper would LOWER that to 3.71:1,
 *     to fix a problem it does not have.
 *
 * The one thing drawn across the paper rather than under it is a highlighted
 * team's ring, and it needs no special handling: `--series-*` is required to
 * clear 3:1 against BOTH card surfaces, white included, and tokens.sync.test.ts
 * already enforces it (the dark ramp measures 4.36:1 and up on white).
 */
function ScatterMarkShape({
  generator,
  mark,
  cx,
  cy,
  color,
  logoBox,
  markSize,
  logoOpacity,
  paper,
}: MarkProps): ReactNode {
  if (mark.logo) {
    return (
      <>
        {/* Under the crest and over the gridlines -- and centred on the same
            cx/cy the image is, so it cannot nudge a mark off its true
            position. Plain, not rough: like the knockout disc below it is a
            surface, not data (spec §6). */}
        {paper && <circle cx={cx} cy={cy} r={logoBox / 2 + CREST_PAPER_PAD} fill={paper} />}
        <image
          href={mark.logo}
          x={cx - logoBox / 2}
          y={cy - logoBox / 2}
          width={logoBox}
          height={logoBox}
          preserveAspectRatio="xMidYMid meet"
          opacity={logoOpacity}
        />
      </>
    )
  }
  return (
    <RoughShape
      generator={generator}
      drawable={generator.circle(cx, cy, markSize, markOptions(color, markSize >= HIGHLIGHT_MARK))}
    />
  )
}

export interface TeamMetricScatterProps {
  scatter: TeamMetricScatter
  ink: ChartInk
}

export function TeamMetricScatterChart({ scatter, ink }: TeamMetricScatterProps) {
  const xMetric = METRICS[scatter.x]
  const yMetric = METRICS[scatter.y]
  const season = String(scatter.season)
  const title = `${yMetric.label} vs ${xMetric.label}`

  const gen = createRoughGenerator()

  const byTeam = new Map(scatter.marks.map(mark => [mark.team, mark]))

  // The same partition every shape in the family uses: a named team the view
  // had nothing for keeps its identity all the way to the footnote, and the
  // `--series-*` ramp's width caps how many can be told apart. Ink follows the
  // index within `drawn`, exactly as it does on the trend and bars cards.
  const { drawn: highlighted, missing } = partitionSeries(
    scatter.highlight.map(team => ({ team, mark: byTeam.get(team) ?? null })),
    entry => entry.mark !== null,
  )
  const slotOf = new Map(highlighted.map((entry, index) => [entry.team, index]))

  // --- Empty state ----------------------------------------------------------
  if (scatter.marks.length === 0) {
    const named = scatter.highlight.length > 0 ? joinList(scatter.highlight) : 'any team'
    return (
      <MetricEmptyCard
        width={WIDTH}
        title={title}
        subtitle={season}
        sentence={`No ${xMetric.blurb} and ${yMetric.blurb} pair on record for ${named} in ${season}.`}
        ariaLabel={`No ${xMetric.blurb} and ${yMetric.blurb} pair on record for ${named}, ${season}.`}
        ink={ink}
        generator={gen}
      />
    )
  }

  // Honour `fieldSize` here too, even though the query already applied it: the
  // renderer's layout reasoning (and the legibility argument behind 25) is
  // stated in terms of a bounded field, so it enforces its own bound. A
  // highlighted team is never counted against it -- it is the subject.
  const field = scatter.marks
    .filter(mark => !slotOf.has(mark.team))
    // Worst-placed first, so better teams end up on top where marks collide,
    // and an unplaced team sits at the very bottom of the stack. Team name
    // breaks ties, so the same field always emits the same bytes.
    .sort((a, b) => (b.placing ?? Infinity) - (a.placing ?? Infinity) || a.team.localeCompare(b.team))
    .slice(-scatter.fieldSize)

  const drawnMarks = [...field, ...highlighted.map(entry => entry.mark as ScatterMark)]

  const plotTop = plotTopFor(highlighted.length)
  const plotBottom = plotTop + PLOT_H
  const height = teamMetricScatterHeight(highlighted.length)
  const geo = cardGeometry(WIDTH, height)

  // --- Scales ---------------------------------------------------------------
  // Padded to the data, never anchored at zero: a scatter encodes POSITION, and
  // the reader compares points with each other rather than with an origin.
  // Forcing zero in would push the whole field into one corner (see
  // ../metricScale.ts for the same trade made the other way by bars).
  //
  // Computed over every drawn mark, including a highlighted team far outside
  // the field -- a #84 team must land on the canvas, not past its edge.
  const xScale = niceScale(
    Math.min(...drawnMarks.map(mark => mark.x)),
    Math.max(...drawnMarks.map(mark => mark.x)),
    { isRank: xMetric.kind === 'rank' },
  )
  const yScale = niceScale(
    Math.min(...drawnMarks.map(mark => mark.y)),
    Math.max(...drawnMarks.map(mark => mark.y)),
    { isRank: yMetric.kind === 'rank' },
  )

  const reversedX = axisIsReversed(scatter.x)
  const reversedY = axisIsReversed(scatter.y)

  // The mapped range: the plot box, inset so no mark can reach the frame (see
  // MARK_INSET). Ticks and gridlines run through the same mapping, so the
  // outermost gridline sits inside the frame rather than on it -- which is
  // what a padded axis looks like everywhere else.
  const mapLeft = PLOT_LEFT + MARK_INSET
  const mapRight = PLOT_RIGHT - MARK_INSET
  const mapTop = plotTop + MARK_INSET
  const mapBottom = plotBottom - MARK_INSET

  // The two functions that implement "top-right is always best": a reversed
  // axis runs its domain the other way, so the better number lands right/up
  // whatever the metric is. See the module header for why this is worth the
  // backwards ticks it produces.
  const xFor = (value: number): number => {
    const t = (value - xScale.lo) / (xScale.hi - xScale.lo)
    return reversedX ? mapRight - t * (mapRight - mapLeft) : mapLeft + t * (mapRight - mapLeft)
  }
  const yFor = (value: number): number => {
    const t = (value - yScale.lo) / (yScale.hi - yScale.lo)
    return reversedY ? mapTop + t * (mapBottom - mapTop) : mapBottom - t * (mapBottom - mapTop)
  }

  /**
   * Layout handed to `axes.tsx`. As on the sibling cards, `height` is the plot
   * box plus its label gutter rather than the canvas height -- `axisLabelsX`
   * places labels at `height - 15`.
   */
  const X_LABEL_GAP = 33
  const layout: ChartLayout = {
    width: WIDTH,
    height: plotBottom + X_LABEL_GAP,
    padding: { top: plotTop, right: WIDTH - PLOT_RIGHT, bottom: X_LABEL_GAP, left: PLOT_LEFT },
  }
  const yTicks = yScale.ticks.map(value => ({ pct: (yFor(value) - plotTop) / PLOT_H, val: value }))
  const xTicks = xScale.ticks.map(value => ({ x: xFor(value), label: xMetric.format(value) }))

  const subtitle = `${season}  ·  top ${scatter.fieldSize} by ${METRICS[scatter.rankBy].label}`
  const directionNote = scatterDirectionNote(scatter.x, scatter.y)

  const ariaLabel =
    `${yMetric.label} against ${xMetric.label} for the ${season} top ${scatter.fieldSize} by ` +
    `${METRICS[scatter.rankBy].blurb}` +
    (highlighted.length > 0 ? `, highlighting ${joinList(highlighted.map(entry => entry.team))}` : '') +
    `. ${directionNote}`

  return (
    <ChartDocument width={WIDTH} height={height} ink={ink} ariaLabel={ariaLabel}>
      <MetricMasthead geo={geo} generator={gen} title={title} subtitle={subtitle} ink={ink} />

      {/* Legend, for the highlighted teams only. The field is keyed by the
          subtitle's "top N", not by a swatch: it is one undifferentiated group,
          and a legend row per field team is the 25 labels this shape exists to
          avoid. The swatch is a miniature of the highlight ring, so the key
          matches the plot rather than merely sharing its colour. */}
      {highlighted.length > 0 && (
        <MetricLegend
          series={highlighted}
          geo={geo}
          ink={ink}
          swatch={(x, y, color) => (
            <RoughShape
              generator={gen}
              drawable={gen.circle(x + 11, y, 15, { stroke: color, seed: ROUGH_SEED, ...ROUGH_SECONDARY })}
            />
          )}
        />
      )}

      {/* Axis captions, both horizontal: the y caption sits above the plot's
          left edge rather than rotated up its side. resvg's transform handling
          is fine, but no other card in this family rotates text, and a caption
          this load-bearing (it carries the reversal notice) should not be the
          first place we find out. */}
      <text
        x={geo.contentX}
        y={plotTop - 8}
        fill={ink.textSecondary}
        fontFamily={ink.fontBody}
        fontSize={CHART_FONT_SIZE.xs}
      >
        {scatterAxisLabel(scatter.y)}
      </text>

      {/* No third statement of the good corner here. The reversal is stated
          twice, and the two survivors each say something the other cannot: the
          axis caption above names WHICH axis reversed and why (the only place
          that can be said, and the thing a mixed pair makes unguessable), and
          the note under the plot names the corner, in the slot the trend and
          bars cards already use for their direction sentence. A corner caption
          was a third: it restated the note's leading clause from a position
          that is not actually the plot's corner (it sat in the caption band
          above the frame), and "best in both" is not self-standing copy -- it
          parses only once the note has been read, which makes it an echo
          rather than an independent statement. Gate E second pass. */}

      {/* Scaffold: gridlines and tick labels, plain SVG, never rough (spec §1). */}
      {gridLinesY(yTicks, layout, ink)}
      {gridLinesX(xTicks, layout, ink)}
      {axisLabelsY(yTicks, yMetric.format, layout, ink)}
      {axisLabelsX(xTicks, layout, ink)}

      {/* Both axis rules, at the 1.5px frame weight the sibling cards close
          their plots with. Solid, not rough: a scatter is read as a coordinate
          space, and a wobbling frame would undercut the one thing the reader
          has to trust about it. */}
      <line x1={PLOT_LEFT} y1={plotBottom} x2={PLOT_RIGHT} y2={plotBottom} stroke={ink.border} strokeWidth={1.5} />
      <line x1={PLOT_LEFT} y1={plotTop} x2={PLOT_LEFT} y2={plotBottom} stroke={ink.border} strokeWidth={1.5} />

      {/* The field. Unlabelled and muted -- context, not subject. */}
      {field.map(mark => (
        <ScatterMarkShape
          key={`field-${mark.team}`}
          generator={gen}
          mark={mark}
          cx={xFor(mark.x)}
          cy={yFor(mark.y)}
          color={ink.textMuted}
          logoBox={FIELD_LOGO}
          markSize={FIELD_MARK}
          logoOpacity={FIELD_OPACITY}
          paper={ink.crestPaper}
        />
      ))}

      {/* The highlighted teams, drawn last so nothing can bury them. */}
      {highlighted.map(entry => {
        const mark = entry.mark as ScatterMark
        const color = seriesInk(ink, slotOf.get(entry.team) ?? 0)
        const cx = xFor(mark.x)
        const cy = yFor(mark.y)
        const box = mark.logo ? HIGHLIGHT_LOGO : HIGHLIGHT_MARK
        const ring = box + RING_PAD * 2

        // Placing is printed only for a team that missed the field: inside it
        // the position on the plot already says how the team is doing, while
        // outside it the reader's first question is "why is this one here?".
        const outside = mark.placing === null || mark.placing > scatter.fieldSize
        const label = !outside
          ? entry.team
          : mark.placing === null
            ? `${entry.team}  ·  unranked`
            : `${entry.team}  ·  #${mark.placing}`

        // Flip the label to the inside of the plot near the right edge, so a
        // long school name never runs off the card.
        const flip = cx > (PLOT_LEFT + PLOT_RIGHT) / 2
        const labelX = flip ? cx - ring / 2 - 6 : cx + ring / 2 + 6

        // Shared by the label and the plate under it, so the two can never
        // drift apart into a visible fringe. Placement only -- paint differs,
        // and the remaining attributes are spelled out on both so the emitted
        // attribute ORDER is unchanged from before the plate existed (the light
        // card is byte-identical, and the snapshots prove it).
        const labelPlacement = {
          x: labelX,
          y: cy + centerDy(CHART_FONT_SIZE.xs),
          textAnchor: (flip ? 'end' : 'start') as 'end' | 'start',
        }

        return (
          <g key={`highlight-${entry.team}`}>
            {/* The subject clears its own space. A highlighted mark draws last
                and can therefore land on top of a cluster of field logos, and
                a crest read against another crest is not read at all. The card
                colour behind it is the same device as PlaycallingProfile's row
                highlight -- a surface under a mark, drawn plain because it is
                not itself data (spec §6).

                It stays `bgSurface` in both modes: its job is to BE the card,
                and any other colour would read as a plotted disc rather than as
                cleared space. It is therefore not the crest's backing -- in
                dark it is `#252019`, which knocks the neighbours out correctly
                and leaves a navy crest with nothing to sit on. The paper the
                crest actually needs is drawn inside this one, by
                `ScatterMarkShape`, at 34 units across against this 42 -- so the
                subject gets both: cleared space, and stock to print on. */}
            <circle cx={cx} cy={cy} r={ring / 2} fill={ink.bgSurface} />
            {/* Emphasis around raster is drawn rough (spec §7). §7's ring is
                `--accent` because it describes a hover/selection affordance on
                an interactive surface; here the ring is identity on a static
                PNG carrying up to four of them, so it takes the team's
                `--series-*` ink -- the family's one assigner, and the same ink
                the team has on a trend or bars card of the same request. */}
            <RoughShape
              generator={gen}
              drawable={gen.circle(cx, cy, ring, { stroke: color, seed: ROUGH_SEED, ...ROUGH_SECONDARY })}
            />
            <ScatterMarkShape
              generator={gen}
              mark={mark}
              cx={cx}
              cy={cy}
              color={color}
              logoBox={HIGHLIGHT_LOGO}
              markSize={HIGHLIGHT_MARK}
              paper={ink.crestPaper}
            />
            {/* The label clears its own space too, for the same reason and by
                the same device as the disc above it -- and only where there is
                something to clear.

                A label sits BESIDE its mark, so in a crowded field it lands on
                a NEIGHBOUR. That was survivable while everything behind it was
                the card: `--text-primary` over a mostly-transparent crest still
                had the card to read against. `crestPaper` takes that away --
                the neighbour is now opaque white, and near-white label text
                crossing it disappears exactly as the navy crests used to (the
                reference card's "Texas" runs straight across BYU's disc).
                Drawn here, so the label carries the card with it.

                Same copy, stroked and filled in `bgSurface`, then the real
                label painted on top: the stroke widens the glyph outline into a
                thin plate and the second pass restores the letterform exactly,
                which a stroke on the label itself cannot do (SVG 1.1 paints
                fill first, and `paint-order` is SVG2 -- see ./document.tsx).
                Invisible everywhere it is not needed, because it IS the card.

                Gated on `crestPaper`, not on the theme: the hazard is paper
                that is not the card colour, which is the same condition. Light
                has none, draws none, and is byte-identical to before. */}
            {ink.crestPaper && (
              <text
                {...labelPlacement}
                fill={ink.bgSurface}
                stroke={ink.bgSurface}
                strokeWidth={2.5}
                strokeLinejoin="round"
                fontFamily={ink.fontBody}
                fontSize={CHART_FONT_SIZE.xs}
              >
                {label}
              </text>
            )}
            <text
              {...labelPlacement}
              fill={ink.textPrimary}
              fontFamily={ink.fontBody}
              fontSize={CHART_FONT_SIZE.xs}
            >
              {label}
            </text>
          </g>
        )
      })}

      {/* The x-axis caption, centred under its ticks. */}
      <text
        x={(PLOT_LEFT + PLOT_RIGHT) / 2}
        y={plotBottom + 36}
        textAnchor="middle"
        fill={ink.textSecondary}
        fontFamily={ink.fontBody}
        fontSize={CHART_FONT_SIZE.xs}
      >
        {scatterAxisLabel(scatter.x)}
      </text>

      {/* Sized and inked one step above a footnote, as on both sibling cards
          and for the same reason: at Discord's mobile column width `footnote`
          (11) in `textMuted` collapses to roughly 6 effective px, and this is
          the sentence that stops a reversed axis being read as a bug. */}
      <text
        x={geo.contentX}
        y={plotBottom + 54}
        fill={ink.textSecondary}
        fontFamily={ink.fontBody}
        fontSize={CHART_FONT_SIZE.xs}
      >
        {directionNote}
      </text>
      <MissingTeamsNote
        teams={missing}
        blurb={`${xMetric.blurb} and ${yMetric.blurb} pair`}
        x={geo.contentX}
        y={plotBottom + 70}
        ink={ink}
      />
    </ChartDocument>
  )
}
