'use client'

import { useMemo, useEffect, useRef, useCallback } from 'react'
import rough from 'roughjs'
import type { GameDrive } from '@/lib/types/database'
import type { LineScores } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'

interface WinProbabilityChartProps {
  drives: GameDrive[]
  lineScores: LineScores
  game: GameWithTeams
}

interface WPDataPoint {
  gameMinute: number
  homeWP: number
  homeScore: number
  awayScore: number
}

const WIDTH = 800
const HEIGHT = 300
const MARGIN = { top: 24, right: 56, bottom: 44, left: 44 }
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom
const TOTAL_MINUTES = 60
const QUARTER_MINUTES = [15, 30, 45]
const Y_TICKS = [0, 25, 50, 75, 100]

function xScale(minute: number): number {
  return MARGIN.left + (minute / TOTAL_MINUTES) * PLOT_WIDTH
}

function yScale(wp: number): number {
  return MARGIN.top + PLOT_HEIGHT - (wp / 100) * PLOT_HEIGHT
}

function resolveColor(cssVar: string): string {
  if (typeof document === 'undefined') return '#999'
  const match = cssVar.match(/var\((.+)\)/)
  if (!match) return cssVar
  return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || '#999'
}

function computeWinProbability(scoreDiff: number, timeRemaining: number): number {
  const timeWeight = timeRemaining < 5 ? 0.3 : 0.05
  const exponent = -(scoreDiff * 0.15 + scoreDiff * timeWeight)
  return 1 / (1 + Math.exp(exponent))
}

function buildWPData(drives: GameDrive[], finalHome: number, finalAway: number): WPDataPoint[] {
  const points: WPDataPoint[] = [
    { gameMinute: 0, homeWP: 50, homeScore: 0, awayScore: 0 },
  ]

  let homeScore = 0
  let awayScore = 0

  for (const drive of drives) {
    const gameMinute = (drive.start_period - 1) * 15 + (15 - drive.start_time_minutes)
    const clampedMinute = Math.max(0, Math.min(TOTAL_MINUTES, gameMinute))

    if (drive.is_home_offense) {
      homeScore = drive.end_offense_score
      awayScore = drive.end_defense_score
    } else {
      awayScore = drive.end_offense_score
      homeScore = drive.end_defense_score
    }

    const scoreDiff = homeScore - awayScore
    const timeRemaining = TOTAL_MINUTES - clampedMinute
    const homeWP = computeWinProbability(scoreDiff, timeRemaining) * 100

    points.push({ gameMinute: clampedMinute, homeWP, homeScore, awayScore })
  }

  const finalDiff = finalHome - finalAway
  const finalWP = finalDiff > 0 ? 100 : finalDiff < 0 ? 0 : 50
  points.push({
    gameMinute: TOTAL_MINUTES,
    homeWP: finalWP,
    homeScore: finalHome,
    awayScore: finalAway,
  })

  return points
}

export function WinProbabilityChart({ drives, lineScores, game }: WinProbabilityChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)

  const finalHome = lineScores.home.reduce((s, q) => s + q, 0)
  const finalAway = lineScores.away.reduce((s, q) => s + q, 0)

  const homeColor = game.homeColor || '#333333'
  const awayColor = game.awayColor || '#666666'

  const wpData = useMemo(() => buildWPData(drives, finalHome, finalAway), [drives, finalHome, finalAway])

  // Screen-space line points for roughjs and area fills
  const screenPoints = useMemo(() =>
    wpData.map(p => ({ x: xScale(p.gameMinute), y: yScale(p.homeWP), wp: p.homeWP })),
  [wpData])

  // Simple area fill SVG paths (straight segments between data points)
  const { abovePath, belowPath } = useMemo(() => {
    if (screenPoints.length < 2) return { abovePath: '', belowPath: '' }
    const midY = yScale(50)
    const aboveCoords = screenPoints.map(p => `${p.x},${Math.min(p.y, midY)}`).join(' L')
    const belowCoords = screenPoints.map(p => `${p.x},${Math.max(p.y, midY)}`).join(' L')
    return {
      abovePath: `M${screenPoints[0].x},${midY} L${aboveCoords} L${screenPoints[screenPoints.length - 1].x},${midY} Z`,
      belowPath: `M${screenPoints[0].x},${midY} L${belowCoords} L${screenPoints[screenPoints.length - 1].x},${midY} Z`,
    }
  }, [screenPoints])

  // roughjs line points
  const linePoints = useMemo(() =>
    screenPoints.map(p => [p.x, p.y] as [number, number]),
  [screenPoints])

  // Draw roughjs WP line
  const drawChart = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group) return

    while (group.firstChild) group.removeChild(group.firstChild)

    const rc = rough.svg(svg)
    const resolvedHome = resolveColor(homeColor)

    if (linePoints.length >= 2) {
      const line = rc.linearPath(linePoints, {
        stroke: resolvedHome,
        strokeWidth: 2.5,
        roughness: 0.8,
        bowing: 0.3,
      })
      group.appendChild(line)
    }
  }, [linePoints, homeColor])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Redraw on theme change
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

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Win probability: ${game.home_team} ${finalHome}, ${game.away_team} ${finalAway}`}
      >
        {/* Horizontal gridlines at percentage ticks */}
        {Y_TICKS.map(tick => (
          <line
            key={`grid-${tick}`}
            x1={MARGIN.left}
            y1={yScale(tick)}
            x2={WIDTH - MARGIN.right}
            y2={yScale(tick)}
            stroke="var(--border)"
            strokeWidth={tick === 50 ? 0 : 0.5}
            strokeDasharray="4,4"
          />
        ))}

        {/* 50% dashed reference line */}
        <line
          x1={MARGIN.left}
          y1={yScale(50)}
          x2={WIDTH - MARGIN.right}
          y2={yScale(50)}
          stroke="var(--text-muted)"
          strokeWidth={1}
          strokeDasharray="6,4"
          opacity={0.6}
        />

        {/* Quarter dividers */}
        {QUARTER_MINUTES.map(q => (
          <line
            key={`q-${q}`}
            x1={xScale(q)}
            y1={MARGIN.top}
            x2={xScale(q)}
            y2={HEIGHT - MARGIN.bottom}
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray="6,4"
          />
        ))}

        {/* Quarter labels */}
        {[0, 1, 2, 3].map(i => {
          const centerMinute = i * 15 + 7.5
          return (
            <text
              key={`qlabel-${i}`}
              x={xScale(centerMinute)}
              y={HEIGHT - MARGIN.bottom + 16}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize={11}
              fontFamily="var(--font-body)"
            >
              Q{i + 1}
            </text>
          )
        })}

        {/* Y-axis labels */}
        {Y_TICKS.map(tick => (
          <text
            key={`ylabel-${tick}`}
            x={MARGIN.left - 8}
            y={yScale(tick)}
            textAnchor="end"
            dominantBaseline="middle"
            fill="var(--text-muted)"
            fontSize={10}
            fontFamily="var(--font-body)"
          >
            {tick}%
          </text>
        ))}

        {/* Team name labels on right edge */}
        <text
          x={WIDTH - MARGIN.right + 4}
          y={yScale(100)}
          textAnchor="start"
          dominantBaseline="middle"
          fill={homeColor}
          fontSize={9}
          fontFamily="var(--font-body)"
          fontWeight={600}
        >
          {game.home_team?.split(' ').pop()}
        </text>
        <text
          x={WIDTH - MARGIN.right + 4}
          y={yScale(0)}
          textAnchor="start"
          dominantBaseline="middle"
          fill={awayColor}
          fontSize={9}
          fontFamily="var(--font-body)"
          fontWeight={600}
        >
          {game.away_team?.split(' ').pop()}
        </text>

        {/* Area fill: home advantage (above 50%) */}
        {abovePath && (
          <path
            d={abovePath}
            fill={homeColor}
            opacity={0.15}
          />
        )}

        {/* Area fill: away advantage (below 50%) */}
        {belowPath && (
          <path
            d={belowPath}
            fill={awayColor}
            opacity={0.15}
          />
        )}

        {/* Rough-drawn WP line */}
        <g ref={roughGroupRef} />

        {/* Legend */}
        <rect
          x={MARGIN.left}
          y={HEIGHT - 14}
          width={10}
          height={3}
          fill={homeColor}
          rx={1}
        />
        <text
          x={MARGIN.left + 14}
          y={HEIGHT - 10}
          fill="var(--text-secondary)"
          fontSize={10}
          fontFamily="var(--font-body)"
        >
          {game.home_team}
        </text>

        <rect
          x={MARGIN.left + 120}
          y={HEIGHT - 14}
          width={10}
          height={3}
          fill={awayColor}
          rx={1}
        />
        <text
          x={MARGIN.left + 134}
          y={HEIGHT - 10}
          fill="var(--text-secondary)"
          fontSize={10}
          fontFamily="var(--font-body)"
        >
          {game.away_team}
        </text>
      </svg>
    </div>
  )
}
