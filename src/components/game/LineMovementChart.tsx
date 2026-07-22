'use client'

import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import rough from 'roughjs'
import type { LineMovementPoint } from '@/lib/queries/predictions'
import { CHART_INK, resolveColor, useChartTheme } from '@/lib/charts/theme'
import { inkFor } from '@/lib/charts/series'
import type { SeriesRole } from '@/lib/charts/series'
import { ChartFrame } from '@/lib/charts/ChartFrame'
import { ChartTooltip } from '@/lib/charts/ChartTooltip'
import type { ChartTooltipRow } from '@/lib/charts/ChartTooltip'
import { ChartLegend } from '@/lib/charts/ChartLegend'
import type { ChartLegendItem } from '@/lib/charts/ChartLegend'
import { gridLinesY, axisLabelsY, axisLabelsX } from '@/lib/charts/axes'
import type { ChartLayout } from '@/lib/charts/axes'
import { formatSpread, formatMoneyline } from '@/lib/format-odds'

interface LineMovementChartProps {
  points: LineMovementPoint[]
  homeTeam: string
  awayTeam: string
  /**
   * Model expected home margin (positive = home favored), e.g.
   * GamePrediction.expected_home_margin. Sign convention is OPPOSITE the
   * market spread axis this chart plots (home-relative spread: negative =
   * home favored), so the dashed reference line is drawn at -modelMargin.
   */
  modelMargin?: number | null
}

const WIDTH = 700
const HEIGHT = 280
const PADDING = { top: 24, right: 88, bottom: 44, left: 56 }
const CHART_WIDTH = WIDTH - PADDING.left - PADDING.right
const CHART_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom
const MAX_X_TICKS = 5
const LAYOUT: ChartLayout = { width: WIDTH, height: HEIGHT, padding: PADDING }

/** Stable wobble (spec §9): identical strokes across re-renders and theme flips. */
const ROUGH_SEED = 41

// Semantic ink roles for provider series, assigned in first-seen
// (provider-ascending) order; wraps if a game somehow carries more than
// three books. `PROVIDER_COLOR_VARS` mirrors the same order as `var(--…)`
// refs for the HTML legend/tooltip swatches (which read CSS vars directly).
const PROVIDER_ROLES: SeriesRole[] = ['run', 'pass', 'neutral']
const PROVIDER_COLOR_VARS = ['var(--color-run)', 'var(--color-pass)', 'var(--color-neutral)']

function formatDay(t: number): string {
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatTimestamp(t: number): string {
  return new Date(t).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

interface PlottablePoint {
  t: number
  spread: number
  row: LineMovementPoint
}

/**
 * How the betting line moved before kickoff: one rough line per provider on
 * a time (captured_at) x home-relative-spread axis, with an optional dashed
 * reference at the model's expected margin (plotted as -modelMargin -- see
 * prop doc above). Over/under is deliberately kept off the axes and shown
 * as a muted first-to-last caption.
 *
 * Renders null with no plottable rows; with exactly one snapshot renders a
 * compact "line opened at ..." text row instead of a one-point SVG. Both
 * degenerate paths are bespoke (not framed) -- the parent (game detail page)
 * already gates whether this component renders at all on `lineMovement`
 * having rows.
 */
export function LineMovementChart({ points, homeTeam, awayTeam, modelMargin }: LineMovementChartProps) {
  const [hoveredTime, setHoveredTime] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)

  // Rows we can actually plot: a numeric spread and a parseable timestamp.
  const plottable = useMemo<PlottablePoint[]>(() => {
    return points
      .filter((p): p is LineMovementPoint & { spread: number } => p.spread != null)
      .map(p => ({ t: Date.parse(p.captured_at), spread: p.spread, row: p }))
      .filter(p => !Number.isNaN(p.t))
  }, [points])

  // Provider list in first-seen order (query orders provider asc) and each
  // provider's snapshots sorted by time.
  const { providers, seriesByProvider } = useMemo(() => {
    const providerList: string[] = []
    const byProvider = new Map<string, PlottablePoint[]>()
    for (const p of plottable) {
      if (!byProvider.has(p.row.provider)) {
        providerList.push(p.row.provider)
        byProvider.set(p.row.provider, [])
      }
      byProvider.get(p.row.provider)!.push(p)
    }
    for (const series of byProvider.values()) {
      series.sort((a, b) => a.t - b.t)
    }
    return { providers: providerList, seriesByProvider: byProvider }
  }, [plottable])

  // Reference value on the spread scale. Market spread is home-relative
  // (negative = home favored); the model's expected_home_margin is positive
  // when home is favored -- so the model lands on the spread axis at
  // -modelMargin.
  const refValue = modelMargin != null ? -modelMargin : null

  const chartGeometry = useMemo(() => {
    if (plottable.length < 2) return null

    const times = plottable.map(p => p.t)
    const tMin = Math.min(...times)
    const tMax = Math.max(...times)
    const tRange = tMax - tMin

    const values = plottable.map(p => p.spread)
    if (refValue != null) values.push(refValue)
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)
    const valueRange = maxVal - minVal || 1
    const pad = valueRange * 0.1
    const dMin = minVal - pad
    const dMax = maxVal + pad

    const getX = (t: number) =>
      tRange === 0
        ? PADDING.left + CHART_WIDTH / 2
        : PADDING.left + ((t - tMin) / tRange) * CHART_WIDTH
    const getY = (v: number) =>
      PADDING.top + (1 - (v - dMin) / (dMax - dMin)) * CHART_HEIGHT

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
      pct,
      val: dMax - pct * (dMax - dMin),
    }))

    const uniqueTimes = Array.from(new Set(times)).sort((a, b) => a - b)
    const xTickTimes =
      uniqueTimes.length <= MAX_X_TICKS
        ? uniqueTimes
        : Array.from({ length: MAX_X_TICKS }, (_, i) =>
            uniqueTimes[Math.round((i / (MAX_X_TICKS - 1)) * (uniqueTimes.length - 1))]
          )

    // Hover band boundaries: midpoints between consecutive unique snapshots.
    const hoverBands = uniqueTimes.map((t, i) => {
      const left = i === 0 ? PADDING.left : (getX(uniqueTimes[i - 1]) + getX(t)) / 2
      const right =
        i === uniqueTimes.length - 1
          ? PADDING.left + CHART_WIDTH
          : (getX(t) + getX(uniqueTimes[i + 1])) / 2
      return { t, x: left, width: Math.max(0, right - left) }
    })

    return { getX, getY, yTicks, xTickTimes, hoverBands }
  }, [plottable, refValue])

  // Draw roughjs chart elements (one line + dots per provider). All
  // providers are peer series (no primary/secondary weighting), so every
  // line uses the spec §9 primary hierarchy weight.
  const drawChart = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group || !chartGeometry) return

    while (group.firstChild) group.removeChild(group.firstChild)

    const rc = rough.svg(svg)
    const surfaceColor = resolveColor(CHART_INK.surface)
    const { getX, getY } = chartGeometry

    providers.forEach((provider, i) => {
      const color = inkFor(PROVIDER_ROLES[i % PROVIDER_ROLES.length])
      const series = seriesByProvider.get(provider)!
      const coords = series.map(p => [getX(p.t), getY(p.spread)] as [number, number])

      if (coords.length >= 2) {
        const line = rc.linearPath(coords, {
          stroke: color,
          strokeWidth: 3,
          roughness: 1.0,
          bowing: 0.4,
          seed: ROUGH_SEED,
        })
        group.appendChild(line)
      }

      for (const [x, y] of coords) {
        group.appendChild(
          rc.circle(x, y, 8, {
            fill: surfaceColor,
            fillStyle: 'solid',
            stroke: color,
            strokeWidth: 2,
            roughness: 0.5,
            seed: ROUGH_SEED,
          })
        )
      }
    })
  }, [chartGeometry, providers, seriesByProvider])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Redraw on theme change (rough colors are baked in at draw time).
  useChartTheme(drawChart)

  // Over/under caption data: first -> last posted total, chronologically
  // across all snapshots (secondary info by design -- no second axis).
  const ouCaption = useMemo(() => {
    const withOu = [...plottable]
      .filter(p => p.row.over_under != null)
      .sort((a, b) => a.t - b.t)
    if (withOu.length === 0) return null
    const first = withOu[0].row.over_under as number
    const last = withOu[withOu.length - 1].row.over_under as number
    return first === last ? `O/U ${first}` : `O/U ${first} → ${last}`
  }, [plottable])

  if (plottable.length === 0) return null

  // Single snapshot: a compact text row beats a one-point line chart.
  if (plottable.length === 1) {
    const only = plottable[0]
    const label = only.row.formatted_spread ?? `${homeTeam} ${formatSpread(only.spread)}`
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-4 text-sm text-[var(--text-secondary)]">
        Line opened at{' '}
        <span className="text-[var(--text-primary)] font-medium tabular-nums">{label}</span>
        {only.row.over_under != null && <> &middot; O/U {only.row.over_under}</>}
        {' '}&middot; {only.row.provider}, {formatTimestamp(only.t)}
      </div>
    )
  }

  const { getX, getY, yTicks, xTickTimes, hoverBands } = chartGeometry!

  // Nearest snapshot per provider for the hovered timestamp.
  const buildTooltipRows = (t: number): ChartTooltipRow[] =>
    providers.map((provider, i) => {
      const series = seriesByProvider.get(provider)!
      let nearest = series[0]
      for (const p of series) {
        if (Math.abs(p.t - t) < Math.abs(nearest.t - t)) nearest = p
      }
      const spreadLabel = nearest.row.formatted_spread ?? `${homeTeam} ${formatSpread(nearest.spread)}`
      const extras: string[] = []
      if (nearest.row.over_under != null) extras.push(`O/U ${nearest.row.over_under}`)
      if (nearest.row.home_moneyline != null && nearest.row.away_moneyline != null) {
        extras.push(`ML ${formatMoneyline(nearest.row.home_moneyline)} / ${formatMoneyline(nearest.row.away_moneyline)}`)
      }
      return {
        swatch: 'solid',
        color: PROVIDER_COLOR_VARS[i % PROVIDER_COLOR_VARS.length],
        label: `${provider}:`,
        value: extras.length > 0 ? `${spreadLabel} · ${extras.join(' · ')}` : spreadLabel,
      }
    })

  const legendItems: ChartLegendItem[] = providers.map((provider, i) => ({
    key: provider,
    label: provider,
    swatch: 'solid',
    color: PROVIDER_COLOR_VARS[i % PROVIDER_COLOR_VARS.length],
  }))

  return (
    <ChartFrame
      title="Line Movement"
      ariaLabel={`Spread movement for ${awayTeam} at ${homeTeam}`}
    >
      {a11y => (
        <>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="w-full h-auto"
            {...a11y}
            onMouseLeave={() => setHoveredTime(null)}
          >
            {/* Static scaffold: grid + axis labels (home-relative spread, signed) */}
            {gridLinesY(yTicks, LAYOUT)}
            {axisLabelsY(yTicks, formatSpread, LAYOUT)}
            {axisLabelsX(xTickTimes.map(t => ({ x: getX(t), label: formatDay(t) })), LAYOUT)}

            {/* Dashed reference at the model's expected margin, sign-reconciled
                onto the spread axis (-modelMargin). */}
            {refValue != null && (
              <>
                <line
                  data-testid="model-margin-line"
                  data-spread-value={refValue}
                  x1={PADDING.left}
                  y1={getY(refValue)}
                  x2={WIDTH - PADDING.right}
                  y2={getY(refValue)}
                  stroke="var(--text-muted)"
                  strokeWidth={1}
                  strokeDasharray="6 4"
                  opacity={0.7}
                />
                <text
                  x={WIDTH - PADDING.right + 6}
                  y={getY(refValue)}
                  textAnchor="start"
                  dominantBaseline="middle"
                  className="fill-[var(--text-muted)] text-xs"
                >
                  Model {formatSpread(refValue)}
                </text>
              </>
            )}

            {/* Rough-drawn provider lines + snapshot dots */}
            <g ref={roughGroupRef} data-testid="rough-layer" />

            {/* Interactive hover bands (one per unique snapshot time) */}
            {hoverBands.map(({ t, x, width }) => (
              <rect
                key={t}
                x={x}
                y={PADDING.top}
                width={width}
                height={CHART_HEIGHT}
                fill="transparent"
                onMouseEnter={() => setHoveredTime(t)}
              />
            ))}

            {/* Hover crosshair */}
            {hoveredTime != null && (
              <line
                x1={getX(hoveredTime)}
                y1={PADDING.top}
                x2={getX(hoveredTime)}
                y2={PADDING.top + CHART_HEIGHT}
                stroke="var(--text-muted)"
                strokeWidth={1}
                strokeDasharray="4 2"
                opacity={0.6}
              />
            )}
          </svg>

          <ChartTooltip
            header={hoveredTime != null ? formatTimestamp(hoveredTime) : undefined}
            rows={hoveredTime != null ? buildTooltipRows(hoveredTime) : []}
            prompt="Hover a snapshot for details"
            minRows={Math.max(providers.length, 1)}
          />

          <ChartLegend items={legendItems} />

          {ouCaption && (
            <p className="text-xs text-[var(--text-muted)] tabular-nums text-center mt-2">{ouCaption}</p>
          )}
        </>
      )}
    </ChartFrame>
  )
}
