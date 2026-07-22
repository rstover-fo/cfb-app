'use client'

import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import rough from 'roughjs'
import type { LineMovementPoint } from '@/lib/queries/predictions'
import { resolveColor, useChartTheme } from '@/lib/charts/theme'
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

// Semantic token palette for provider series, assigned in first-seen
// (provider-ascending) order; wraps if a game somehow carries more than
// three books.
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
 * compact "line opened at ..." text row instead of a one-point SVG.
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

  // Draw roughjs chart elements (one line + dots per provider).
  const drawChart = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group || !chartGeometry) return

    while (group.firstChild) group.removeChild(group.firstChild)

    const rc = rough.svg(svg)
    const surfaceColor = resolveColor('var(--bg-surface)')
    const { getX, getY } = chartGeometry

    providers.forEach((provider, i) => {
      const color = resolveColor(PROVIDER_COLOR_VARS[i % PROVIDER_COLOR_VARS.length])
      const series = seriesByProvider.get(provider)!
      const coords = series.map(p => [getX(p.t), getY(p.spread)] as [number, number])

      if (coords.length >= 2) {
        const line = rc.linearPath(coords, {
          stroke: color,
          strokeWidth: 2.5,
          roughness: 0.8,
          bowing: 0.3,
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
  const getTooltipRows = (t: number) =>
    providers.map((provider, i) => {
      const series = seriesByProvider.get(provider)!
      let nearest = series[0]
      for (const p of series) {
        if (Math.abs(p.t - t) < Math.abs(nearest.t - t)) nearest = p
      }
      return {
        provider,
        colorVar: PROVIDER_COLOR_VARS[i % PROVIDER_COLOR_VARS.length],
        point: nearest,
      }
    })

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-4">
      <h3 className="font-headline text-sm text-[var(--text-primary)] mb-3">Line Movement</h3>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Spread movement for ${awayTeam} at ${homeTeam}`}
        onMouseLeave={() => setHoveredTime(null)}
      >
        {/* Horizontal grid lines */}
        {yTicks.map(({ pct }) => (
          <line
            key={pct}
            x1={PADDING.left}
            y1={PADDING.top + pct * CHART_HEIGHT}
            x2={WIDTH - PADDING.right}
            y2={PADDING.top + pct * CHART_HEIGHT}
            stroke="var(--border)"
            strokeWidth={1}
            opacity={0.4}
          />
        ))}

        {/* Y-axis labels (home-relative spread, signed) */}
        {yTicks.map(({ pct, val }) => (
          <text
            key={pct}
            x={PADDING.left - 10}
            y={PADDING.top + pct * CHART_HEIGHT}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-[var(--text-muted)] text-xs"
          >
            {formatSpread(val)}
          </text>
        ))}

        {/* X-axis labels (snapshot dates) */}
        {xTickTimes.map(t => (
          <text
            key={t}
            x={getX(t)}
            y={HEIGHT - 15}
            textAnchor="middle"
            className="fill-[var(--text-muted)] text-xs"
          >
            {formatDay(t)}
          </text>
        ))}

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

      {/* Nearest-snapshot tooltip */}
      {hoveredTime != null && (
        <div className="mt-2 p-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-sm">
          <p className="font-headline text-base text-[var(--text-primary)] mb-2">
            {formatTimestamp(hoveredTime)}
          </p>
          <div className="space-y-1">
            {getTooltipRows(hoveredTime).map(({ provider, colorVar, point }) => (
              <p key={provider} className="flex items-center gap-2 tabular-nums">
                <span className="w-3 h-0.5 shrink-0" style={{ background: colorVar }} />
                <span className="text-[var(--text-secondary)]">{provider}:</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {point.row.formatted_spread ?? `${homeTeam} ${formatSpread(point.spread)}`}
                </span>
                {point.row.over_under != null && (
                  <span className="text-[var(--text-secondary)]">O/U {point.row.over_under}</span>
                )}
                {point.row.home_moneyline != null && point.row.away_moneyline != null && (
                  <span className="text-[var(--text-muted)]">
                    ML {formatMoneyline(point.row.home_moneyline)} / {formatMoneyline(point.row.away_moneyline)}
                  </span>
                )}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Footer: provider legend (multi-provider only) + muted O/U note */}
      <div className="flex items-center justify-between gap-4 mt-3 pt-2 border-t border-[var(--border)]">
        {providers.length > 1 ? (
          <div className="flex items-center gap-4 flex-wrap">
            {providers.map((provider, i) => (
              <span key={provider} className="flex items-center gap-2 text-xs">
                <span
                  className="w-4 h-0.5"
                  style={{ background: PROVIDER_COLOR_VARS[i % PROVIDER_COLOR_VARS.length] }}
                />
                <span className="text-[var(--text-secondary)]">{provider}</span>
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">{providers[0]}</span>
        )}
        {ouCaption && (
          <span className="text-xs text-[var(--text-muted)] tabular-nums">{ouCaption}</span>
        )}
      </div>
    </div>
  )
}
