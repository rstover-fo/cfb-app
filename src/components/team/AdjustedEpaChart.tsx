'use client'

import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { ChartLine } from '@phosphor-icons/react'
import rough from 'roughjs'
import { CHART_INK, resolveColor, useChartTheme } from '@/lib/charts/theme'
import { inkFor } from '@/lib/charts/series'
import { ChartFrame } from '@/lib/charts/ChartFrame'
import { ChartTooltip } from '@/lib/charts/ChartTooltip'
import type { ChartTooltipRow } from '@/lib/charts/ChartTooltip'
import { ChartLegend } from '@/lib/charts/ChartLegend'
import type { ChartLegendItem } from '@/lib/charts/ChartLegend'
import { gridLinesY, axisLabelsY, axisLabelsX } from '@/lib/charts/axes'
import type { ChartLayout } from '@/lib/charts/axes'
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
const LAYOUT: ChartLayout = { width: WIDTH, height: HEIGHT, padding: PADDING }

/** Stable wobble (spec §9): identical strokes across re-renders and theme flips. */
const ROUGH_SEED = 29

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
    const runColor = inkFor('run')
    const mutedColor = resolveColor(CHART_INK.muted)
    const surfaceColor = resolveColor(CHART_INK.surface)

    const { adjustedPoints, rawPoints } = chartGeometry

    // Raw EPA/play — recessive context line (secondary weight)
    if (rawPoints.length >= 2) {
      const line = rc.linearPath(
        rawPoints.map(p => [p.x, p.y] as [number, number]),
        { stroke: mutedColor, strokeWidth: 2, roughness: 0.6, bowing: 0.3, seed: ROUGH_SEED },
      )
      line.style.opacity = '0.55'
      group.appendChild(line)
    }
    for (const p of rawPoints) {
      const dot = rc.circle(p.x, p.y, 5, {
        fill: surfaceColor, fillStyle: 'solid',
        stroke: mutedColor, strokeWidth: 1.5, roughness: 0.5, seed: ROUGH_SEED,
      })
      dot.style.opacity = '0.55'
      group.appendChild(dot)
    }

    // Opponent-adjusted EPA — bold signature line, drawn on top (primary weight)
    if (adjustedPoints.length >= 2) {
      group.appendChild(rc.linearPath(
        adjustedPoints.map(p => [p.x, p.y] as [number, number]),
        { stroke: runColor, strokeWidth: 3, roughness: 1.0, bowing: 0.4, seed: ROUGH_SEED },
      ))
    }
    for (const p of adjustedPoints) {
      group.appendChild(rc.circle(p.x, p.y, 9, {
        fill: surfaceColor, fillStyle: 'solid',
        stroke: runColor, strokeWidth: 2, roughness: 0.5, seed: ROUGH_SEED,
      }))
    }
  }, [chartGeometry])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Redraw on theme change
  useChartTheme(drawChart)

  const hoveredWeek = hoveredIndex !== null ? weeks[hoveredIndex] : null

  const tooltipRows: ChartTooltipRow[] = []
  if (hoveredWeek) {
    if (hoveredWeek.off_epa_per_play !== null) {
      tooltipRows.push({
        swatch: 'dashed', color: 'var(--text-muted)', label: 'Raw:',
        value: hoveredWeek.off_epa_per_play.toFixed(3),
      })
    }
    if (hoveredWeek.adj_epa_off !== null) {
      tooltipRows.push({
        swatch: 'solid', color: 'var(--color-run)', label: 'Opponent-adjusted:',
        value: signed3(hoveredWeek.adj_epa_off),
      })
    }
    if (hoveredWeek.adj_epa_def !== null) {
      tooltipRows.push({ swatch: 'none', label: 'Adjusted defense:', value: signed3(hoveredWeek.adj_epa_def) })
    }
  }

  const legendItems: ChartLegendItem[] = [
    { key: 'raw', label: 'Raw', swatch: 'dashed', color: 'var(--text-muted)' },
    { key: 'adjusted', label: 'Opponent-adjusted', swatch: 'solid', color: 'var(--color-run)' },
  ]

  return (
    <ChartFrame
      ariaLabel={`Raw and opponent-adjusted offensive EPA per play by week for ${teamName || 'this team'}`}
      empty={!chartGeometry}
      emptyState={{
        icon: ChartLine,
        title: 'No adjusted EPA data yet',
        description: "Opponent-adjusted splits publish once the model has processed this week's games.",
      }}
    >
      {a11y => {
        const { getX, yTicks, zeroY } = chartGeometry!

        return (
          <>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="w-full h-auto"
              {...a11y}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Static scaffold: grid + axis labels */}
              {gridLinesY(yTicks, LAYOUT)}
              {axisLabelsY(yTicks, v => v.toFixed(2), LAYOUT)}

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
              {axisLabelsX(
                (() => {
                  const step = weeks.length > 16 ? 3 : weeks.length > 10 ? 2 : 1
                  return weeks
                    .map((w, i) => ({ w, i }))
                    .filter(({ i }) => i % step === 0 || i === weeks.length - 1)
                    .map(({ w, i }) => ({ x: getX(i), label: `W${w.week ?? w.week_index}` }))
                })(),
                LAYOUT,
              )}

              {/* Rough-drawn chart elements */}
              <g ref={roughGroupRef} data-testid="rough-layer" />

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

            <ChartTooltip
              header={hoveredWeek ? `Week ${hoveredWeek.week ?? hoveredWeek.week_index}` : undefined}
              rows={tooltipRows}
              prompt="Hover a week for details"
              minRows={3}
            />

            <ChartLegend items={legendItems} />
          </>
        )
      }}
    </ChartFrame>
  )
}
