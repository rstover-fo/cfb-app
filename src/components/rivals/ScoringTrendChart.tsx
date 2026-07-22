'use client'

import { useRef, useMemo, useCallback, useEffect, useState } from 'react'
import rough from 'roughjs'
import { Football } from '@phosphor-icons/react'
import type { MatchupGame } from '@/lib/queries/matchups'
import { CHART_INK, resolveColor, useChartTheme } from '@/lib/charts/theme'
import { teamInk } from '@/lib/charts/series'
import { ChartFrame } from '@/lib/charts/ChartFrame'
import { ChartTooltip } from '@/lib/charts/ChartTooltip'
import type { ChartTooltipRow } from '@/lib/charts/ChartTooltip'
import { ChartLegend } from '@/lib/charts/ChartLegend'
import type { ChartLegendItem } from '@/lib/charts/ChartLegend'
import { gridLinesY, axisLabelsY, axisLabelsX } from '@/lib/charts/axes'
import type { ChartLayout } from '@/lib/charts/axes'

interface TeamMeta {
  name: string
  logo: string | null
  color: string | null
}

interface ScoringTrendChartProps {
  games: MatchupGame[]
  teamAMeta: TeamMeta
  teamBMeta: TeamMeta
}

const WIDTH = 700
const HEIGHT = 350
const PADDING = { top: 30, right: 30, bottom: 50, left: 60 }
const CHART_WIDTH = WIDTH - PADDING.left - PADDING.right
const CHART_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom
const LAYOUT: ChartLayout = { width: WIDTH, height: HEIGHT, padding: PADDING }

/** Stable wobble (spec §9): identical strokes across re-renders and theme flips. */
const ROUGH_SEED = 52

// Points scored by each team in every meeting, plotted over time in the app's
// hand-drawn (roughjs) chart idiom. Redraws on theme change like TrajectoryChart.
export function ScoringTrendChart({ games, teamAMeta, teamBMeta }: ScoringTrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  // getMatchupGames returns most-recent-first; the trend reads left-to-right.
  const series = useMemo(
    () =>
      [...games]
        .reverse()
        .map(g => ({ season: g.season, a: g.teamAScore, b: g.teamBScore })),
    [games],
  )

  // Chart geometry: scales, points, ticks
  const chartGeometry = useMemo(() => {
    if (series.length === 0) return null

    const maxScore = Math.max(...series.flatMap(d => [d.a, d.b]), 10)
    const yMax = Math.ceil(maxScore / 10) * 10

    const getX = (idx: number) =>
      PADDING.left + (series.length === 1 ? CHART_WIDTH / 2 : (idx / (series.length - 1)) * CHART_WIDTH)
    const getY = (val: number) => PADDING.top + (1 - val / yMax) * CHART_HEIGHT

    const aPoints = series.map((d, i) => ({ x: getX(i), y: getY(d.a) }))
    const bPoints = series.map((d, i) => ({ x: getX(i), y: getY(d.b) }))

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => ({ pct, val: Math.round(yMax * (1 - pct)) }))

    const labelStep = series.length > 16 ? 3 : series.length > 8 ? 2 : 1
    const xTicks = series
      .map((d, i) => ({ x: getX(i), label: d.season, i }))
      .filter(({ i }) => i % labelStep === 0 || i === series.length - 1)
      .map(({ x, label }) => ({ x, label }))

    return { getX, aPoints, bPoints, yTicks, xTicks }
  }, [series])

  // Draw roughjs chart elements
  const drawChart = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group || !chartGeometry) return

    while (group.firstChild) group.removeChild(group.firstChild)

    const rc = rough.svg(svg)
    const surfaceColor = resolveColor(CHART_INK.surface)
    // Team brand colors pass through resolveColor unchanged; missing colors
    // fall back to --text-primary (A) / --text-muted (B) per spec §6.
    const colorA = teamInk(teamAMeta.color, 'primary')
    const colorB = teamInk(teamBMeta.color, 'muted')

    const drawLine = (points: { x: number; y: number }[], color: string, hierarchy: 'primary' | 'secondary') => {
      const opts =
        hierarchy === 'primary'
          ? { strokeWidth: 3, roughness: 1.0, bowing: 0.4 }
          : { strokeWidth: 2, roughness: 0.7, bowing: 0.3 }
      if (points.length >= 2) {
        group.appendChild(
          rc.linearPath(
            points.map(p => [p.x, p.y] as [number, number]),
            { stroke: color, seed: ROUGH_SEED, ...opts },
          ),
        )
      }
      for (const p of points) {
        group.appendChild(
          rc.circle(p.x, p.y, points.length === 1 ? 10 : 8, {
            fill: surfaceColor,
            fillStyle: 'solid',
            stroke: color,
            strokeWidth: 2,
            roughness: 0.5,
            seed: ROUGH_SEED,
          }),
        )
      }
    }

    // Team B drawn first (recessive), Team A on top (signature), matching
    // the TrajectoryChart hierarchy convention.
    drawLine(chartGeometry.bPoints, colorB, 'secondary')
    drawLine(chartGeometry.aPoints, colorA, 'primary')
  }, [chartGeometry, teamAMeta.color, teamBMeta.color])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  useChartTheme(drawChart)

  // HTML surfaces (tooltip/legend swatches) use the raw var(--…) token or the
  // resolved team hex directly -- CSS handles the theme flip, no resolveColor.
  const swatchColorA = teamAMeta.color || 'var(--text-primary)'
  const swatchColorB = teamBMeta.color || 'var(--text-muted)'

  const hovered = hoveredIdx != null ? series[hoveredIdx] : null

  const tooltipRows: ChartTooltipRow[] = []
  if (hovered) {
    tooltipRows.push({ swatch: 'solid', color: swatchColorA, label: `${teamAMeta.name}:`, value: String(hovered.a) })
    tooltipRows.push({ swatch: 'solid', color: swatchColorB, label: `${teamBMeta.name}:`, value: String(hovered.b) })
  }

  const legendItems: ChartLegendItem[] = [
    { key: 'a', label: teamAMeta.name, swatch: 'solid', color: swatchColorA },
    { key: 'b', label: teamBMeta.name, swatch: 'solid', color: swatchColorB },
  ]

  return (
    <ChartFrame
      ariaLabel={`Points scored by ${teamAMeta.name} and ${teamBMeta.name} in each meeting`}
      empty={!chartGeometry}
      emptyState={{
        icon: Football,
        title: 'Not enough scoring data to chart this matchup',
        description: 'Scoring trends publish once these teams have met on the field.',
      }}
    >
      {a11y => {
        const { getX, yTicks, xTicks } = chartGeometry!

        return (
          <>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="w-full h-auto"
              {...a11y}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Static scaffold: grid + axis labels */}
              {gridLinesY(yTicks, LAYOUT)}
              {axisLabelsY(yTicks, v => String(v), LAYOUT)}
              {axisLabelsX(xTicks, LAYOUT)}

              {/* Rough-drawn chart elements */}
              <g ref={roughGroupRef} data-testid="rough-layer" />

              {/* Interactive hover areas */}
              {series.map((_, i) => (
                <rect
                  key={i}
                  x={getX(i) - CHART_WIDTH / series.length / 2}
                  y={PADDING.top}
                  width={CHART_WIDTH / series.length}
                  height={CHART_HEIGHT}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIdx(i)}
                />
              ))}

              {/* Hover crosshair */}
              {hoveredIdx != null && (
                <line
                  x1={getX(hoveredIdx)}
                  y1={PADDING.top}
                  x2={getX(hoveredIdx)}
                  y2={PADDING.top + CHART_HEIGHT}
                  stroke="var(--text-muted)"
                  strokeWidth={1}
                  strokeDasharray="4 2"
                  opacity={0.6}
                />
              )}
            </svg>

            <ChartTooltip
              header={hovered ? String(hovered.season) : undefined}
              rows={tooltipRows}
              prompt="Hover a meeting for details"
              minRows={2}
            />

            <ChartLegend items={legendItems} />
          </>
        )
      }}
    </ChartFrame>
  )
}
