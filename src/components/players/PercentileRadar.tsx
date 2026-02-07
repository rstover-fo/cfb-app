'use client'

import { useRef, useEffect, useCallback, useMemo } from 'react'
import rough from 'roughjs'
import type { PlayerPercentiles } from '@/lib/types/database'

interface PercentileRadarProps {
  percentiles: PlayerPercentiles
}

interface RadarAxis {
  label: string
  pctlKey: keyof PlayerPercentiles
}

const CENTER_X = 200
const CENTER_Y = 200
const RADIUS = 140

const GRID_LEVELS = [0.25, 0.5, 0.75, 1.0]

const AXES_BY_POSITION: Record<string, RadarAxis[]> = {
  QB: [
    { label: 'Pass Yds', pctlKey: 'pass_yds_pctl' },
    { label: 'Pass TD', pctlKey: 'pass_td_pctl' },
    { label: 'Comp%', pctlKey: 'pass_pct_pctl' },
    { label: 'PPA', pctlKey: 'ppa_avg_pctl' },
    { label: 'Rush Yds', pctlKey: 'rush_yds_pctl' },
  ],
  RB: [
    { label: 'Rush Yds', pctlKey: 'rush_yds_pctl' },
    { label: 'Rush TD', pctlKey: 'rush_td_pctl' },
    { label: 'YPC', pctlKey: 'rush_ypc_pctl' },
    { label: 'PPA', pctlKey: 'ppa_avg_pctl' },
    { label: 'Rec Yds', pctlKey: 'rec_yds_pctl' },
  ],
  WR: [
    { label: 'Rec Yds', pctlKey: 'rec_yds_pctl' },
    { label: 'Rec TD', pctlKey: 'rec_td_pctl' },
    { label: 'Rush Yds', pctlKey: 'rush_yds_pctl' },
    { label: 'PPA', pctlKey: 'ppa_avg_pctl' },
  ],
  TE: [
    { label: 'Rec Yds', pctlKey: 'rec_yds_pctl' },
    { label: 'Rec TD', pctlKey: 'rec_td_pctl' },
    { label: 'Rush Yds', pctlKey: 'rush_yds_pctl' },
    { label: 'PPA', pctlKey: 'ppa_avg_pctl' },
  ],
  DEF: [
    { label: 'Tackles', pctlKey: 'tackles_pctl' },
    { label: 'Sacks', pctlKey: 'sacks_pctl' },
    { label: 'TFL', pctlKey: 'tfl_pctl' },
  ],
  DEFAULT: [
    { label: 'PPA', pctlKey: 'ppa_avg_pctl' },
    { label: 'Rush Yds', pctlKey: 'rush_yds_pctl' },
    { label: 'Pass Yds', pctlKey: 'pass_yds_pctl' },
    { label: 'Rec Yds', pctlKey: 'rec_yds_pctl' },
    { label: 'Tackles', pctlKey: 'tackles_pctl' },
  ],
}

const DEFENSE_POSITIONS = new Set([
  'DL', 'DE', 'DT', 'NT', 'LB', 'ILB', 'OLB', 'MLB',
  'DB', 'CB', 'S', 'FS', 'SS', 'EDGE',
])

function getAxesForPosition(positionGroup: string | null, position: string | null): RadarAxis[] {
  if (positionGroup) {
    const upper = positionGroup.toUpperCase()
    if (AXES_BY_POSITION[upper]) return AXES_BY_POSITION[upper]
    if (DEFENSE_POSITIONS.has(upper)) return AXES_BY_POSITION.DEF
  }
  if (position) {
    const upper = position.toUpperCase()
    if (AXES_BY_POSITION[upper]) return AXES_BY_POSITION[upper]
    if (DEFENSE_POSITIONS.has(upper)) return AXES_BY_POSITION.DEF
    if (upper === 'WR' || upper === 'TE') return AXES_BY_POSITION[upper]
  }
  return AXES_BY_POSITION.DEFAULT
}

function resolveColor(cssVar: string): string {
  if (typeof document === 'undefined') return '#999'
  const match = cssVar.match(/var\((.+)\)/)
  if (!match) return cssVar
  return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || '#999'
}

function angleForIndex(index: number, total: number): number {
  return (index / total) * 2 * Math.PI - Math.PI / 2
}

function pointOnCircle(angle: number, radius: number): [number, number] {
  return [CENTER_X + Math.cos(angle) * radius, CENTER_Y + Math.sin(angle) * radius]
}

export function PercentileRadar({ percentiles }: PercentileRadarProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)

  const axes = useMemo(
    () => getAxesForPosition(percentiles.position_group, percentiles.position),
    [percentiles.position_group, percentiles.position]
  )

  const drawRadar = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group) return

    // Clear previous rough drawings
    while (group.firstChild) group.removeChild(group.firstChild)

    const rc = rough.svg(svg)
    const color = resolveColor('var(--color-run)')

    // Calculate polygon points from percentile values
    const points: [number, number][] = axes.map((axis, i) => {
      const angle = angleForIndex(i, axes.length)
      const value = (percentiles[axis.pctlKey] as number | null) ?? 0
      const dist = value * RADIUS
      return pointOnCircle(angle, dist)
    })

    // Draw filled polygon (semi-transparent)
    const filledPolygon = rc.polygon(points, {
      fill: color,
      fillStyle: 'solid',
      stroke: 'none',
      strokeWidth: 0,
      roughness: 1.0,
      bowing: 0.3,
    })
    filledPolygon.style.opacity = '0.3'
    group.appendChild(filledPolygon)

    // Draw outline polygon
    group.appendChild(
      rc.polygon(points, {
        stroke: color,
        strokeWidth: 2,
        roughness: 1.0,
        bowing: 0.3,
        fill: 'none',
      })
    )

    // Draw data dots
    for (const [x, y] of points) {
      group.appendChild(
        rc.circle(x, y, 8, {
          fill: color,
          fillStyle: 'solid',
          stroke: color,
          strokeWidth: 1,
          roughness: 0.5,
        })
      )
    }
  }, [percentiles, axes])

  // Initial draw and redraw on dependency changes
  useEffect(() => {
    drawRadar()
  }, [drawRadar])

  // Theme change detection via MutationObserver
  useEffect(() => {
    const observer = new MutationObserver(() => {
      requestAnimationFrame(drawRadar)
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
    return () => observer.disconnect()
  }, [drawRadar])

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 400 400"
      className="w-full max-w-md mx-auto"
      role="img"
      aria-label={`Percentile radar chart for ${percentiles.name}`}
    >
      {/* Concentric grid circles */}
      {GRID_LEVELS.map((level) => (
        <circle
          key={level}
          cx={CENTER_X}
          cy={CENTER_Y}
          r={RADIUS * level}
          fill="none"
          stroke="var(--border)"
          strokeWidth={1}
          opacity={0.5}
        />
      ))}

      {/* Grid level labels */}
      {GRID_LEVELS.map((level) => (
        <text
          key={`label-${level}`}
          x={CENTER_X + 4}
          y={CENTER_Y - RADIUS * level + 12}
          fill="var(--text-muted)"
          fontSize={9}
          fontFamily="var(--font-body)"
          opacity={0.6}
        >
          {Math.round(level * 100)}
        </text>
      ))}

      {/* Radial axis lines and labels */}
      {axes.map((axis, i) => {
        const angle = angleForIndex(i, axes.length)
        const [endX, endY] = pointOnCircle(angle, RADIUS)
        const [labelX, labelY] = pointOnCircle(angle, RADIUS + 20)
        const pctlValue = (percentiles[axis.pctlKey] as number | null) ?? 0
        const pctlDisplay = `${Math.round(pctlValue * 100)}th`

        // Determine text-anchor based on angle position
        let textAnchor: 'start' | 'middle' | 'end' = 'middle'
        const normalizedAngle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        if (normalizedAngle > Math.PI * 0.1 && normalizedAngle < Math.PI * 0.9) {
          textAnchor = 'start'
        } else if (normalizedAngle > Math.PI * 1.1 && normalizedAngle < Math.PI * 1.9) {
          textAnchor = 'end'
        }

        return (
          <g key={axis.label}>
            {/* Axis line */}
            <line
              x1={CENTER_X}
              y1={CENTER_Y}
              x2={endX}
              y2={endY}
              stroke="var(--border)"
              strokeWidth={1}
              opacity={0.4}
            />
            {/* Axis label */}
            <text
              x={labelX}
              y={labelY}
              fill="var(--text-secondary)"
              fontSize={11}
              fontFamily="var(--font-body)"
              textAnchor={textAnchor}
              dominantBaseline="middle"
            >
              {axis.label}
            </text>
            {/* Percentile value label */}
            <text
              x={labelX}
              y={labelY + 14}
              fill="var(--text-muted)"
              fontSize={10}
              fontFamily="var(--font-body)"
              textAnchor={textAnchor}
              dominantBaseline="middle"
              className="tabular-nums"
            >
              {pctlDisplay}
            </text>
          </g>
        )
      })}

      {/* roughjs drawings go in this group */}
      <g ref={roughGroupRef} />
    </svg>
  )
}
