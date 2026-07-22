'use client'

import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { ChartLine } from '@phosphor-icons/react'
import * as d3 from 'd3'
import rough from 'roughjs'
import { CHART_INK, resolveColor, useChartTheme } from '@/lib/charts/theme'
import { teamInk } from '@/lib/charts/series'
import { ChartFrame } from '@/lib/charts/ChartFrame'
import { gridLinesY, axisLabelsY, axisLabelsX } from '@/lib/charts/axes'
import type { ChartLayout } from '@/lib/charts/axes'

interface BumpsChartProps {
  data: { week: number; rankings: { rank: number; school: string; color: string | null }[] }[]
  poll: string
  onTeamClick?: (school: string) => void
}

const WIDTH = 700
// Taller than the 350 default: 25 rank rows need the vertical room to stay
// legible (spec §9 Gate B ruling — heights vary with information density).
const HEIGHT = 600
// Right gutter widened beyond the default for the edge team labels
// (spec §9 Gate B ruling: directional padding deviations are named —
// same reason as WinProbabilityChart's wide right gutter).
const PADDING = { top: 30, right: 150, bottom: 50, left: 60 }
const LAYOUT: ChartLayout = { width: WIDTH, height: HEIGHT, padding: PADDING }

/** Stable wobble (spec §9): identical strokes across re-renders and theme flips. */
const ROUGH_SEED = 57

const RANK_TICKS = [1, 5, 10, 15, 20, 25]
const MAX_LABEL_LENGTH = 16

interface WeekRank {
  week: number
  rank: number
}

interface TeamGeometry {
  school: string
  color: string | null
  /** d3 curveMonotoneX path strings, one per continuous ranked segment (≥2 weeks). */
  segmentPaths: string[]
  /** Every ranked-week point, for the hovered team's rough dots. */
  points: { x: number; y: number }[]
  /** Single ranked weeks flanked by unranked gaps — no line, so always dotted. */
  isolatedPoints: { x: number; y: number }[]
  labelY: number
}

function truncateName(name: string) {
  if (name.length <= MAX_LABEL_LENGTH) return name
  return name.slice(0, MAX_LABEL_LENGTH - 1) + '…'
}

/**
 * Splits a team's ranked weeks into continuous segments: a gap opens whenever
 * the poll published an intermediate week in which the team went unranked.
 */
function buildSegments(weeks: WeekRank[], weekIndex: Map<number, number>): WeekRank[][] {
  const segments: WeekRank[][] = []
  let current: WeekRank[] = [weeks[0]]

  for (let i = 1; i < weeks.length; i++) {
    const prevIdx = weekIndex.get(weeks[i - 1].week) ?? 0
    const currIdx = weekIndex.get(weeks[i].week) ?? 0
    if (currIdx - prevIdx > 1) {
      segments.push(current)
      current = [weeks[i]]
    } else {
      current.push(weeks[i])
    }
  }
  segments.push(current)
  return segments
}

export function BumpsChart({ data, poll, onTeamClick }: BumpsChartProps) {
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)

  // Chart geometry (spec §1.3): scales, d3-generated curve paths, ticks --
  // computed here, never inside drawChart. d3 stays for the geometry math;
  // roughjs only inks the results.
  const chartGeometry = useMemo(() => {
    const weekNumbers = data.map(d => d.week).sort((a, b) => a - b)
    if (weekNumbers.length < 2) return null

    // Build per-team ranked-week series
    const teamMap = new Map<string, { school: string; color: string | null; weeks: WeekRank[] }>()
    for (const weekData of data) {
      for (const r of weekData.rankings) {
        const existing = teamMap.get(r.school)
        if (existing) {
          existing.weeks.push({ week: weekData.week, rank: r.rank })
          if (r.color && !existing.color) existing.color = r.color
        } else {
          teamMap.set(r.school, {
            school: r.school,
            color: r.color,
            weeks: [{ week: weekData.week, rank: r.rank }],
          })
        }
      }
    }

    // Teams ranked in at least 2 weeks, ordered by last known rank
    const sortedTeams = Array.from(teamMap.values())
      .filter(t => t.weeks.length >= 2)
      .map(t => ({ ...t, weeks: [...t.weeks].sort((a, b) => a.week - b.week) }))
      .sort(
        (a, b) => a.weeks[a.weeks.length - 1].rank - b.weeks[b.weeks.length - 1].rank,
      )
    if (sortedTeams.length === 0) return null

    const xScale = d3
      .scaleLinear()
      .domain(d3.extent(weekNumbers) as [number, number])
      .range([PADDING.left, WIDTH - PADDING.right])

    const yScale = d3
      .scaleLinear()
      .domain([1, 25])
      .range([PADDING.top, HEIGHT - PADDING.bottom])

    const lineGenerator = d3
      .line<WeekRank>()
      .x(d => xScale(d.week))
      .y(d => yScale(d.rank))
      .curve(d3.curveMonotoneX)

    const weekIndex = new Map(weekNumbers.map((w, i) => [w, i]))

    const teamGeometries: TeamGeometry[] = sortedTeams.map(team => {
      const segments = buildSegments(team.weeks, weekIndex)
      return {
        school: team.school,
        color: team.color,
        segmentPaths: segments
          .filter(s => s.length >= 2)
          .map(s => lineGenerator(s) || '')
          .filter(Boolean),
        points: team.weeks.map(w => ({ x: xScale(w.week), y: yScale(w.rank) })),
        isolatedPoints: segments
          .filter(s => s.length === 1)
          .map(s => ({ x: xScale(s[0].week), y: yScale(s[0].rank) })),
        labelY: yScale(team.weeks[team.weeks.length - 1].rank),
      }
    })

    // Right-edge label collision pass: a team that fell out of the poll
    // keeps its label at its last-held rank, colliding with the label of
    // the team currently holding that rank (real AP data ties several
    // final positions this way). Greedy top-down dodge with a minimum
    // vertical gap, then a bottom-up clamp back inside the plot.
    const MIN_LABEL_GAP = 13 // text-xs line, ~12px glyphs + 1px breathing room
    const byLabelY = [...teamGeometries].sort((a, b) => a.labelY - b.labelY)
    for (let i = 1; i < byLabelY.length; i++) {
      if (byLabelY[i].labelY - byLabelY[i - 1].labelY < MIN_LABEL_GAP) {
        byLabelY[i].labelY = byLabelY[i - 1].labelY + MIN_LABEL_GAP
      }
    }
    const maxLabelY = HEIGHT - PADDING.bottom
    for (let i = byLabelY.length - 1; i >= 0; i--) {
      const limit =
        i === byLabelY.length - 1 ? maxLabelY : byLabelY[i + 1].labelY - MIN_LABEL_GAP
      if (byLabelY[i].labelY > limit) byLabelY[i].labelY = limit
    }

    // Axis ticks: rank rows on the left, weeks along the bottom gutter
    const yTicks = RANK_TICKS.map(rank => ({ pct: (rank - 1) / 24, val: rank }))
    const step = weekNumbers.length > 10 ? 2 : 1
    const xTicks = weekNumbers
      .filter((_, i) => i % step === 0 || i === weekNumbers.length - 1)
      .map(week => ({ x: xScale(week), label: `Wk ${week}` }))

    return { teamGeometries, yTicks, xTicks, firstWeek: weekNumbers[0], lastWeek: weekNumbers[weekNumbers.length - 1] }
  }, [data])

  // Rough ink layer: one <g> per team so emphasis dims whole teams at once.
  // Hover state is a draw input — the seeded wobble keeps unhovered strokes
  // pixel-identical across redraws, so only opacity/weight visibly change.
  const drawChart = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group || !chartGeometry) return

    while (group.firstChild) group.removeChild(group.firstChild)

    const rc = rough.svg(svg)
    const surfaceColor = resolveColor(CHART_INK.surface)
    const { teamGeometries } = chartGeometry

    // Hovered team draws last for z-order
    const drawOrder = hoveredTeam
      ? [...teamGeometries.filter(t => t.school !== hoveredTeam),
         ...teamGeometries.filter(t => t.school === hoveredTeam)]
      : teamGeometries

    for (const team of drawOrder) {
      const isHovered = hoveredTeam === team.school
      // Away-style muted fallback for missing team colors (spec §6): every
      // line here is a peer series, none is "home".
      const ink = teamInk(team.color, 'muted')

      const teamGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      teamGroup.setAttribute('data-school', team.school)
      teamGroup.style.opacity =
        hoveredTeam === null ? '0.6' : isHovered ? '1' : '0.15'

      // Dense multi-series deviation (spec §9): with ~25 concurrent team
      // lines the secondary weight muddies the plot, so idle/dimmed lines
      // drop to the tertiary values (1.5 / 0.5 / 0.2); the hovered team
      // takes the primary hierarchy (3 / 1.0 / 0.4).
      const lineOptions = isHovered
        ? { stroke: ink, strokeWidth: 3, roughness: 1.0, bowing: 0.4, seed: ROUGH_SEED }
        : { stroke: ink, strokeWidth: 1.5, roughness: 0.5, bowing: 0.2, seed: ROUGH_SEED }

      for (const d of team.segmentPaths) {
        teamGroup.appendChild(rc.path(d, lineOptions))
      }

      // Isolated single-week appearances have no line — keep them visible.
      // Roughness 0.5 (below the series defaults, spec §9): default
      // roughness distorts small circles into scribbles.
      for (const p of team.isolatedPoints) {
        teamGroup.appendChild(rc.circle(p.x, p.y, 6, {
          fill: ink, fillStyle: 'solid',
          stroke: ink, strokeWidth: 1.5, roughness: 0.5, seed: ROUGH_SEED,
        }))
      }

      // Per-week dots only on the hovered team: at ~25 series the idle chart
      // reads cleaner as lines, and hover emphasis gains a marked point per
      // ranked week (replaces the old always-on native dots).
      if (isHovered) {
        for (const p of team.points) {
          teamGroup.appendChild(rc.circle(p.x, p.y, 8, {
            fill: surfaceColor, fillStyle: 'solid',
            stroke: ink, strokeWidth: 2, roughness: 0.5, seed: ROUGH_SEED,
          }))
        }
      }

      group.appendChild(teamGroup)
    }
  }, [chartGeometry, hoveredTeam])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Redraw on theme change
  useChartTheme(drawChart)

  return (
    <ChartFrame
      title={`Season Trajectory — ${poll}`}
      ariaLabel={
        chartGeometry
          ? `${poll} ranking trajectories: team rank by week, weeks ${chartGeometry.firstWeek} to ${chartGeometry.lastWeek}`
          : `${poll} ranking trajectory chart`
      }
      empty={!chartGeometry}
      emptyState={{
        icon: ChartLine,
        title: 'No ranking trajectory yet',
        description: 'Trajectories draw once a poll has at least two ranked weeks.',
      }}
    >
      {a11y => {
        const { teamGeometries, yTicks, xTicks } = chartGeometry!

        return (
          <>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Hover to highlight a team. Click a team name to view details.
            </p>

            <svg
              ref={svgRef}
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="w-full h-auto"
              {...a11y}
            >
              {/* Static scaffold: grid + axis labels */}
              {gridLinesY(yTicks, LAYOUT)}
              {axisLabelsY(yTicks, val => String(val), LAYOUT)}
              {axisLabelsX(xTicks, LAYOUT)}

              {/* Rough-drawn team lines */}
              <g ref={roughGroupRef} data-testid="rough-layer" />

              {/* Interaction layer: transparent widened strokes over each
                  team's curve (spec §1.5) */}
              {teamGeometries.map(team =>
                team.segmentPaths.map((d, i) => (
                  <path
                    key={`${team.school}-hit-${i}`}
                    data-hit={team.school}
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                    style={{ pointerEvents: 'stroke' }}
                    onMouseEnter={() => setHoveredTeam(team.school)}
                    onMouseLeave={() => setHoveredTeam(null)}
                  />
                )),
              )}

              {/* Right-edge team labels: native scaffold text in token ink --
                  team hex stays in the rough layer only (spec §6) */}
              {teamGeometries.map(team => (
                <text
                  key={`label-${team.school}`}
                  x={WIDTH - PADDING.right + 8}
                  y={team.labelY}
                  textAnchor="start"
                  dominantBaseline="central"
                  opacity={hoveredTeam === null || hoveredTeam === team.school ? 1 : 0.3}
                  className={
                    hoveredTeam === team.school
                      ? 'fill-[var(--text-primary)] text-xs font-medium'
                      : 'fill-[var(--text-secondary)] text-xs'
                  }
                  style={{ cursor: onTeamClick ? 'pointer' : 'default' }}
                  onMouseEnter={() => setHoveredTeam(team.school)}
                  onMouseLeave={() => setHoveredTeam(null)}
                  onClick={() => onTeamClick?.(team.school)}
                >
                  {truncateName(team.school)}
                </text>
              ))}
            </svg>
          </>
        )
      }}
    </ChartFrame>
  )
}
