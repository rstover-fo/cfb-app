'use client'

import { useMemo, useState } from 'react'
import * as d3 from 'd3'

interface BumpsChartTeam {
  school: string
  color: string | null
  weeks: { week: number; rank: number }[]
}

interface BumpsChartProps {
  data: { week: number; rankings: { rank: number; school: string; color: string | null }[] }[]
  poll: string
  onTeamClick?: (school: string) => void
}

const WIDTH = 900
const HEIGHT = 600
const MARGIN = { top: 40, right: 160, bottom: 40, left: 50 }

const RANK_TICKS = [1, 5, 10, 15, 20, 25]
const MAX_LABEL_LENGTH = 16

export function BumpsChart({ data, poll, onTeamClick }: BumpsChartProps) {
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null)

  // Build team data: Map<school, BumpsChartTeam>
  const teams = useMemo(() => {
    const teamMap = new Map<string, BumpsChartTeam>()

    for (const weekData of data) {
      for (const r of weekData.rankings) {
        const existing = teamMap.get(r.school)
        if (existing) {
          existing.weeks.push({ week: weekData.week, rank: r.rank })
          // Update color if we get one
          if (r.color && !existing.color) {
            existing.color = r.color
          }
        } else {
          teamMap.set(r.school, {
            school: r.school,
            color: r.color,
            weeks: [{ week: weekData.week, rank: r.rank }],
          })
        }
      }
    }

    // Filter to teams that appear in at least 2 weeks
    const filtered = new Map<string, BumpsChartTeam>()
    for (const [school, team] of teamMap) {
      if (team.weeks.length >= 2) {
        // Sort weeks
        team.weeks.sort((a, b) => a.week - b.week)
        filtered.set(school, team)
      }
    }

    return filtered
  }, [data])

  // Sort teams by last known rank for label ordering
  const sortedTeams = useMemo(() => {
    return Array.from(teams.values()).sort((a, b) => {
      const lastA = a.weeks[a.weeks.length - 1].rank
      const lastB = b.weeks[b.weeks.length - 1].rank
      return lastA - lastB
    })
  }, [teams])

  // Get all week numbers for x-axis
  const weekNumbers = useMemo(() => {
    return data.map(d => d.week).sort((a, b) => a - b)
  }, [data])

  // Scales
  const xScale = useMemo(() => {
    return d3.scaleLinear()
      .domain(d3.extent(weekNumbers) as [number, number])
      .range([MARGIN.left, WIDTH - MARGIN.right])
  }, [weekNumbers])

  const yScale = useMemo(() => {
    return d3.scaleLinear()
      .domain([1, 25])
      .range([MARGIN.top, HEIGHT - MARGIN.bottom])
  }, [])

  // Line generator
  const lineGenerator = useMemo(() => {
    return d3.line<{ week: number; rank: number }>()
      .x(d => xScale(d.week))
      .y(d => yScale(d.rank))
      .curve(d3.curveMonotoneX)
  }, [xScale, yScale])

  // Break team weeks into continuous segments (no gaps)
  const getSegments = (weeks: { week: number; rank: number }[]): { week: number; rank: number }[][] => {
    if (weeks.length === 0) return []

    const weekSet = new Set(weekNumbers)
    const segments: { week: number; rank: number }[][] = []
    let current: { week: number; rank: number }[] = [weeks[0]]

    for (let i = 1; i < weeks.length; i++) {
      const prev = weeks[i - 1]
      const curr = weeks[i]

      // Check if there's a gap: any week between prev and curr where this team wasn't ranked
      const prevIdx = weekNumbers.indexOf(prev.week)
      const currIdx = weekNumbers.indexOf(curr.week)

      if (currIdx - prevIdx > 1) {
        // There's at least one intermediate week - check if team was ranked in all of them
        let hasGap = false
        for (let j = prevIdx + 1; j < currIdx; j++) {
          const intermediateWeek = weekNumbers[j]
          if (weekSet.has(intermediateWeek)) {
            // This week exists in data but team wasn't ranked
            hasGap = true
            break
          }
        }
        if (hasGap) {
          // End current segment, start new one
          if (current.length >= 2) segments.push(current)
          current = [curr]
          continue
        }
      }

      current.push(curr)
    }

    if (current.length >= 2) segments.push(current)
    return segments
  }

  // Determine opacity and stroke width for a team
  const getTeamStyle = (school: string) => {
    if (hoveredTeam === null) {
      return { opacity: 0.6, strokeWidth: 2 }
    }
    if (hoveredTeam === school) {
      return { opacity: 1, strokeWidth: 3 }
    }
    return { opacity: 0.15, strokeWidth: 2 }
  }

  const getTeamColor = (team: BumpsChartTeam) => {
    return team.color || 'var(--text-muted)'
  }

  const truncateName = (name: string) => {
    if (name.length <= MAX_LABEL_LENGTH) return name
    return name.slice(0, MAX_LABEL_LENGTH - 1) + '\u2026'
  }

  // Separate hovered team from rest for z-ordering
  const nonHoveredTeams = hoveredTeam
    ? sortedTeams.filter(t => t.school !== hoveredTeam)
    : sortedTeams

  const hoveredTeamData = hoveredTeam ? teams.get(hoveredTeam) : null

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        aria-label={`${poll} ranking trajectory chart`}
        role="img"
        style={{ fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}
      >
        {/* Horizontal grid lines at key ranks */}
        {RANK_TICKS.map(rank => (
          <line
            key={`grid-${rank}`}
            x1={MARGIN.left}
            x2={WIDTH - MARGIN.right}
            y1={yScale(rank)}
            y2={yScale(rank)}
            stroke="var(--border)"
            strokeWidth={0.5}
            strokeDasharray="4,4"
          />
        ))}

        {/* Week labels along top */}
        {weekNumbers.map(week => (
          <text
            key={`week-${week}`}
            x={xScale(week)}
            y={MARGIN.top - 12}
            textAnchor="middle"
            fontSize={11}
            fill="var(--text-muted)"
          >
            Wk {week}
          </text>
        ))}

        {/* Rank labels along left */}
        {RANK_TICKS.map(rank => (
          <text
            key={`rank-${rank}`}
            x={MARGIN.left - 12}
            y={yScale(rank)}
            textAnchor="end"
            dominantBaseline="central"
            fontSize={11}
            fill="var(--text-muted)"
          >
            {rank}
          </text>
        ))}

        {/* Non-hovered team paths */}
        {nonHoveredTeams.map(team => {
          const segments = getSegments(team.weeks)
          const style = getTeamStyle(team.school)
          const color = getTeamColor(team)

          return (
            <g key={team.school}>
              {segments.map((segment, i) => (
                <path
                  key={`${team.school}-seg-${i}`}
                  d={lineGenerator(segment) || ''}
                  fill="none"
                  stroke={color}
                  strokeWidth={style.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={style.opacity}
                  style={{ pointerEvents: 'stroke' }}
                  onMouseEnter={() => setHoveredTeam(team.school)}
                  onMouseLeave={() => setHoveredTeam(null)}
                />
              ))}
            </g>
          )
        })}

        {/* Hovered team path (rendered last for z-order) */}
        {hoveredTeamData && (() => {
          const segments = getSegments(hoveredTeamData.weeks)
          const style = getTeamStyle(hoveredTeamData.school)
          const color = getTeamColor(hoveredTeamData)

          return (
            <g>
              {segments.map((segment, i) => (
                <path
                  key={`hovered-seg-${i}`}
                  d={lineGenerator(segment) || ''}
                  fill="none"
                  stroke={color}
                  strokeWidth={style.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={style.opacity}
                  style={{ pointerEvents: 'stroke' }}
                  onMouseEnter={() => setHoveredTeam(hoveredTeamData.school)}
                  onMouseLeave={() => setHoveredTeam(null)}
                />
              ))}
            </g>
          )
        })()}

        {/* Data point dots */}
        {sortedTeams.map(team => {
          const style = getTeamStyle(team.school)
          const color = getTeamColor(team)

          return team.weeks.map(w => (
            <circle
              key={`${team.school}-w${w.week}`}
              cx={xScale(w.week)}
              cy={yScale(w.rank)}
              r={hoveredTeam === team.school ? 4 : 3}
              fill={color}
              opacity={style.opacity}
              onMouseEnter={() => setHoveredTeam(team.school)}
              onMouseLeave={() => setHoveredTeam(null)}
            />
          ))
        })}

        {/* Team name labels on right side */}
        {sortedTeams.map(team => {
          const lastWeek = team.weeks[team.weeks.length - 1]
          const style = getTeamStyle(team.school)
          const color = getTeamColor(team)

          return (
            <text
              key={`label-${team.school}`}
              x={WIDTH - MARGIN.right + 8}
              y={yScale(lastWeek.rank)}
              textAnchor="start"
              dominantBaseline="central"
              fontSize={11}
              fill={color}
              opacity={style.opacity}
              style={{ cursor: onTeamClick ? 'pointer' : 'default' }}
              onMouseEnter={() => setHoveredTeam(team.school)}
              onMouseLeave={() => setHoveredTeam(null)}
              onClick={() => onTeamClick?.(team.school)}
            >
              {truncateName(team.school)}
            </text>
          )
        })}
      </svg>
    </div>
  )
}
