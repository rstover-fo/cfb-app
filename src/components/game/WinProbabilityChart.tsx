'use client'

import { useMemo, useEffect, useRef, useCallback } from 'react'
import rough from 'roughjs'
import type { GameDrive, GameWinProbability } from '@/lib/types/database'
import type { LineScores } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'

interface WinProbabilityChartProps {
  drives: GameDrive[]
  lineScores: LineScores
  game: GameWithTeams
  /** Per-play win probability from api.game_win_probability (CFBD's own
   *  in-game model). When at least 2 usable rows are present, this drives
   *  the chart instead of the score-based heuristic below. */
  serverWP?: GameWinProbability[]
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
const Y_TICKS = [0, 25, 50, 75, 100]

// Nominal minutes per period, used to build the server-data time axis below
// (regulation quarters are 15 minutes; OT periods are given the same
// nominal width purely for even axis spacing -- CFB OT possessions are
// untimed, so this is a layout convention, not a literal game clock).
const PERIOD_MINUTES = 15
const MIN_PERIODS = 4

// totalMinutes defaults to the regulation 60-minute axis (TOTAL_MINUTES) so
// every existing call site (the score-based heuristic path) is unaffected;
// the server-data path passes a wider value when OT periods are present.
function xScale(minute: number, totalMinutes: number = TOTAL_MINUTES): number {
  return MARGIN.left + (minute / totalMinutes) * PLOT_WIDTH
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

interface ServerWPPoint {
  gameMinute: number
  homeWP: number
}

interface ServerWPResult {
  points: ServerWPPoint[]
  /** Axis width in minutes: MIN_PERIODS * PERIOD_MINUTES, extended by
   *  PERIOD_MINUTES for every period beyond regulation (OT). */
  totalMinutes: number
}

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v))
}

type ValidWPRow = GameWinProbability & { home_win_probability: number }

// Builds a time axis from api.game_win_probability rows (assumed already
// play_id-ascending, i.e. chronological, per getGameWinProbability's
// `.order('play_id')`).
//
// home_win_probability is a 0-1 fraction (NUMERIC(5,4) in the warehouse,
// same convention as every other *_win_prob column there), scaled to 0-100
// to match this chart's percentage y-axis.
//
// Time axis: gameMinute = (period - 1) * 15 + minutes elapsed within the
// period. When clock_minutes/clock_seconds are present, elapsed time comes
// from the clock (mirrors ScoreStepLine's drive-level formula). When they
// are null -- e.g. untimed OT downs, which commonly carry a period but no
// clock -- plays are spread evenly across the period by play index instead.
// If period itself is null for every row (the view's defensive core.plays
// LEFT JOIN found no id match at all), there is no temporal grouping
// available, so plays are spread evenly across a nominal 4-quarter game by
// overall play index.
function buildServerWPData(rows: GameWinProbability[] | undefined): ServerWPResult {
  const fallback: ServerWPResult = { points: [], totalMinutes: MIN_PERIODS * PERIOD_MINUTES }

  const valid = (rows ?? []).filter((r): r is ValidWPRow => typeof r.home_win_probability === 'number')
  if (valid.length < 2) return fallback

  const byPeriod = new Map<number, ValidWPRow[]>()
  let anyPeriodKnown = false

  for (const row of valid) {
    if (row.period == null) continue
    anyPeriodKnown = true
    const bucket = byPeriod.get(row.period) ?? []
    bucket.push(row)
    byPeriod.set(row.period, bucket)
  }

  const points: ServerWPPoint[] = []

  if (anyPeriodKnown) {
    for (const [period, periodRows] of byPeriod) {
      const periodStart = (period - 1) * PERIOD_MINUTES
      periodRows.forEach((row, idx) => {
        let gameMinute: number
        if (row.clock_minutes != null) {
          const remaining = row.clock_minutes + (row.clock_seconds ?? 0) / 60
          gameMinute = periodStart + Math.max(0, Math.min(PERIOD_MINUTES, PERIOD_MINUTES - remaining))
        } else {
          const frac = periodRows.length > 1 ? idx / (periodRows.length - 1) : 0
          gameMinute = periodStart + frac * PERIOD_MINUTES
        }
        points.push({ gameMinute, homeWP: clampPct(row.home_win_probability * 100) })
      })
    }
    // Rows within a known period are pushed in source (chronological) order;
    // sort defensively in case periods are interleaved or out of order.
    points.sort((a, b) => a.gameMinute - b.gameMinute)
  } else {
    valid.forEach((row, idx) => {
      const frac = idx / (valid.length - 1)
      points.push({ gameMinute: frac * MIN_PERIODS * PERIOD_MINUTES, homeWP: clampPct(row.home_win_probability * 100) })
    })
  }

  const maxPeriod = anyPeriodKnown ? Math.max(MIN_PERIODS, ...byPeriod.keys()) : MIN_PERIODS
  return { points, totalMinutes: maxPeriod * PERIOD_MINUTES }
}

export function WinProbabilityChart({ drives, lineScores, game, serverWP }: WinProbabilityChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)

  const finalHome = lineScores.home.reduce((s, q) => s + q, 0)
  const finalAway = lineScores.away.reduce((s, q) => s + q, 0)

  const homeColor = game.homeColor || '#333333'
  const awayColor = game.awayColor || '#666666'

  const wpData = useMemo(() => buildWPData(drives, finalHome, finalAway), [drives, finalHome, finalAway])
  const serverData = useMemo(() => buildServerWPData(serverWP), [serverWP])

  // Prefer real per-play win probability whenever there's enough of it to
  // draw a line; otherwise fall back to the score-based heuristic above.
  const usingServerData = serverData.points.length >= 2
  const totalMinutes = usingServerData ? serverData.totalMinutes : TOTAL_MINUTES
  const periodCount = totalMinutes / PERIOD_MINUTES

  // Screen-space line points for roughjs and area fills
  const screenPoints = useMemo(() => {
    const source = usingServerData ? serverData.points : wpData
    return source.map(p => ({ x: xScale(p.gameMinute, totalMinutes), y: yScale(p.homeWP), wp: p.homeWP }))
  }, [usingServerData, serverData, wpData, totalMinutes])

  // Period dividers/labels, generalized from the original fixed 4-quarter
  // layout so OT periods (5+) extend the axis instead of being clipped.
  // periodCount === 4 (the default/heuristic case) reproduces the original
  // QUARTER_MINUTES=[15,30,45] / Q1-Q4 output exactly.
  const dividerMinutes = useMemo(
    () => Array.from({ length: periodCount - 1 }, (_, i) => (i + 1) * PERIOD_MINUTES),
    [periodCount]
  )
  const periodLabels = useMemo(
    () => Array.from({ length: periodCount }, (_, i) => ({
      index: i,
      centerMinute: i * PERIOD_MINUTES + PERIOD_MINUTES / 2,
      label: i < 4 ? `Q${i + 1}` : `OT${i - 3}`,
    })),
    [periodCount]
  )

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
        aria-label={`Win probability (${usingServerData ? 'CFBD win probability model' : 'estimated from scores'}): ${game.home_team} ${finalHome}, ${game.away_team} ${finalAway}`}
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

        {/* Period dividers (quarter dividers, plus OT dividers when the
            server-data path reports more than 4 periods) */}
        {dividerMinutes.map(m => (
          <line
            key={`q-${m}`}
            x1={xScale(m, totalMinutes)}
            y1={MARGIN.top}
            x2={xScale(m, totalMinutes)}
            y2={HEIGHT - MARGIN.bottom}
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray="6,4"
          />
        ))}

        {/* Period labels (Q1-Q4, then OT1/OT2/... beyond regulation) */}
        {periodLabels.map(({ index, centerMinute, label }) => (
          <text
            key={`qlabel-${index}`}
            x={xScale(centerMinute, totalMinutes)}
            y={HEIGHT - MARGIN.bottom + 16}
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize={11}
            fontFamily="var(--font-body)"
          >
            {label}
          </text>
        ))}

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
      <p className="mt-1 text-right text-[10px] text-[var(--text-muted)]">
        {usingServerData ? 'Source: CFBD win probability model' : 'Estimated from scores (CFBD win probability data unavailable for this game)'}
      </p>
    </div>
  )
}
