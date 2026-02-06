'use client'

import { useMemo } from 'react'
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
const MARGIN = { top: 24, right: 24, bottom: 44, left: 44 }
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

    points.push({
      gameMinute: clampedMinute,
      homeWP,
      homeScore,
      awayScore,
    })
  }

  // Add final point at game end using final scores
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

/**
 * Build a smooth SVG cubic bezier path through the data points.
 * Uses Catmull-Rom to cubic bezier conversion for natural-looking curves.
 */
function buildSmoothPath(points: WPDataPoint[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) {
    const x = xScale(points[0].gameMinute)
    const y = yScale(points[0].homeWP)
    return `M${x},${y}`
  }

  const coords = points.map(p => ({
    x: xScale(p.gameMinute),
    y: yScale(p.homeWP),
  }))

  let d = `M${coords[0].x},${coords[0].y}`

  if (coords.length === 2) {
    d += ` L${coords[1].x},${coords[1].y}`
    return d
  }

  // Catmull-Rom to cubic bezier
  const tension = 0.3
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[Math.max(0, i - 1)]
    const p1 = coords[i]
    const p2 = coords[i + 1]
    const p3 = coords[Math.min(coords.length - 1, i + 2)]

    const cp1x = p1.x + (p2.x - p0.x) * tension
    const cp1y = p1.y + (p2.y - p0.y) * tension
    const cp2x = p2.x - (p3.x - p1.x) * tension
    const cp2y = p2.y - (p3.y - p1.y) * tension

    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }

  return d
}

/**
 * Build an area path that fills from the line to the 50% baseline.
 * Returns two paths: one for above 50% (home advantage) and one for below (away advantage).
 * Uses a simplified approach: area fill from the smooth line down/up to 50%.
 */
function buildAreaPaths(points: WPDataPoint[]): { abovePath: string; belowPath: string } {
  if (points.length < 2) return { abovePath: '', belowPath: '' }

  // Sample the curve at many points for smooth area fill
  const SAMPLES = 200
  const sampledPoints: { x: number; y: number; wp: number }[] = []

  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES
    const minute = t * TOTAL_MINUTES
    // Linearly interpolate between data points
    let wp = 50
    for (let j = 0; j < points.length - 1; j++) {
      if (minute >= points[j].gameMinute && minute <= points[j + 1].gameMinute) {
        const segT =
          points[j + 1].gameMinute === points[j].gameMinute
            ? 0
            : (minute - points[j].gameMinute) / (points[j + 1].gameMinute - points[j].gameMinute)
        wp = points[j].homeWP + segT * (points[j + 1].homeWP - points[j].homeWP)
        break
      }
    }
    sampledPoints.push({ x: xScale(minute), y: yScale(wp), wp })
  }

  const midY = yScale(50)

  // Above 50% area (home advantage)
  let abovePath = ''
  let inAbove = false
  for (let i = 0; i < sampledPoints.length; i++) {
    const p = sampledPoints[i]
    const clampedY = Math.min(p.y, midY) // clamp to at most midY
    if (p.wp >= 50) {
      if (!inAbove) {
        abovePath += `M${p.x},${midY} L${p.x},${clampedY}`
        inAbove = true
      } else {
        abovePath += ` L${p.x},${clampedY}`
      }
    } else {
      if (inAbove) {
        abovePath += ` L${p.x},${midY} Z `
        inAbove = false
      }
    }
  }
  if (inAbove) {
    const last = sampledPoints[sampledPoints.length - 1]
    abovePath += ` L${last.x},${midY} Z`
  }

  // Below 50% area (away advantage)
  let belowPath = ''
  let inBelow = false
  for (let i = 0; i < sampledPoints.length; i++) {
    const p = sampledPoints[i]
    const clampedY = Math.max(p.y, midY) // clamp to at least midY
    if (p.wp < 50) {
      if (!inBelow) {
        belowPath += `M${p.x},${midY} L${p.x},${clampedY}`
        inBelow = true
      } else {
        belowPath += ` L${p.x},${clampedY}`
      }
    } else {
      if (inBelow) {
        belowPath += ` L${p.x},${midY} Z `
        inBelow = false
      }
    }
  }
  if (inBelow) {
    const last = sampledPoints[sampledPoints.length - 1]
    belowPath += ` L${last.x},${midY} Z`
  }

  return { abovePath, belowPath }
}

export function WinProbabilityChart({ drives, lineScores, game }: WinProbabilityChartProps) {
  const finalHome = lineScores.home.reduce((s, q) => s + q, 0)
  const finalAway = lineScores.away.reduce((s, q) => s + q, 0)

  const homeColor = game.homeColor || '#333333'
  const awayColor = game.awayColor || '#666666'

  const wpData = useMemo(() => buildWPData(drives, finalHome, finalAway), [drives, finalHome, finalAway])
  const linePath = useMemo(() => buildSmoothPath(wpData), [wpData])
  const { abovePath, belowPath } = useMemo(() => buildAreaPaths(wpData), [wpData])

  return (
    <div className="relative">
      <svg
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

        {/* Area fill: home advantage (above 50%) */}
        {abovePath && (
          <path
            d={abovePath}
            fill={homeColor}
            opacity={0.1}
          />
        )}

        {/* Area fill: away advantage (below 50%) */}
        {belowPath && (
          <path
            d={belowPath}
            fill={awayColor}
            opacity={0.1}
          />
        )}

        {/* Win probability line */}
        <path
          d={linePath}
          fill="none"
          stroke="var(--text-primary)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

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
