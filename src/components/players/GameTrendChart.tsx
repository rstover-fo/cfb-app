'use client'

import { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import rough from 'roughjs'
import type { PlayerGameLogEntry } from '@/lib/types/database'

interface GameTrendChartProps {
  gameLog: PlayerGameLogEntry[]
  statKey?: 'epa_per_play' | 'total_yards' | 'success_rate'
}

const CHART_WIDTH = 700
const CHART_HEIGHT = 280
const PADDING = { top: 20, right: 30, bottom: 40, left: 60 }

const PLOT_WIDTH = CHART_WIDTH - PADDING.left - PADDING.right
const PLOT_HEIGHT = CHART_HEIGHT - PADDING.top - PADDING.bottom

const STAT_LABELS: Record<string, string> = {
  epa_per_play: 'EPA / Play',
  total_yards: 'Total Yards',
  success_rate: 'Success Rate',
}

function resolveColor(cssVar: string): string {
  if (typeof document === 'undefined') return '#999'
  const match = cssVar.match(/var\((.+)\)/)
  if (!match) return cssVar
  return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || '#999'
}

/**
 * Deduplicate game log by game_id, keeping the entry with the most plays
 * per game (primary play category).
 */
function deduplicateByGame(entries: PlayerGameLogEntry[]): PlayerGameLogEntry[] {
  const byGame = new Map<number, PlayerGameLogEntry>()
  for (const entry of entries) {
    const existing = byGame.get(entry.game_id)
    if (!existing || entry.plays > existing.plays) {
      byGame.set(entry.game_id, entry)
    }
  }
  // Sort by week for chronological order
  return Array.from(byGame.values()).sort((a, b) => (a.week ?? 0) - (b.week ?? 0))
}

export function GameTrendChart({ gameLog, statKey = 'epa_per_play' }: GameTrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // Deduplicate and sort entries -- memoize to prevent redraw loops
  const entries = useMemo(() => deduplicateByGame(gameLog), [gameLog])

  // Compute scale boundaries
  const { minVal, maxVal, seasonAvg } = useMemo(() => {
    if (entries.length === 0) return { minVal: 0, maxVal: 1, seasonAvg: 0 }

    const values = entries.map((e) => e[statKey] ?? 0)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const avg = values.reduce((s, v) => s + v, 0) / values.length

    // Add padding to y-axis range
    const range = max - min || 1
    const yPad = range * 0.15
    return {
      minVal: statKey === 'epa_per_play' ? Math.min(min - yPad, -0.1) : Math.max(0, min - yPad),
      maxVal: max + yPad,
      seasonAvg: avg,
    }
  }, [entries, statKey])

  // Map data index to pixel coordinates
  const getPoint = useCallback(
    (index: number): [number, number] => {
      const xStep = entries.length > 1 ? PLOT_WIDTH / (entries.length - 1) : PLOT_WIDTH / 2
      const x = PADDING.left + index * xStep
      const value = entries[index]?.[statKey] ?? 0
      const yNorm = (value - minVal) / (maxVal - minVal || 1)
      const y = PADDING.top + PLOT_HEIGHT * (1 - yNorm)
      return [x, y]
    },
    [entries, statKey, minVal, maxVal]
  )

  const drawChart = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group || entries.length === 0) return

    // Clear previous drawings
    while (group.firstChild) group.removeChild(group.firstChild)

    const rc = rough.svg(svg)
    const lineColor = resolveColor('var(--color-run)')
    const refColor = resolveColor('var(--text-muted)')

    // Draw reference line (y=0 for EPA, season average for others)
    const refValue = statKey === 'epa_per_play' ? 0 : seasonAvg
    const refYNorm = (refValue - minVal) / (maxVal - minVal || 1)
    const refY = PADDING.top + PLOT_HEIGHT * (1 - refYNorm)

    if (refY >= PADDING.top && refY <= PADDING.top + PLOT_HEIGHT) {
      group.appendChild(
        rc.line(PADDING.left, refY, PADDING.left + PLOT_WIDTH, refY, {
          stroke: refColor,
          strokeWidth: 1,
          roughness: 0.5,
          strokeLineDash: [6, 4],
        })
      )
    }

    // Build line points
    const linePoints: [number, number][] = entries.map((_, i) => getPoint(i))

    // Draw line connecting points
    if (linePoints.length > 1) {
      group.appendChild(
        rc.linearPath(linePoints, {
          stroke: lineColor,
          strokeWidth: 3,
          roughness: 1.0,
          bowing: 0.4,
        })
      )
    }

    // Draw data dots
    for (const [x, y] of linePoints) {
      group.appendChild(
        rc.circle(x, y, 10, {
          fill: lineColor,
          fillStyle: 'solid',
          stroke: lineColor,
          strokeWidth: 1.5,
          roughness: 0.5,
        })
      )
    }
  }, [entries, statKey, minVal, maxVal, seasonAvg, getPoint])

  // Draw on mount and data changes
  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Theme change detection
  useEffect(() => {
    const observer = new MutationObserver(() => {
      requestAnimationFrame(drawChart)
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
    return () => observer.disconnect()
  }, [drawChart])

  // Tooltip event delegation via mouseover/mouseout on the SVG
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || entries.length === 0) return

    function handleMouseOver(e: MouseEvent) {
      const target = (e.target as Element).closest('[data-point-index]')
      if (!target) {
        setHoveredIndex(null)
        return
      }
      const idx = parseInt(target.getAttribute('data-point-index') || '-1', 10)
      if (idx >= 0 && idx < entries.length) {
        setHoveredIndex(idx)
      }
    }

    function handleMouseOut(e: MouseEvent) {
      const related = e.relatedTarget as Element | null
      if (related && svg?.contains(related)) return
      setHoveredIndex(null)
    }

    svg.addEventListener('mouseover', handleMouseOver as EventListener)
    svg.addEventListener('mouseout', handleMouseOut as EventListener)

    return () => {
      svg.removeEventListener('mouseover', handleMouseOver as EventListener)
      svg.removeEventListener('mouseout', handleMouseOut as EventListener)
    }
  }, [entries])

  // Compute y-axis tick values
  const yTicks = useMemo(() => {
    const tickCount = 5
    const ticks: number[] = []
    for (let i = 0; i <= tickCount; i++) {
      ticks.push(minVal + (i / tickCount) * (maxVal - minVal))
    }
    return ticks
  }, [minVal, maxVal])

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-[var(--text-muted)] text-sm">
        No game log data available
      </div>
    )
  }

  // Tooltip data
  const hoveredEntry = hoveredIndex !== null ? entries[hoveredIndex] : null
  const hoveredPoint = hoveredIndex !== null ? getPoint(hoveredIndex) : null

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Game trend chart showing ${STAT_LABELS[statKey]} over the season`}
      >
        {/* Y-axis labels */}
        {yTicks.map((tick, i) => {
          const yNorm = (tick - minVal) / (maxVal - minVal || 1)
          const y = PADDING.top + PLOT_HEIGHT * (1 - yNorm)
          return (
            <g key={`ytick-${i}`}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={PADDING.left + PLOT_WIDTH}
                y2={y}
                stroke="var(--border)"
                strokeWidth={0.5}
                opacity={0.3}
              />
              <text
                x={PADDING.left - 8}
                y={y}
                fill="var(--text-muted)"
                fontSize={10}
                fontFamily="var(--font-body)"
                textAnchor="end"
                dominantBaseline="middle"
                className="tabular-nums"
              >
                {statKey === 'success_rate'
                  ? `${(tick * 100).toFixed(0)}%`
                  : tick.toFixed(statKey === 'epa_per_play' ? 2 : 0)}
              </text>
            </g>
          )
        })}

        {/* Y-axis label */}
        <text
          x={14}
          y={PADDING.top + PLOT_HEIGHT / 2}
          fill="var(--text-muted)"
          fontSize={10}
          fontFamily="var(--font-body)"
          textAnchor="middle"
          transform={`rotate(-90, 14, ${PADDING.top + PLOT_HEIGHT / 2})`}
        >
          {STAT_LABELS[statKey]}
        </text>

        {/* X-axis labels */}
        {entries.map((entry, i) => {
          const [x] = getPoint(i)
          return (
            <text
              key={`xlabel-${i}`}
              x={x}
              y={CHART_HEIGHT - 8}
              fill="var(--text-muted)"
              fontSize={10}
              fontFamily="var(--font-body)"
              textAnchor="middle"
            >
              {entry.week != null ? `Wk ${entry.week}` : `G${i + 1}`}
            </text>
          )
        })}

        {/* Reference line label */}
        {(() => {
          const refValue = statKey === 'epa_per_play' ? 0 : seasonAvg
          const refYNorm = (refValue - minVal) / (maxVal - minVal || 1)
          const refY = PADDING.top + PLOT_HEIGHT * (1 - refYNorm)
          if (refY < PADDING.top || refY > PADDING.top + PLOT_HEIGHT) return null
          return (
            <text
              x={PADDING.left + PLOT_WIDTH + 4}
              y={refY}
              fill="var(--text-muted)"
              fontSize={9}
              fontFamily="var(--font-body)"
              dominantBaseline="middle"
              className="tabular-nums"
            >
              {statKey === 'epa_per_play' ? '0' : 'avg'}
            </text>
          )
        })()}

        {/* roughjs drawings */}
        <g ref={roughGroupRef} />

        {/* Invisible hit areas for tooltip -- layered above rough drawings */}
        {entries.map((_, i) => {
          const [x, y] = getPoint(i)
          return (
            <circle
              key={`hit-${i}`}
              cx={x}
              cy={y}
              r={14}
              fill="transparent"
              data-point-index={i}
              style={{ cursor: 'pointer' }}
            />
          )
        })}

        {/* Hover highlight ring */}
        {hoveredPoint && (
          <circle
            cx={hoveredPoint[0]}
            cy={hoveredPoint[1]}
            r={8}
            fill="none"
            stroke="var(--text-primary)"
            strokeWidth={2}
            opacity={0.6}
            pointerEvents="none"
          />
        )}
      </svg>

      {/* Tooltip */}
      {hoveredEntry && hoveredPoint && (
        <div
          className="absolute bg-[var(--bg-surface)] text-[var(--text-primary)] text-sm px-4 py-3 rounded border border-[var(--border)] shadow-lg pointer-events-none z-10"
          style={{
            left: `${(hoveredPoint[0] / CHART_WIDTH) * 100}%`,
            top: `${((hoveredPoint[1] - 20) / CHART_HEIGHT) * 100}%`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <p className="font-headline text-base mb-1">
            {hoveredEntry.week != null ? `Week ${hoveredEntry.week}` : 'Game'}{' '}
            {hoveredEntry.opponent ? `vs ${hoveredEntry.opponent}` : ''}
          </p>
          {hoveredEntry.result && (
            <p className="text-[var(--text-secondary)] text-xs mb-1">{hoveredEntry.result}</p>
          )}
          <p className="text-[var(--text-secondary)] tabular-nums">
            EPA: {(hoveredEntry.epa_per_play ?? 0).toFixed(3)}
          </p>
          <p className="text-[var(--text-muted)] text-xs tabular-nums">
            {hoveredEntry.total_yards ?? 0} yds &middot; {hoveredEntry.plays} plays &middot;{' '}
            {((hoveredEntry.success_rate ?? 0) * 100).toFixed(0)}% success
          </p>
        </div>
      )}
    </div>
  )
}
