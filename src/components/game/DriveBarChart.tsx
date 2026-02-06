'use client'

import { useEffect, useCallback } from 'react'
import { useRoughSvg } from '@/hooks/useRoughSvg'
import type { GameDrive } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_WIDTH = 800
const TEAM_COL_WIDTH = 72
const RESULT_COL_WIDTH = 110
const TOTAL_WIDTH = TEAM_COL_WIDTH + CHART_WIDTH + RESULT_COL_WIDTH
const BAR_HEIGHT = 14
const ROW_HEIGHT = 36
const YARD_MARKERS = [20, 40, 50, 60, 80]
const YARD_LABELS = ['Own 20', 'Own 40', '50', 'Opp 40', 'Opp 20']

const OUTCOME_COLOR_MAP: Record<string, string> = {
  touchdown: 'var(--color-positive)',
  field_goal: 'var(--color-field-goal)',
  missed_fg: 'var(--color-field-goal)',
  safety: 'var(--color-negative)',
  punt: 'var(--color-neutral)',
  turnover: 'var(--color-negative)',
  downs: 'var(--color-run)',
  end_of_half: 'var(--color-pass)',
}

const RESULT_LABELS: Record<string, string> = {
  touchdown: 'TD',
  field_goal: 'FG',
  missed_fg: 'MISS',
  safety: 'SAF',
  punt: 'PUNT',
  turnover: 'TO',
  downs: 'DOWNS',
  end_of_half: 'END',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapDriveResult(driveResult: string): string {
  const r = driveResult.toUpperCase()
  if (r.includes('TD') || r.includes('TOUCHDOWN') || r.includes('TOUCH')) return 'touchdown'
  if (r === 'MISSED FG' || r === 'FG MISSED' || r === 'BLOCKED FG') return 'missed_fg'
  if (r === 'FG' || r.includes('FIELD GOAL') || r === 'FG GOOD' || r === 'MADE FG') return 'field_goal'
  if (r === 'SF' || r.includes('SAFETY')) return 'safety'
  if (r === 'PUNT' || r === 'BLOCKED PUNT') return 'punt'
  if (r === 'INT' || r === 'FUMBLE' || r.includes('INTERCEPT') || r.includes('FUMBLE')) return 'turnover'
  if (r.includes('DOWNS')) return 'downs'
  if (r.includes('END OF') || r.includes('HALF') || r.includes('4TH QUARTER')) return 'end_of_half'
  if (r === 'KICKOFF') return 'end_of_half'
  return 'uncategorized'
}

function resolveColor(cssVar: string): string {
  if (typeof document === 'undefined') return '#999'
  const match = cssVar.match(/var\((.+)\)/)
  if (!match) return cssVar
  return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || '#999'
}

function getOutcomeColor(outcome: string): string {
  return OUTCOME_COLOR_MAP[outcome] ?? 'var(--text-muted)'
}

function abbreviateTeam(name: string): string {
  const words = name.split(/\s+/)
  if (words.length === 1) return name.slice(0, 3).toUpperCase()
  return words.slice(0, 4).map(w => w[0]).join('').toUpperCase()
}

// ---------------------------------------------------------------------------
// Component — Single SVG approach for perfect row alignment
// ---------------------------------------------------------------------------

interface DriveBarChartProps {
  drives: GameDrive[]
  game: GameWithTeams
}

export function DriveBarChart({ drives, game }: DriveBarChartProps) {
  const { svgRef, rc } = useRoughSvg()

  const drawBars = useCallback(() => {
    if (!rc || !svgRef.current) return
    const svg = svgRef.current

    const existing = svg.querySelectorAll('.rough-bar')
    existing.forEach(el => el.remove())

    const chartArea = svg.querySelector('.chart-area')
    if (!chartArea) return

    drives.forEach((drive, i) => {
      const outcome = mapDriveResult(drive.drive_result)
      const colorVar = getOutcomeColor(outcome)
      const color = resolveColor(colorVar)

      const startX = (100 - drive.start_yards_to_goal) / 100
      const endX = (100 - drive.end_yards_to_goal) / 100
      const x = TEAM_COL_WIDTH + Math.min(startX, endX) * CHART_WIDTH
      const w = Math.max(Math.abs(endX - startX) * CHART_WIDTH, 3)
      const y = i * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2

      const rect = rc.rectangle(x, y, w, BAR_HEIGHT, {
        fill: color,
        fillStyle: 'solid',
        stroke: color,
        strokeWidth: 1,
        roughness: 1.2,
      })
      rect.classList.add('rough-bar')
      chartArea.appendChild(rect)
    })
  }, [rc, svgRef, drives])

  useEffect(() => {
    drawBars()
  }, [drawBars])

  // Redraw on theme change
  useEffect(() => {
    const observer = new MutationObserver(() => {
      requestAnimationFrame(drawBars)
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
    return () => observer.disconnect()
  }, [drawBars])

  const headerHeight = 20
  const totalHeight = drives.length * ROW_HEIGHT

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${TOTAL_WIDTH} ${headerHeight + totalHeight}`}
          className="w-full block"
          role="img"
          aria-label={`Drive chart: ${drives.length} drives for ${game.home_team} vs ${game.away_team}`}
        >
          {/* ===== HEADER ROW ===== */}
          {/* Bottom border for header */}
          <line
            x1={TEAM_COL_WIDTH}
            y1={headerHeight}
            x2={TEAM_COL_WIDTH + CHART_WIDTH}
            y2={headerHeight}
            stroke="var(--border)"
            strokeWidth={1}
          />
          {/* Yard marker labels */}
          {YARD_MARKERS.map((yard, idx) => (
            <text
              key={`hdr-${yard}`}
              x={TEAM_COL_WIDTH + (yard / 100) * CHART_WIDTH}
              y={headerHeight - 5}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize={10}
              fontFamily="var(--font-body)"
            >
              {YARD_LABELS[idx]}
            </text>
          ))}

          {/* ===== DRIVE ROWS ===== */}
          <g transform={`translate(0, ${headerHeight})`}>
            {/* Alternating row backgrounds — full width for perfect alignment */}
            {drives.map((_, i) => (
              i % 2 === 0 ? (
                <rect
                  key={`bg-${i}`}
                  x={0}
                  y={i * ROW_HEIGHT}
                  width={TOTAL_WIDTH}
                  height={ROW_HEIGHT}
                  fill="var(--bg-surface)"
                />
              ) : null
            ))}

            {/* Yard marker lines in chart area */}
            {YARD_MARKERS.map(yard => (
              <line
                key={`line-${yard}`}
                x1={TEAM_COL_WIDTH + (yard / 100) * CHART_WIDTH}
                y1={0}
                x2={TEAM_COL_WIDTH + (yard / 100) * CHART_WIDTH}
                y2={totalHeight}
                stroke="var(--border)"
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ))}
            {/* 50-yard line */}
            <line
              x1={TEAM_COL_WIDTH + CHART_WIDTH / 2}
              y1={0}
              x2={TEAM_COL_WIDTH + CHART_WIDTH / 2}
              y2={totalHeight}
              stroke="var(--text-muted)"
              strokeWidth={1}
              opacity={0.4}
            />

            {/* Team indicators (left column) */}
            {drives.map((drive, i) => {
              const isHome = drive.is_home_offense
              const color = isHome ? game.homeColor : game.awayColor
              const teamName = drive.offense
              const cy = i * ROW_HEIGHT + ROW_HEIGHT / 2
              return (
                <g key={`team-${drive.drive_number}`}>
                  <circle
                    cx={10}
                    cy={cy}
                    r={4}
                    fill={color ?? 'var(--text-muted)'}
                  />
                  <text
                    x={20}
                    y={cy}
                    dominantBaseline="central"
                    fill="var(--text-secondary)"
                    fontSize={11}
                    fontWeight={500}
                    fontFamily="var(--font-body)"
                  >
                    {abbreviateTeam(teamName)}
                  </text>
                </g>
              )
            })}

            {/* Result labels (right column) */}
            {drives.map((drive, i) => {
              const outcome = mapDriveResult(drive.drive_result)
              const label = RESULT_LABELS[outcome] ?? drive.drive_result
              const colorVar = getOutcomeColor(outcome)
              const color = resolveColor(colorVar)
              const cy = i * ROW_HEIGHT + ROW_HEIGHT / 2
              const rightX = TEAM_COL_WIDTH + CHART_WIDTH + 6

              return (
                <g key={`result-${drive.drive_number}`}>
                  {/* Result badge background */}
                  <rect
                    x={rightX}
                    y={cy - 8}
                    width={label.length * 7 + 8}
                    height={16}
                    rx={2}
                    fill={color}
                    opacity={0.15}
                  />
                  <text
                    x={rightX + 4}
                    y={cy}
                    dominantBaseline="central"
                    fill={color}
                    fontSize={10}
                    fontWeight={700}
                    fontFamily="var(--font-body)"
                  >
                    {label}
                  </text>
                  {/* Stats */}
                  <text
                    x={rightX + label.length * 7 + 14}
                    y={cy}
                    dominantBaseline="central"
                    fill="var(--text-muted)"
                    fontSize={10}
                    fontFamily="var(--font-body)"
                  >
                    {drive.plays}p·{drive.yards}yd
                  </text>
                </g>
              )
            })}

            {/* Rough bars get appended here */}
            <g className="chart-area" />
          </g>
        </svg>
      </div>
    </div>
  )
}
