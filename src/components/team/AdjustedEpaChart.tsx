'use client'

import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import rough from 'roughjs'
import { resolveColor, useChartTheme } from '@/lib/charts/theme'
import type { TeamWeekFeature } from '@/lib/queries/playcalling'

interface AdjustedEpaChartProps {
  features: TeamWeekFeature[]
  /** Team display name, used to build a meaningful chart aria-label. */
  teamName?: string
}

const WIDTH = 700
const HEIGHT = 320
const PADDING = { top: 24, right: 24, bottom: 44, left: 56 }
const CHART_WIDTH = WIDTH - PADDING.left - PADDING.right
const CHART_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom

function signed3(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(3)
}

/**
 * Raw vs opponent-adjusted offensive EPA/play across the season, on one axis:
 * the raw series is drawn as a recessive muted context line, the adjusted
 * series as the bold signature stroke, with a shared zero baseline so the
 * schedule-strength correction reads as the gap between the two lines.
 */
export function AdjustedEpaChart({ features, teamName }: AdjustedEpaChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)

  // Weeks with at least one of the two series present, in week_index order.
  const weeks = useMemo(
    () =>
      features
        .filter(w => w.adj_epa_off !== null || w.off_epa_per_play !== null)
        .sort((a, b) => a.week_index - b.week_index),
    [features],
  )

  // Chart geometry: scales, per-series points, ticks, zero baseline
  const chartGeometry = useMemo(() => {
    if (weeks.length === 0) return null

    const values = [
      ...weeks.map(w => w.adj_epa_off).filter((v): v is number => v !== null),
      ...weeks.map(w => w.off_epa_per_play).filter((v): v is number => v !== null),
      0, // always keep the zero baseline in frame
    ]
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)
    const valueRange = maxVal - minVal || 1
    const valuePadding = valueRange * 0.12

    const getX = (index: number) =>
      PADDING.left + (weeks.length === 1 ? CHART_WIDTH / 2 : (index / (weeks.length - 1)) * CHART_WIDTH)
    const getY = (val: number) => {
      const normalized = (val - (minVal - valuePadding)) / (valueRange + valuePadding * 2)
      return PADDING.top + (1 - normalized) * CHART_HEIGHT
    }

    const adjustedPoints = weeks
      .map((w, i) => ({ x: getX(i), y: w.adj_epa_off !== null ? getY(w.adj_epa_off) : null }))
      .filter((p): p is { x: number; y: number } => p.y !== null)
    const rawPoints = weeks
      .map((w, i) => ({ x: getX(i), y: w.off_epa_per_play !== null ? getY(w.off_epa_per_play) : null }))
      .filter((p): p is { x: number; y: number } => p.y !== null)

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
      pct,
      val: maxVal + valuePadding - pct * (valueRange + valuePadding * 2),
    }))

    return { getX, adjustedPoints, rawPoints, yTicks, zeroY: getY(0) }
  }, [weeks])

  // Draw roughjs chart elements
  const drawChart = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group || !chartGeometry) return

    while (group.firstChild) group.removeChild(group.firstChild)

    const rc = rough.svg(svg)
    const runColor = resolveColor('var(--color-run)')
    const mutedColor = resolveColor('var(--text-muted)')
    const surfaceColor = resolveColor('var(--bg-surface)')

    const { adjustedPoints, rawPoints } = chartGeometry

    // Raw EPA/play — recessive context line
    if (rawPoints.length >= 2) {
      const line = rc.linearPath(
        rawPoints.map(p => [p.x, p.y] as [number, number]),
        { stroke: mutedColor, strokeWidth: 2, roughness: 0.6, bowing: 0.3 },
      )
      line.style.opacity = '0.55'
      group.appendChild(line)
    }
    for (const p of rawPoints) {
      const dot = rc.circle(p.x, p.y, 5, {
        fill: surfaceColor, fillStyle: 'solid',
        stroke: mutedColor, strokeWidth: 1.5, roughness: 0.5,
      })
      dot.style.opacity = '0.55'
      group.appendChild(dot)
    }

    // Opponent-adjusted EPA — bold signature line, drawn on top
    if (adjustedPoints.length >= 2) {
      group.appendChild(rc.linearPath(
        adjustedPoints.map(p => [p.x, p.y] as [number, number]),
        { stroke: runColor, strokeWidth: 3, roughness: 1.0, bowing: 0.4 },
      ))
    }
    for (const p of adjustedPoints) {
      group.appendChild(rc.circle(p.x, p.y, 9, {
        fill: surfaceColor, fillStyle: 'solid',
        stroke: runColor, strokeWidth: 2, roughness: 0.5,
      }))
    }
  }, [chartGeometry])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Redraw on theme change
  useChartTheme(drawChart)

  if (!chartGeometry || weeks.length === 0) return null

  const { getX, yTicks, zeroY } = chartGeometry
  const hoveredWeek = hoveredIndex !== null ? weeks[hoveredIndex] : null

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-4">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Raw and opponent-adjusted offensive EPA per play by week for ${teamName || 'this team'}`}
        onMouseLeave={() => setHoveredIndex(null)}
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

        {/* Y-axis labels */}
        {yTicks.map(({ pct, val }) => (
          <text
            key={pct}
            x={PADDING.left - 10}
            y={PADDING.top + pct * CHART_HEIGHT}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-[var(--text-muted)] text-xs tabular-nums"
          >
            {val.toFixed(2)}
          </text>
        ))}

        {/* Zero baseline — average FBS offense */}
        <line
          data-testid="zero-baseline"
          x1={PADDING.left}
          y1={zeroY}
          x2={WIDTH - PADDING.right}
          y2={zeroY}
          stroke="var(--text-muted)"
          strokeWidth={1}
          strokeDasharray="6 4"
          opacity={0.6}
        />

        {/* X-axis labels — week number, thinned to prevent overlap */}
        {(() => {
          const step = weeks.length > 16 ? 3 : weeks.length > 10 ? 2 : 1
          return weeks
            .map((w, i) => ({ w, i }))
            .filter(({ i }) => i % step === 0 || i === weeks.length - 1)
            .map(({ w, i }) => (
              <text
                key={w.week_index}
                x={getX(i)}
                y={HEIGHT - 15}
                textAnchor="middle"
                className="fill-[var(--text-muted)] text-xs"
              >
                {`W${w.week ?? w.week_index}`}
              </text>
            ))
        })()}

        {/* Rough-drawn chart elements */}
        <g ref={roughGroupRef} />

        {/* Interactive hover areas */}
        {weeks.map((w, i) => (
          <rect
            key={w.week_index}
            x={getX(i) - CHART_WIDTH / weeks.length / 2}
            y={PADDING.top}
            width={CHART_WIDTH / weeks.length}
            height={CHART_HEIGHT}
            fill="transparent"
            onMouseEnter={() => setHoveredIndex(i)}
          />
        ))}

        {/* Hover crosshair */}
        {hoveredIndex !== null && (
          <line
            x1={getX(hoveredIndex)}
            y1={PADDING.top}
            x2={getX(hoveredIndex)}
            y2={PADDING.top + CHART_HEIGHT}
            stroke="var(--text-muted)"
            strokeWidth={1}
            strokeDasharray="4 2"
            opacity={0.6}
          />
        )}
      </svg>

      {/* Tooltip */}
      {hoveredWeek && (
        <div className="mt-2 p-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-sm">
          <p className="font-headline text-base text-[var(--text-primary)] mb-2">
            {`Week ${hoveredWeek.week ?? hoveredWeek.week_index}`}
          </p>
          <div className="space-y-1">
            {hoveredWeek.off_epa_per_play !== null && (
              <p className="flex items-center gap-2">
                <span className="w-3 h-0.5 bg-[var(--text-muted)] opacity-60" />
                <span className="text-[var(--text-secondary)]">Raw:</span>
                <span className="text-[var(--text-primary)] font-medium tabular-nums">
                  {hoveredWeek.off_epa_per_play.toFixed(3)}
                </span>
              </p>
            )}
            {hoveredWeek.adj_epa_off !== null && (
              <p className="flex items-center gap-2">
                <span className="w-3 h-0.5 bg-[var(--color-run)]" />
                <span className="text-[var(--text-secondary)]">Opponent-adjusted:</span>
                <span className="text-[var(--text-primary)] font-medium tabular-nums">
                  {signed3(hoveredWeek.adj_epa_off)}
                </span>
              </p>
            )}
            {hoveredWeek.adj_epa_def !== null && (
              <p className="flex items-center gap-2">
                <span className="w-3" />
                <span className="text-[var(--text-secondary)]">Adjusted defense:</span>
                <span className="text-[var(--text-primary)] tabular-nums">
                  {signed3(hoveredWeek.adj_epa_def)}
                </span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-3 pt-2 border-t border-[var(--border)]">
        <span className="flex items-center gap-2 text-xs">
          <span className="w-4 h-0.5 bg-[var(--text-muted)] opacity-60" />
          <span className="text-[var(--text-secondary)]">Raw</span>
        </span>
        <span className="flex items-center gap-2 text-xs">
          <span className="w-4 h-0.5 bg-[var(--color-run)]" />
          <span className="text-[var(--text-secondary)]">Opponent-adjusted</span>
        </span>
      </div>
    </div>
  )
}
