'use client'

import { useRef, useMemo, useCallback, useEffect, useState } from 'react'
import rough from 'roughjs'
import type { MatchupGame } from '@/lib/queries/matchups'
import { resolveColor, useChartTheme } from '@/lib/charts/theme'

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
const HEIGHT = 320
const PADDING = { top: 24, right: 24, bottom: 44, left: 44 }
const CHART_WIDTH = WIDTH - PADDING.left - PADDING.right
const CHART_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom

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
    [games]
  )

  const geometry = useMemo(() => {
    if (series.length === 0) return null

    const maxScore = Math.max(...series.flatMap(d => [d.a, d.b]), 10)
    const yMax = Math.ceil(maxScore / 10) * 10

    const getX = (idx: number) =>
      PADDING.left + (series.length === 1 ? CHART_WIDTH / 2 : (idx / (series.length - 1)) * CHART_WIDTH)
    const getY = (val: number) => PADDING.top + (1 - val / yMax) * CHART_HEIGHT

    const aPoints = series.map((d, i) => ({ x: getX(i), y: getY(d.a) }))
    const bPoints = series.map((d, i) => ({ x: getX(i), y: getY(d.b) }))

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => ({ pct, val: Math.round(yMax * (1 - pct)) }))

    return { getX, getY, aPoints, bPoints, yMax, yTicks }
  }, [series])

  const drawChart = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group || !geometry) return

    while (group.firstChild) group.removeChild(group.firstChild)

    const rc = rough.svg(svg)
    const surfaceColor = resolveColor('var(--bg-surface)')
    const colorA = teamAMeta.color || resolveColor('var(--color-run)')
    const colorB = teamBMeta.color || resolveColor('var(--color-pass)')

    const drawLine = (points: { x: number; y: number }[], color: string) => {
      if (points.length >= 2) {
        group.appendChild(
          rc.linearPath(
            points.map(p => [p.x, p.y] as [number, number]),
            { stroke: color, strokeWidth: 2.5, roughness: 0.9, bowing: 0.4 }
          )
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
          })
        )
      }
    }

    drawLine(geometry.bPoints, colorB)
    drawLine(geometry.aPoints, colorA)
  }, [geometry, teamAMeta.color, teamBMeta.color])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  useChartTheme(drawChart)

  if (!geometry || series.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)] py-8 text-center">
        Not enough scoring data to chart this matchup.
      </p>
    )
  }

  const { getX, yTicks } = geometry
  const labelStep = series.length > 16 ? 3 : series.length > 8 ? 2 : 1
  const hovered = hoveredIdx != null ? series[hoveredIdx] : null

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Points scored by ${teamAMeta.name} and ${teamBMeta.name} in each meeting`}
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {/* Grid + Y labels */}
        {yTicks.map(({ pct, val }) => (
          <g key={pct}>
            <line
              x1={PADDING.left}
              y1={PADDING.top + pct * CHART_HEIGHT}
              x2={WIDTH - PADDING.right}
              y2={PADDING.top + pct * CHART_HEIGHT}
              stroke="var(--border)"
              strokeWidth={1}
              opacity={0.4}
            />
            <text
              x={PADDING.left - 8}
              y={PADDING.top + pct * CHART_HEIGHT}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-[var(--text-muted)] text-xs"
            >
              {val}
            </text>
          </g>
        ))}

        {/* X labels */}
        {series.map((d, i) =>
          i % labelStep === 0 || i === series.length - 1 ? (
            <text
              key={i}
              x={getX(i)}
              y={HEIGHT - 14}
              textAnchor="middle"
              className="fill-[var(--text-muted)] text-xs"
            >
              {d.season}
            </text>
          ) : null
        )}

        <g ref={roughGroupRef} />

        {/* Hover targets + crosshair */}
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

      {/* Tooltip */}
      {hovered && (
        <div className="mt-2 p-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-sm text-sm">
          <p className="font-headline text-base text-[var(--text-primary)] mb-2 tabular-nums">
            {hovered.season}
          </p>
          <div className="space-y-1">
            <p className="flex items-center gap-2">
              <span
                className="w-3 h-0.5"
                style={{ backgroundColor: teamAMeta.color || 'var(--color-run)' }}
              />
              <span className="text-[var(--text-secondary)]">{teamAMeta.name}:</span>
              <span className="text-[var(--text-primary)] font-medium tabular-nums">{hovered.a}</span>
            </p>
            <p className="flex items-center gap-2">
              <span
                className="w-3 h-0.5"
                style={{ backgroundColor: teamBMeta.color || 'var(--color-pass)' }}
              />
              <span className="text-[var(--text-secondary)]">{teamBMeta.name}:</span>
              <span className="text-[var(--text-primary)] font-medium tabular-nums">{hovered.b}</span>
            </p>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-3 pt-2 border-t border-[var(--border)]">
        <span className="flex items-center gap-2 text-xs">
          <span
            className="w-4 h-0.5"
            style={{ backgroundColor: teamAMeta.color || 'var(--color-run)' }}
          />
          <span className="text-[var(--text-secondary)]">{teamAMeta.name}</span>
        </span>
        <span className="flex items-center gap-2 text-xs">
          <span
            className="w-4 h-0.5"
            style={{ backgroundColor: teamBMeta.color || 'var(--color-pass)' }}
          />
          <span className="text-[var(--text-secondary)]">{teamBMeta.name}</span>
        </span>
      </div>
    </div>
  )
}
