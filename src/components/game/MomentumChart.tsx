'use client'

import { useMemo, useEffect, useRef } from 'react'
import rough from 'roughjs'
import type { GameDrive } from '@/lib/types/database'
import type { LineScores } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'

interface MomentumChartProps {
  drives: GameDrive[]
  lineScores: LineScores
  game: GameWithTeams
}

const WIDTH = 800
const HEIGHT = 250
const MARGIN = { top: 24, right: 24, bottom: 44, left: 44 }
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom
const NUM_QUARTERS = 4
const COL_WIDTH = PLOT_WIDTH / NUM_QUARTERS
const BAR_WIDTH_RATIO = 0.7
const BAR_WIDTH = COL_WIDTH * BAR_WIDTH_RATIO
const BAR_PADDING = COL_WIDTH * ((1 - BAR_WIDTH_RATIO) / 2)
const CENTER_Y = MARGIN.top + PLOT_HEIGHT / 2

function resolveColor(cssVar: string): string {
  if (typeof document === 'undefined') return '#999'
  const match = cssVar.match(/var\((.+)\)/)
  if (!match) return cssVar
  return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || '#999'
}

function yFromDiff(diff: number, maxAbsDiff: number): number {
  // Positive diff goes up (lower y), negative goes down (higher y)
  return CENTER_Y - (diff / maxAbsDiff) * (PLOT_HEIGHT / 2)
}

// drives prop accepted for interface compatibility with ScoringTimeline tabs
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function MomentumChart({ drives: _drives, lineScores, game }: MomentumChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)

  const homeColor = game.homeColor || '#333333'
  const awayColor = game.awayColor || '#666666'

  // Calculate per-quarter differentials (positive = home advantage)
  const quarterDiffs = useMemo(() => {
    return Array.from({ length: NUM_QUARTERS }, (_, i) => {
      const homeQ = lineScores.home[i] ?? 0
      const awayQ = lineScores.away[i] ?? 0
      return {
        quarter: i + 1,
        homePoints: homeQ,
        awayPoints: awayQ,
        diff: homeQ - awayQ,
      }
    })
  }, [lineScores])

  // Cumulative scores at end of each quarter
  const cumulativeScores = useMemo(() => {
    let homeTotal = 0
    let awayTotal = 0
    return quarterDiffs.map(q => {
      homeTotal += q.homePoints
      awayTotal += q.awayPoints
      return { home: homeTotal, away: awayTotal }
    })
  }, [quarterDiffs])

  // Symmetric Y scale based on max absolute differential
  const maxAbsDiff = useMemo(() => {
    const peak = Math.max(...quarterDiffs.map(q => Math.abs(q.diff)), 1)
    // Round up to a nice number (nearest multiple of 7 for football)
    return Math.ceil((peak + 2) / 7) * 7
  }, [quarterDiffs])

  // Y-axis ticks (symmetric around 0)
  const yTicks = useMemo(() => {
    const step = 7
    const ticks: number[] = [0]
    let val = step
    while (val <= maxAbsDiff) {
      ticks.push(val)
      ticks.push(-val)
      val += step
    }
    return ticks.sort((a, b) => b - a)
  }, [maxAbsDiff])

  // Draw roughjs bars
  useEffect(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group) return

    while (group.firstChild) {
      group.removeChild(group.firstChild)
    }

    const rc = rough.svg(svg)
    const resolvedHome = resolveColor(homeColor)
    const resolvedAway = resolveColor(awayColor)

    for (let i = 0; i < NUM_QUARTERS; i++) {
      const diff = quarterDiffs[i].diff
      if (diff === 0) continue

      const x = MARGIN.left + i * COL_WIDTH + BAR_PADDING
      const color = diff > 0 ? resolvedHome : resolvedAway

      const barTop = diff > 0 ? yFromDiff(diff, maxAbsDiff) : CENTER_Y
      const barHeight = Math.abs(yFromDiff(diff, maxAbsDiff) - CENTER_Y)

      if (barHeight < 1) continue

      const rect = rc.rectangle(x, barTop, BAR_WIDTH, barHeight, {
        fill: color,
        fillStyle: 'cross-hatch',
        fillWeight: 1.5,
        hachureGap: 5,
        stroke: color,
        strokeWidth: 1.5,
        roughness: 1.0,
        bowing: 0.5,
      })
      group.appendChild(rect)
    }
  }, [quarterDiffs, homeColor, awayColor, maxAbsDiff])

  const finalHome = lineScores.home.reduce((s, q) => s + q, 0)
  const finalAway = lineScores.away.reduce((s, q) => s + q, 0)

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Quarter scoring momentum: ${game.home_team} ${finalHome}, ${game.away_team} ${finalAway}`}
      >
        {/* Horizontal gridlines */}
        {yTicks.map(tick => (
          <line
            key={`grid-${tick}`}
            x1={MARGIN.left}
            y1={yFromDiff(tick, maxAbsDiff)}
            x2={WIDTH - MARGIN.right}
            y2={yFromDiff(tick, maxAbsDiff)}
            stroke="var(--border)"
            strokeWidth={tick === 0 ? 1 : 0.5}
            strokeDasharray={tick === 0 ? 'none' : '4,4'}
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map(tick => (
          <text
            key={`ylabel-${tick}`}
            x={MARGIN.left - 8}
            y={yFromDiff(tick, maxAbsDiff)}
            textAnchor="end"
            dominantBaseline="middle"
            fill="var(--text-muted)"
            fontSize={10}
            fontFamily="var(--font-body)"
          >
            {tick > 0 ? `+${tick}` : tick}
          </text>
        ))}

        {/* Quarter labels at bottom */}
        {Array.from({ length: NUM_QUARTERS }, (_, i) => {
          const centerX = MARGIN.left + i * COL_WIDTH + COL_WIDTH / 2
          return (
            <text
              key={`qlabel-${i}`}
              x={centerX}
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

        {/* Differential labels on bars */}
        {quarterDiffs.map((q, i) => {
          if (q.diff === 0) return null
          const centerX = MARGIN.left + i * COL_WIDTH + COL_WIDTH / 2
          const labelY = q.diff > 0
            ? yFromDiff(q.diff, maxAbsDiff) - 8
            : yFromDiff(q.diff, maxAbsDiff) + 14
          const clampedY = Math.max(MARGIN.top + 4, Math.min(HEIGHT - MARGIN.bottom - 4, labelY))
          return (
            <text
              key={`diff-${i}`}
              x={centerX}
              y={clampedY}
              textAnchor="middle"
              fill="var(--text-primary)"
              fontSize={11}
              fontWeight={600}
              fontFamily="var(--font-body)"
            >
              {q.diff > 0 ? `+${q.diff}` : q.diff}
            </text>
          )
        })}

        {/* Cumulative score labels below quarter labels */}
        {cumulativeScores.map((score, i) => {
          const centerX = MARGIN.left + i * COL_WIDTH + COL_WIDTH / 2
          return (
            <text
              key={`cumulative-${i}`}
              x={centerX}
              y={HEIGHT - MARGIN.bottom + 30}
              textAnchor="middle"
              fill="var(--text-secondary)"
              fontSize={9}
              fontFamily="var(--font-body)"
            >
              {score.home}-{score.away}
            </text>
          )
        })}

        {/* Rough-drawn bars */}
        <g ref={roughGroupRef} />

        {/* Team axis labels */}
        <text
          x={WIDTH - MARGIN.right + 4}
          y={MARGIN.top + 10}
          textAnchor="start"
          fill="var(--text-muted)"
          fontSize={9}
          fontFamily="var(--font-body)"
        >
          {game.home_team}
        </text>
        <text
          x={WIDTH - MARGIN.right + 4}
          y={HEIGHT - MARGIN.bottom - 4}
          textAnchor="start"
          fill="var(--text-muted)"
          fontSize={9}
          fontFamily="var(--font-body)"
        >
          {game.away_team}
        </text>

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
