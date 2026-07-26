/**
 * Scaffold helpers (docs/chart-style-spec.md §1.1, §10): grid lines, axis
 * tick labels. These render plain React SVG -- theme-safe natively, never
 * rough-drawn. Call them inside the chart's static `<svg>` scaffold, before
 * the rough layer.
 *
 * Each helper takes an OPTIONAL `ink` (`src/lib/charts/tokens.ts`):
 *
 * - **omitted** -- browser behaviour, unchanged: Tailwind classes and
 *   `var(--token)` refs, with the browser resolving colors and font metrics.
 * - **supplied** -- literal colors plus explicit `font-family` / `font-size`,
 *   and vertical centering expressed as an explicit `dy` rather than
 *   `dominant-baseline`. This is what the server-side renderer needs: resvg is
 *   an SVG 1.1 static renderer with no custom properties, no stylesheets, no
 *   class resolution, and only partial `dominant-baseline` support.
 */
import type { ReactNode } from 'react'
import type { ChartInk } from './tokens'
import { CHART_FONT_SIZE, centerDy } from './presets'

export interface ChartLayout {
  width: number
  height: number
  padding: { top: number; right: number; bottom: number; left: number }
}

/** Fractional position down the plot area (0 = top, 1 = bottom) plus the data value there. */
export interface YTick {
  pct: number
  val: number
}

/** An x position in viewBox coordinates plus the label rendered there. */
export interface XTick {
  x: number
  label: string | number
}

function plotHeight(layout: ChartLayout): number {
  return layout.height - layout.padding.top - layout.padding.bottom
}

/**
 * Presentation attributes for a muted tick label. With `ink` these are literal
 * and self-contained; without it the Tailwind class carries them as before.
 */
function tickTextProps(ink: ChartInk | undefined) {
  if (!ink) return { className: 'fill-[var(--text-muted)] text-xs' }
  return { fill: ink.textMuted, fontFamily: ink.fontBody, fontSize: CHART_FONT_SIZE.xs }
}

/** Horizontal gridlines across the plot area: `--border`, 1px, 0.4 opacity. */
export function gridLinesY(
  ticks: ReadonlyArray<Pick<YTick, 'pct'>>,
  layout: ChartLayout,
  ink?: ChartInk,
): ReactNode {
  return ticks.map(({ pct }) => (
    <line
      key={pct}
      x1={layout.padding.left}
      y1={layout.padding.top + pct * plotHeight(layout)}
      x2={layout.width - layout.padding.right}
      y2={layout.padding.top + pct * plotHeight(layout)}
      stroke={ink ? ink.border : 'var(--border)'}
      strokeWidth={1}
      opacity={0.4}
    />
  ))
}

/**
 * Vertical gridlines down the plot area -- the transpose of `gridLinesY`, for
 * charts whose value axis runs horizontally (ranked bars). Same `--border`,
 * 1px, 0.4 opacity, so a transposed chart reads as the same scaffold.
 */
export function gridLinesX(
  ticks: ReadonlyArray<Pick<XTick, 'x'>>,
  layout: ChartLayout,
  ink?: ChartInk,
): ReactNode {
  return ticks.map(({ x }) => (
    <line
      key={x}
      x1={x}
      y1={layout.padding.top}
      x2={x}
      y2={layout.height - layout.padding.bottom}
      stroke={ink ? ink.border : 'var(--border)'}
      strokeWidth={1}
      opacity={0.4}
    />
  ))
}

/** Y-axis tick labels, right-aligned into the left padding gutter. */
export function axisLabelsY(
  ticks: ReadonlyArray<YTick>,
  format: (val: number) => string,
  layout: ChartLayout,
  ink?: ChartInk,
): ReactNode {
  return ticks.map(({ pct, val }) => (
    <text
      key={pct}
      x={layout.padding.left - 10}
      y={layout.padding.top + pct * plotHeight(layout)}
      textAnchor="end"
      // resvg's dominant-baseline support is partial, so with server ink the
      // centering becomes an explicit baseline shift instead.
      {...(ink ? { dy: centerDy(CHART_FONT_SIZE.xs) } : { dominantBaseline: 'middle' as const })}
      {...tickTextProps(ink)}
    >
      {format(val)}
    </text>
  ))
}

/** X-axis tick labels, centered in the bottom padding gutter. */
export function axisLabelsX(
  ticks: ReadonlyArray<XTick>,
  layout: ChartLayout,
  ink?: ChartInk,
): ReactNode {
  return ticks.map(({ x, label }) => (
    <text
      key={`${x}-${label}`}
      x={x}
      y={layout.height - 15}
      textAnchor="middle"
      {...tickTextProps(ink)}
    >
      {label}
    </text>
  ))
}
