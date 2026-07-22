'use client'

import { useMemo, useEffect, useRef, useCallback } from 'react'
import { ChartLineUp } from '@phosphor-icons/react'
import rough from 'roughjs'
import type { GameDrive } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'
import type { LineScores } from '@/lib/types/database'
import { useChartTheme } from '@/lib/charts/theme'
import { teamInk } from '@/lib/charts/series'
import { ChartFrame } from '@/lib/charts/ChartFrame'
import { ChartLegend } from '@/lib/charts/ChartLegend'
import type { ChartLegendItem } from '@/lib/charts/ChartLegend'

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

const WIDTH = 700
const HEIGHT = 350
const MARGIN = { top: 30, right: 30, bottom: 50, left: 60 }
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom
const TOTAL_MINUTES = 60
const QUARTER_MINUTES = [15, 30, 45]

/** Stable wobble (spec §9): identical strokes across re-renders and theme flips. */
const ROUGH_SEED = 41

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

  const homePoints = useMemo(() => buildStepPoints(events, 'home', maxScore), [events, maxScore])
  const awayPoints = useMemo(() => buildStepPoints(events, 'away', maxScore), [events, maxScore])

  // Score events only (excluding start/end padding). A flat line with no
  // scoring events is a genuinely bare render (spec §5 empty-state contract).
  const scoringEvents = useMemo(() => events.filter((_, i) => i > 0 && i < events.length - 1), [events])
  const isEmpty = scoringEvents.length === 0

  // Score annotations thin by pixel distance: back-to-back scores (a quick
  // TD off a turnover, late-game trades) otherwise overprint each other.
  // Scan right-to-left so the latest score in a cluster keeps its label.
  const labeledEvents = useMemo(() => {
    const MIN_LABEL_GAP_X = 36 // ~width of a "34-10" text-xs annotation
    const kept: ScoreEvent[] = []
    let lastKeptX = Infinity
    for (let i = scoringEvents.length - 1; i >= 0; i--) {
      const x = xScale(scoringEvents[i].gameMinute)
      if (lastKeptX - x >= MIN_LABEL_GAP_X) {
        kept.unshift(scoringEvents[i])
        lastKeptX = x
      }
    }
    return kept
  }, [scoringEvents])

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
  const drawChart = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group || isEmpty) return

    while (group.firstChild) {
      group.removeChild(group.firstChild)
    }

    const rc = rough.svg(svg)
    const homeColor = teamInk(game.homeColor, 'primary')
    const awayColor = teamInk(game.awayColor, 'muted')

    // Home step line (primary weight)
    if (homePoints.length >= 2) {
      const homeLine = rc.linearPath(homePoints, {
        stroke: homeColor,
        strokeWidth: 3,
        roughness: 1.0,
        bowing: 0.4,
        seed: ROUGH_SEED,
      })
      group.appendChild(homeLine)
    }

    // Away step line (secondary weight)
    if (awayPoints.length >= 2) {
      const awayLine = rc.linearPath(awayPoints, {
        stroke: awayColor,
        strokeWidth: 2,
        roughness: 0.7,
        bowing: 0.3,
        seed: ROUGH_SEED,
      })
      group.appendChild(awayLine)
    }

    // Scoring event circles
    for (const event of scoringEvents) {
      const x = xScale(event.gameMinute)

      const homeY = yScale(event.homeScore, maxScore)
      const homeDot = rc.circle(x, homeY, 8, {
        fill: homeColor,
        fillStyle: 'solid',
        stroke: homeColor,
        strokeWidth: 1,
        roughness: 0.5,
        seed: ROUGH_SEED,
      })
      group.appendChild(homeDot)

      const awayY = yScale(event.awayScore, maxScore)
      const awayDot = rc.circle(x, awayY, 8, {
        fill: awayColor,
        fillStyle: 'solid',
        stroke: awayColor,
        strokeWidth: 1,
        roughness: 0.5,
        seed: ROUGH_SEED,
      })
      group.appendChild(awayDot)
    }
  }, [homePoints, awayPoints, scoringEvents, game.homeColor, game.awayColor, maxScore, isEmpty])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Redraw on theme change
  useChartTheme(drawChart)

  const legendItems: ChartLegendItem[] = [
    { key: 'home', label: game.home_team, swatch: 'solid', color: game.homeColor ?? 'var(--text-primary)' },
    { key: 'away', label: game.away_team, swatch: 'solid', color: game.awayColor ?? 'var(--text-muted)' },
  ]

  return (
    <ChartFrame
      ariaLabel={`Score flow: ${game.home_team} ${finalHome}, ${game.away_team} ${finalAway}`}
      empty={isEmpty}
      emptyState={{
        icon: ChartLineUp,
        title: 'No scoring plays recorded yet',
        description: 'The score flow chart populates once points are on the board.',
      }}
    >
      {a11y => (
        <>
          <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" {...a11y}>
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
                  className="fill-[var(--text-muted)] text-xs"
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
                className="fill-[var(--text-muted)] text-xs"
              >
                {tick}
              </text>
            ))}

            {/* Score labels at scoring events (thinned by pixel distance) */}
            {labeledEvents.map((event, i) => {
              const x = xScale(event.gameMinute)
              const topScore = Math.max(event.homeScore, event.awayScore)
              const labelY = yScale(topScore, maxScore) - 10
              return (
                <text
                  key={`score-${i}`}
                  x={x}
                  y={Math.max(MARGIN.top + 4, labelY)}
                  textAnchor="middle"
                  className="fill-[var(--text-muted)] text-xs"
                >
                  {event.homeScore}-{event.awayScore}
                </text>
              )
            })}

            {/* Rough-drawn lines and dots */}
            <g ref={roughGroupRef} data-testid="rough-layer" />
          </svg>

          <ChartLegend items={legendItems} />
        </>
      )}
    </ChartFrame>
  )
}
