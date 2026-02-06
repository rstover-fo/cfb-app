'use client'

import { useMemo, useEffect, useRef, useCallback } from 'react'
import rough from 'roughjs'
import type { GameDrive } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'
import type { LineScores } from '@/lib/types/database'

interface ScoreStepLineProps {
  drives: GameDrive[]
  lineScores: LineScores
  game: GameWithTeams
}

interface ScoreEvent {
  gameMinute: number
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

function resolveColor(cssVar: string): string {
  if (typeof document === 'undefined') return '#999'
  const match = cssVar.match(/var\((.+)\)/)
  if (!match) return cssVar
  return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || '#999'
}

function buildScoreEvents(drives: GameDrive[]): ScoreEvent[] {
  const events: ScoreEvent[] = [{ gameMinute: 0, homeScore: 0, awayScore: 0 }]

  let homeScore = 0
  let awayScore = 0

  for (const drive of drives) {
    if (!drive.scoring) continue

    const gameMinute = (drive.start_period - 1) * 15 + (15 - drive.start_time_minutes)
    const clampedMinute = Math.max(0, Math.min(TOTAL_MINUTES, gameMinute))

    if (drive.is_home_offense) {
      homeScore = drive.end_offense_score
      awayScore = drive.end_defense_score
    } else {
      awayScore = drive.end_offense_score
      homeScore = drive.end_defense_score
    }

    events.push({ gameMinute: clampedMinute, homeScore, awayScore })
  }

  // Add final point at game end with last known scores
  const last = events[events.length - 1]
  if (last.gameMinute < TOTAL_MINUTES) {
    events.push({ gameMinute: TOTAL_MINUTES, homeScore: last.homeScore, awayScore: last.awayScore })
  }

  return events
}

function xScale(minute: number): number {
  return MARGIN.left + (minute / TOTAL_MINUTES) * PLOT_WIDTH
}

function yScale(score: number, maxScore: number): number {
  if (maxScore <= 0) return MARGIN.top + PLOT_HEIGHT
  return MARGIN.top + PLOT_HEIGHT - (score / maxScore) * PLOT_HEIGHT
}

// Build step-line path: for each event, go horizontal then vertical
function buildStepPoints(
  events: ScoreEvent[],
  team: 'home' | 'away',
  maxScore: number
): [number, number][] {
  const points: [number, number][] = []

  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    const score = team === 'home' ? e.homeScore : e.awayScore
    const x = xScale(e.gameMinute)
    const y = yScale(score, maxScore)

    if (i > 0) {
      // Horizontal step to new x at previous y
      const prevScore = team === 'home' ? events[i - 1].homeScore : events[i - 1].awayScore
      const prevY = yScale(prevScore, maxScore)
      points.push([x, prevY])
    }

    points.push([x, y])
  }

  return points
}

export function ScoreStepLine({ drives, lineScores, game }: ScoreStepLineProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)

  const events = useMemo(() => buildScoreEvents(drives), [drives])

  const finalHome = lineScores.home.reduce((s, q) => s + q, 0)
  const finalAway = lineScores.away.reduce((s, q) => s + q, 0)
  const maxScore = useMemo(() => {
    const peak = Math.max(finalHome, finalAway, ...events.map(e => Math.max(e.homeScore, e.awayScore)))
    // Round up to nearest multiple of 7 for football scores
    return Math.ceil((peak + 3) / 7) * 7
  }, [events, finalHome, finalAway])

  const homeColor = game.homeColor || '#333333'
  const awayColor = game.awayColor || '#666666'

  const homePoints = useMemo(() => buildStepPoints(events, 'home', maxScore), [events, maxScore])
  const awayPoints = useMemo(() => buildStepPoints(events, 'away', maxScore), [events, maxScore])

  // Score events only (excluding start/end padding)
  const scoringEvents = useMemo(() => events.filter((_, i) => i > 0 && i < events.length - 1), [events])

  // Y-axis ticks
  const yTicks = useMemo(() => {
    const step = maxScore <= 14 ? 7 : 14
    const ticks: number[] = [0]
    let val = step
    while (val <= maxScore) {
      ticks.push(val)
      val += step
    }
    return ticks
  }, [maxScore])

  // Draw roughjs lines
  const drawLines = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group) return

    while (group.firstChild) {
      group.removeChild(group.firstChild)
    }

    const rc = rough.svg(svg)
    const resolvedHome = resolveColor(homeColor)
    const resolvedAway = resolveColor(awayColor)

    // Home step line
    if (homePoints.length >= 2) {
      const homeLine = rc.linearPath(homePoints, {
        stroke: resolvedHome,
        strokeWidth: 2.5,
        roughness: 0.8,
        bowing: 0.3,
      })
      group.appendChild(homeLine)
    }

    // Away step line
    if (awayPoints.length >= 2) {
      const awayLine = rc.linearPath(awayPoints, {
        stroke: resolvedAway,
        strokeWidth: 2.5,
        roughness: 0.8,
        bowing: 0.3,
      })
      group.appendChild(awayLine)
    }

    // Scoring event circles
    for (const event of scoringEvents) {
      const x = xScale(event.gameMinute)

      const homeY = yScale(event.homeScore, maxScore)
      const homeDot = rc.circle(x, homeY, 8, {
        fill: resolvedHome,
        fillStyle: 'solid',
        stroke: resolvedHome,
        strokeWidth: 1,
        roughness: 0.5,
      })
      group.appendChild(homeDot)

      const awayY = yScale(event.awayScore, maxScore)
      const awayDot = rc.circle(x, awayY, 8, {
        fill: resolvedAway,
        fillStyle: 'solid',
        stroke: resolvedAway,
        strokeWidth: 1,
        roughness: 0.5,
      })
      group.appendChild(awayDot)
    }
  }, [homePoints, awayPoints, scoringEvents, homeColor, awayColor, maxScore])

  useEffect(() => {
    drawLines()
  }, [drawLines])

  // Redraw on theme change
  useEffect(() => {
    const observer = new MutationObserver(() => {
      requestAnimationFrame(drawLines)
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
    return () => observer.disconnect()
  }, [drawLines])

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Score flow: ${game.home_team} ${finalHome}, ${game.away_team} ${finalAway}`}
      >
        {/* Subtle horizontal gridlines */}
        {yTicks.map(tick => (
          <line
            key={`grid-${tick}`}
            x1={MARGIN.left}
            y1={yScale(tick, maxScore)}
            x2={WIDTH - MARGIN.right}
            y2={yScale(tick, maxScore)}
            stroke="var(--border)"
            strokeWidth={0.5}
            strokeDasharray="4,4"
          />
        ))}

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
        {yTicks.map(tick => (
          <text
            key={`ylabel-${tick}`}
            x={MARGIN.left - 8}
            y={yScale(tick, maxScore)}
            textAnchor="end"
            dominantBaseline="middle"
            fill="var(--text-muted)"
            fontSize={10}
            fontFamily="var(--font-body)"
          >
            {tick}
          </text>
        ))}

        {/* Score labels at scoring events */}
        {scoringEvents.map((event, i) => {
          const x = xScale(event.gameMinute)
          const topScore = Math.max(event.homeScore, event.awayScore)
          const labelY = yScale(topScore, maxScore) - 10
          return (
            <text
              key={`score-${i}`}
              x={x}
              y={Math.max(MARGIN.top + 4, labelY)}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize={9}
              fontFamily="var(--font-body)"
            >
              {event.homeScore}-{event.awayScore}
            </text>
          )
        })}

        {/* Rough-drawn lines and dots */}
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
