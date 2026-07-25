/**
 * `team-playcalling` -- run/pass play-call split by situation, as a standalone
 * editorial card for the chart image route.
 *
 * This is the server twin of `src/components/team/PlaycallingProfile.tsx`: same
 * diverging hand-drawn bars (run share left, pass share right, around an even
 * split), same row derivation (`buildPlaycallingRows`), same paired ±41°
 * hachure (`pairedBarOptions`). What differs is only what has to:
 *
 * - No interaction layers, no tooltip, no HTML legend. A PNG is self-contained,
 *   so the run/pass key is drawn **in** the SVG -- spec §4 retires in-SVG
 *   legends for app charts because an HTML one is available there; here it is
 *   not.
 * - Every `<text>` states `font-family` and `font-size`, and centers with an
 *   explicit `dy`; resvg inherits nothing and its `dominant-baseline` support
 *   is partial.
 *
 * Pure by contract: data in, SVG markup out. Fetching belongs to the route.
 */
import type { PlaycallingProfile } from '@/lib/queries/playcalling'
import { buildPlaycallingRows } from '../playcallingRows'
import { CHART_FONT_SIZE, CHART_WIDTH, ROUGH_SEED, ROUGH_TERTIARY, centerDy, pairedBarOptions } from '../presets'
import type { ChartInk } from '../tokens'
import { ChartDocument, OUTER_PAD, cardGeometry } from './document'
import { RoughShape, createRoughGenerator } from './rough'
import { formatOrdinal } from '@/lib/utils'

const WIDTH = CHART_WIDTH

// --- Vertical rhythm (baselines, not box tops -- resvg positions text by
// --- baseline and we never rely on inherited line boxes).
const TITLE_BASELINE = 44
const SUBTITLE_BASELINE = 63
const RULE_Y = 76
const LEGEND_BASELINE = 92
const ROWS_TOP = 104
const ROW_HEIGHT = 48
const BAR_HEIGHT = 16

// --- Horizontal geometry.
/** Gutter reserved for the situation labels, right-aligned against the plot. */
const LABEL_W = 130
const PLOT_LEFT = OUTER_PAD + 18 + LABEL_W + 14
/** Space reserved inside each half of the plot for the % direct labels. */
const LABEL_GUTTER = 38

const TITLE_SIZE = 19
const LEGEND_SIZE = 11

function sharePct(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

/** Height this chart needs for `rowCount` situations. */
export function teamPlaycallingHeight(rowCount: number): number {
  const rowsBottom = ROWS_TOP + rowCount * ROW_HEIGHT
  return rowsBottom + 20 + 14 + OUTER_PAD
}

export interface TeamPlaycallingProps {
  profile: PlaycallingProfile
  ink: ChartInk
}

export function TeamPlaycallingChart({ profile, ink }: TeamPlaycallingProps) {
  const rows = buildPlaycallingRows(profile)
  const height = teamPlaycallingHeight(rows.length)
  const geo = cardGeometry(WIDTH, height)

  const plotRight = geo.contentRight
  const centerX = PLOT_LEFT + (plotRight - PLOT_LEFT) / 2
  const halfWidth = (plotRight - PLOT_LEFT) / 2 - LABEL_GUTTER
  const labelRight = geo.contentX + LABEL_W
  const rowsBottom = ROWS_TOP + rows.length * ROW_HEIGHT
  const captionBaseline = rowsBottom + 20

  // One generator per render. Every options object carries `seed`, so the
  // emitted path data is identical run to run (spec §9) -- that determinism is
  // what makes the SVG snapshot test meaningful and keeps a cached PNG stable.
  const gen = createRoughGenerator()

  const subtitle = [
    `${profile.season} season`,
    profile.conference,
    profile.games_played !== null ? `${profile.games_played} games` : null,
  ]
    .filter(Boolean)
    .join('  ·  ')

  const ariaLabel = `Run versus pass share by situation for ${profile.team}, ${profile.season} season`

  return (
    <ChartDocument width={WIDTH} height={height} ink={ink} ariaLabel={ariaLabel}>
      {/* Masthead */}
      <text
        x={geo.contentX}
        y={TITLE_BASELINE}
        fill={ink.textPrimary}
        fontFamily={ink.fontHeadline}
        fontSize={TITLE_SIZE}
      >
        {`${profile.team} playcalling`}
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

      {/* Hand-drawn rule under the masthead (tertiary/context weights, spec §9) */}
      <RoughShape
        generator={gen}
        drawable={gen.line(geo.contentX, RULE_Y, plotRight, RULE_Y, {
          stroke: ink.border,
          seed: ROUGH_SEED,
          ...ROUGH_TERTIARY,
        })}
      />

      {/* Run/pass key. In-SVG because a PNG has no HTML legend to defer to;
          the swatches repeat the ±41° hachure lean so the key matches the bars
          on direction, not just color. */}
      <RoughShape
        generator={gen}
        drawable={gen.rectangle(centerX - 88, LEGEND_BASELINE - 9, 16, 11, pairedBarOptions(ink.run, 'left', ROUGH_SEED))}
      />
      <text
        x={centerX - 66}
        y={LEGEND_BASELINE}
        fill={ink.run}
        fontFamily={ink.fontBody}
        fontSize={LEGEND_SIZE}
        fontWeight={500}
      >
        RUN
      </text>
      <text
        x={centerX + 66}
        y={LEGEND_BASELINE}
        textAnchor="end"
        fill={ink.pass}
        fontFamily={ink.fontBody}
        fontSize={LEGEND_SIZE}
        fontWeight={500}
      >
        PASS
      </text>
      <RoughShape
        generator={gen}
        drawable={gen.rectangle(centerX + 72, LEGEND_BASELINE - 9, 16, 11, pairedBarOptions(ink.pass, 'right', ROUGH_SEED))}
      />

      {/* Alternating row bands. Static token fills on scaffold elements stay
          legal (spec §6); only data marks must be rough-drawn. */}
      {rows.map((row, i) =>
        i % 2 === 1 ? (
          <rect
            key={`band-${row.key}`}
            x={geo.contentX}
            y={ROWS_TOP + i * ROW_HEIGHT}
            width={geo.contentW}
            height={ROW_HEIGHT}
            fill={ink.bgSurfaceAlt}
            opacity={0.55}
          />
        ) : null,
      )}

      {/* Center axis: the even run–pass split */}
      <line
        x1={centerX}
        y1={ROWS_TOP - 6}
        x2={centerX}
        y2={rowsBottom}
        stroke={ink.border}
        strokeWidth={1.5}
      />

      {/* Rough-drawn bars */}
      {rows.map((row, i) => {
        const y = ROWS_TOP + i * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2
        const runWidth = row.runRate * halfWidth
        const passWidth = (1 - row.runRate) * halfWidth
        return (
          <g key={`bars-${row.key}`}>
            {runWidth > 0 && (
              <RoughShape
                generator={gen}
                drawable={gen.rectangle(centerX - runWidth, y, runWidth, BAR_HEIGHT, pairedBarOptions(ink.run, 'left', ROUGH_SEED))}
              />
            )}
            {passWidth > 0 && (
              <RoughShape
                generator={gen}
                drawable={gen.rectangle(centerX, y, passWidth, BAR_HEIGHT, pairedBarOptions(ink.pass, 'right', ROUGH_SEED))}
              />
            )}
          </g>
        )
      })}

      {/* Row labels and direct % labels */}
      {rows.map((row, i) => {
        const barY = ROWS_TOP + i * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2
        const barMidY = barY + BAR_HEIGHT / 2
        const runWidth = row.runRate * halfWidth
        const passWidth = (1 - row.runRate) * halfWidth
        return (
          <g key={`labels-${row.key}`}>
            <text
              x={labelRight}
              // With a percentile caption the pair straddles the bar's midline;
              // without one the single label centers on it via explicit dy.
              y={row.pctl ? barMidY - 2 : barMidY + centerDy(CHART_FONT_SIZE.xs)}
              textAnchor="end"
              fill={ink.textSecondary}
              fontFamily={ink.fontBody}
              fontSize={CHART_FONT_SIZE.xs}
            >
              {row.label}
            </text>
            {row.pctl && (
              <text
                x={labelRight}
                y={barMidY + 12}
                textAnchor="end"
                fill={ink.textMuted}
                fontFamily={ink.fontBody}
                fontSize={CHART_FONT_SIZE.caption}
              >
                {`${formatOrdinal(Math.round(row.pctl.value * 100))} pctl ${row.pctl.lean}`}
              </text>
            )}
            <text
              x={centerX - runWidth - 6}
              y={barMidY + centerDy(CHART_FONT_SIZE.xs)}
              textAnchor="end"
              fill={ink.textSecondary}
              fontFamily={ink.fontBody}
              fontSize={CHART_FONT_SIZE.xs}
            >
              {sharePct(row.runRate)}
            </text>
            <text
              x={centerX + passWidth + 6}
              y={barMidY + centerDy(CHART_FONT_SIZE.xs)}
              textAnchor="start"
              fill={ink.textSecondary}
              fontFamily={ink.fontBody}
              fontSize={CHART_FONT_SIZE.xs}
            >
              {sharePct(1 - row.runRate)}
            </text>
          </g>
        )
      })}

      <text
        x={geo.contentX}
        y={captionBaseline}
        fill={ink.textMuted}
        fontFamily={ink.fontBody}
        fontSize={CHART_FONT_SIZE.footnote}
      >
        Bars diverge from an even run–pass split. Percentile captions rank the tendency against all FBS teams.
      </text>
    </ChartDocument>
  )
}
