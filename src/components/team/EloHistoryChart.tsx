'use client'

import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { TrendUp } from '@phosphor-icons/react'
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
import type { TeamEloGamePoint } from '@/lib/queries/predictions'

interface EloHistoryChartProps {
  history: TeamEloGamePoint[]
  /** Team display name, used to build a meaningful chart aria-label. */
  teamName?: string
}

const WIDTH = 700
const HEIGHT = 300
const PADDING = { top: 24, right: 24, bottom: 44, left: 52 }
const CHART_WIDTH = WIDTH - PADDING.left - PADDING.right
const CHART_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom
const LAYOUT: ChartLayout = { width: WIDTH, height: HEIGHT, padding: PADDING }

/** Stable wobble (spec §9): identical strokes across re-renders and theme flips. */
const ROUGH_SEED = 17

// history has no explicit result field (game_elo_history is Elo-grain, not
// score-grain), so win/loss for the per-game dot color is read off the Elo
// system's own convention instead: a team's Elo rises on a win and falls on
// a loss (K-factor adjustment is signed by the game outcome), so
// postgame >= pregame is a win.
function isWin(point: TeamEloGamePoint): boolean {
  return point.postgame_elo >= point.pregame_elo
}

function formatOpponent(point: TeamEloGamePoint): string {
  return `${point.is_home ? 'vs' : '@'} ${point.opponent}`
}

export function EloHistoryChart({ history, teamName }: EloHistoryChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)

  // Chart geometry: scales, points, ticks
  const chartGeometry = useMemo(() => {
    if (history.length === 0) return null

    const values = history.map(p => p.postgame_elo)
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)
    const valueRange = maxVal - minVal || 1
    const valuePadding = valueRange * 0.15

    const getX = (index: number) =>
      PADDING.left + (history.length === 1 ? CHART_WIDTH / 2 : (index / (history.length - 1)) * CHART_WIDTH)
    const getY = (val: number) => {
      const normalized = (val - (minVal - valuePadding)) / (valueRange + valuePadding * 2)
      return PADDING.top + (1 - normalized) * CHART_HEIGHT
    }

    const points = history.map((p, i) => ({
      x: getX(i),
      y: getY(p.postgame_elo),
      index: i,
      win: isWin(p),
    }))

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
      pct,
      val: maxVal + valuePadding - pct * (valueRange + valuePadding * 2),
    }))

    return { getX, points, yTicks }
  }, [history])

  // Draw roughjs chart elements
  const drawChart = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group || !chartGeometry) return

    while (group.firstChild) group.removeChild(group.firstChild)

    const rc = rough.svg(svg)
    const runColor = inkFor('run')
    const positiveColor = inkFor('positive')
    const negativeColor = inkFor('negative')
    const surfaceColor = resolveColor(CHART_INK.surface)

    const { points } = chartGeometry

    // Postgame Elo line (primary weight)
    if (points.length >= 2) {
      const line = rc.linearPath(
        points.map(p => [p.x, p.y] as [number, number]),
        { stroke: runColor, strokeWidth: 3, roughness: 1.0, bowing: 0.4, seed: ROUGH_SEED },
      )
      group.appendChild(line)
    }

    // Data dots — colored by win/loss. Roughness 0.5 (below the series
    // hierarchy default, spec §9): the default distorts 10px circles.
    for (const p of points) {
      const dotColor = p.win ? positiveColor : negativeColor
      group.appendChild(rc.circle(p.x, p.y, 10, {
        fill: surfaceColor, fillStyle: 'solid',
        stroke: dotColor, strokeWidth: 2.5, roughness: 0.5, seed: ROUGH_SEED,
      }))
    }
  }, [chartGeometry])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Redraw on theme change
  useChartTheme(drawChart)

  const hoveredPoint = hoveredIndex != null ? history[hoveredIndex] : null

  const ariaLabel = chartGeometry
    ? `Elo rating by game for ${teamName || 'this team'} across the season, from ${Math.round(history[0].pregame_elo)} to ${Math.round(history[history.length - 1].postgame_elo)}`
    : `Elo rating by game for ${teamName || 'this team'}`

  const tooltipRows: ChartTooltipRow[] = []
  if (hoveredPoint) {
    tooltipRows.push({ swatch: 'none', label: 'Pregame:', value: String(Math.round(hoveredPoint.pregame_elo)) })
    tooltipRows.push({
      swatch: 'solid',
      color: isWin(hoveredPoint) ? 'var(--color-positive)' : 'var(--color-negative)',
      label: 'Postgame:',
      value: String(Math.round(hoveredPoint.postgame_elo)),
    })
    if (hoveredPoint.team_win_prob != null) {
      tooltipRows.push({ swatch: 'none', label: 'Win prob:', value: `${Math.round(hoveredPoint.team_win_prob * 100)}%` })
    }
  }

  // Dot-color key: game dots ink positive on wins, negative on losses --
  // without a legend that encoding is invisible until first hover.
  const legendItems: ChartLegendItem[] = [
    { key: 'win', label: 'Win', swatch: 'solid', color: 'var(--color-positive)' },
    { key: 'loss', label: 'Loss', swatch: 'solid', color: 'var(--color-negative)' },
  ]

  return (
    <ChartFrame
      ariaLabel={ariaLabel}
      empty={!chartGeometry}
      emptyState={{
        icon: TrendUp,
        title: 'No Elo history for this team',
        description: "Game-by-game ratings publish after the team's first tracked matchup this season.",
      }}
    >
      {a11y => {
        const { getX, yTicks, points } = chartGeometry!
        const step = history.length > 16 ? 3 : history.length > 10 ? 2 : 1
        const xTicks = history
          .map((p, i) => ({ p, i }))
          .filter(({ i }) => i % step === 0 || i === history.length - 1)
          .map(({ p, i }) => ({ x: getX(i), label: `W${p.week}` }))

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
              {axisLabelsY(yTicks, v => String(Math.round(v)), LAYOUT)}
              {axisLabelsX(xTicks, LAYOUT)}

              {/* Rough-drawn chart elements */}
              <g ref={roughGroupRef} data-testid="rough-layer" />

              {/* Interactive hover areas */}
              {points.map(p => (
                <rect
                  key={p.index}
                  x={p.x - CHART_WIDTH / history.length / 2}
                  y={PADDING.top}
                  width={CHART_WIDTH / history.length}
                  height={CHART_HEIGHT}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIndex(p.index)}
                />
              ))}

              {/* Hover crosshair */}
              {hoveredIndex != null && (
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
              header={hoveredPoint ? `Week ${hoveredPoint.week} · ${formatOpponent(hoveredPoint)}` : undefined}
              rows={tooltipRows}
              prompt="Hover a game for details"
              minRows={3}
            />

            <ChartLegend items={legendItems} />
          </>
        )
      }}
    </ChartFrame>
  )
}
