'use client'

import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import rough from 'roughjs'
import { resolveColor, useChartTheme } from '@/lib/charts/theme'
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
    const runColor = resolveColor('var(--color-run)')
    const positiveColor = resolveColor('var(--color-positive)')
    const negativeColor = resolveColor('var(--color-negative)')
    const surfaceColor = resolveColor('var(--bg-surface)')

    const { points } = chartGeometry

    // Postgame Elo line
    if (points.length >= 2) {
      const line = rc.linearPath(
        points.map(p => [p.x, p.y] as [number, number]),
        { stroke: runColor, strokeWidth: 3, roughness: 1.0, bowing: 0.4 },
      )
      group.appendChild(line)
    }

    // Data dots — colored by win/loss
    for (const p of points) {
      const dotColor = p.win ? positiveColor : negativeColor
      group.appendChild(rc.circle(p.x, p.y, 10, {
        fill: surfaceColor, fillStyle: 'solid',
        stroke: dotColor, strokeWidth: 2.5, roughness: 0.5,
      }))
    }
  }, [chartGeometry])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Redraw on theme change
  useChartTheme(drawChart)

  if (!chartGeometry || history.length === 0) return null

  const { getX, yTicks, points } = chartGeometry
  const hoveredPoint = hoveredIndex != null ? history[hoveredIndex] : null

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-4">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Elo rating by game for ${teamName || 'this team'} across the season, from ${Math.round(history[0].pregame_elo)} to ${Math.round(history[history.length - 1].postgame_elo)}`}
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
            className="fill-[var(--text-muted)] text-xs"
          >
            {Math.round(val)}
          </text>
        ))}

        {/* X-axis labels — week number, thinned to prevent overlap */}
        {(() => {
          const step = history.length > 16 ? 3 : history.length > 10 ? 2 : 1
          return history
            .map((p, i) => ({ p, i }))
            .filter(({ i }) => i % step === 0 || i === history.length - 1)
            .map(({ p, i }) => (
              <text
                key={p.game_id}
                x={getX(i)}
                y={HEIGHT - 15}
                textAnchor="middle"
                className="fill-[var(--text-muted)] text-xs"
              >
                {`W${p.week}`}
              </text>
            ))
        })()}

        {/* Rough-drawn chart elements */}
        <g ref={roughGroupRef} />

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

      {/* Tooltip */}
      {hoveredPoint && (
        <div className="mt-2 p-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-sm">
          <p className="font-headline text-base text-[var(--text-primary)] mb-1">
            Week {hoveredPoint.week} · {formatOpponent(hoveredPoint)}
          </p>
          <div className="space-y-1">
            <p className="flex items-center gap-2">
              <span className="text-[var(--text-secondary)]">Pregame:</span>
              <span className="text-[var(--text-primary)] font-medium tabular-nums">{Math.round(hoveredPoint.pregame_elo)}</span>
            </p>
            <p className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full border-2"
                style={{ borderColor: isWin(hoveredPoint) ? 'var(--color-positive)' : 'var(--color-negative)' }}
              />
              <span className="text-[var(--text-secondary)]">Postgame:</span>
              <span className="text-[var(--text-primary)] font-medium tabular-nums">{Math.round(hoveredPoint.postgame_elo)}</span>
            </p>
            {hoveredPoint.team_win_prob != null && (
              <p className="flex items-center gap-2">
                <span className="text-[var(--text-secondary)]">Win prob:</span>
                <span className="text-[var(--text-primary)]">{Math.round(hoveredPoint.team_win_prob * 100)}%</span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
