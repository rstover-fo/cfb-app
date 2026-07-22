/**
 * Scaffold helpers (docs/chart-style-spec.md §1.1, §10): grid lines, axis
 * tick labels. These render plain React SVG with `var(--token)` refs --
 * theme-safe natively, never rough-drawn. Call them inside the chart's
 * static `<svg>` scaffold, before the rough layer.
 */
import type { ReactNode } from 'react'

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

/** Horizontal gridlines across the plot area: `var(--border)`, 1px, 0.4 opacity. */
export function gridLinesY(
  ticks: ReadonlyArray<Pick<YTick, 'pct'>>,
  layout: ChartLayout,
): ReactNode {
  return ticks.map(({ pct }) => (
    <line
      key={pct}
      x1={layout.padding.left}
      y1={layout.padding.top + pct * plotHeight(layout)}
      x2={layout.width - layout.padding.right}
      y2={layout.padding.top + pct * plotHeight(layout)}
      stroke="var(--border)"
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
): ReactNode {
  return ticks.map(({ pct, val }) => (
    <text
      key={pct}
      x={layout.padding.left - 10}
      y={layout.padding.top + pct * plotHeight(layout)}
      textAnchor="end"
      dominantBaseline="middle"
      className="fill-[var(--text-muted)] text-xs"
    >
      {format(val)}
    </text>
  ))
}

/** X-axis tick labels, centered in the bottom padding gutter. */
export function axisLabelsX(ticks: ReadonlyArray<XTick>, layout: ChartLayout): ReactNode {
  return ticks.map(({ x, label }) => (
    <text
      key={`${x}-${label}`}
      x={x}
      y={layout.height - 15}
      textAnchor="middle"
      className="fill-[var(--text-muted)] text-xs"
    >
      {label}
    </text>
  ))
}
