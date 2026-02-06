'use client'

import { useEffect, useCallback } from 'react'
import { useRoughSvg } from '@/hooks/useRoughSvg'
import type { GameDrive } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BAR_HEIGHT = 14
const ROW_HEIGHT = 36
const YARD_MARKERS = [20, 40, 50, 60, 80] // absolute 0-100 scale positions
const YARD_LABELS = ['Own 20', 'Own 40', '50', 'Opp 40', 'Opp 20']

const OUTCOME_COLOR_MAP: Record<string, string> = {
  touchdown: 'var(--color-positive)',
  field_goal: 'var(--color-field-goal)',
  punt: 'var(--color-neutral)',
  turnover: 'var(--color-negative)',
  downs: 'var(--color-run)',
  end_of_half: 'var(--color-pass)',
}

const RESULT_LABELS: Record<string, string> = {
  touchdown: 'TD',
  field_goal: 'FG',
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
  if (r === 'TD' || r.includes('TOUCHDOWN')) return 'touchdown'
  if (r === 'FG' || r.includes('FIELD GOAL')) return 'field_goal'
  if (r === 'PUNT') return 'punt'
  if (r === 'INT' || r === 'FUMBLE' || r.includes('INTERCEPT') || r.includes('FUMBLE')) return 'turnover'
  if (r === 'DOWNS' || r.includes('DOWNS')) return 'downs'
  if (r.includes('END OF HALF') || r.includes('END OF GAME') || r.includes('HALF')) return 'end_of_half'
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
  // Common multi-word abbreviations
  const words = name.split(/\s+/)
  if (words.length === 1) return name.slice(0, 3).toUpperCase()
  // Use first letter of each word (up to 4)
  return words.slice(0, 4).map(w => w[0]).join('').toUpperCase()
}

// ---------------------------------------------------------------------------
// Component
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

    // Clear old rough elements
    const existing = svg.querySelectorAll('.rough-bar')
    existing.forEach(el => el.remove())

    const chartArea = svg.querySelector('.chart-area')
    if (!chartArea) return
    const chartWidth = chartArea.getBoundingClientRect().width

    drives.forEach((drive, i) => {
      const outcome = mapDriveResult(drive.drive_result)
      const colorVar = getOutcomeColor(outcome)
      const color = resolveColor(colorVar)

      // Field position: start at own (100 - yards_to_goal), end at (100 - end_yards_to_goal)
      const startX = (100 - drive.start_yards_to_goal) / 100
      const endX = (100 - drive.end_yards_to_goal) / 100
      const x = Math.min(startX, endX) * chartWidth
      const w = Math.max(Math.abs(endX - startX) * chartWidth, 3) // minimum 3px width
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

  const totalHeight = drives.length * ROW_HEIGHT

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Yard marker header */}
        <div className="flex">
          {/* Left spacer for team column */}
          <div className="w-[72px] shrink-0" />
          {/* Chart header */}
          <div className="flex-1 relative h-6 border-b border-[var(--border)]">
            {YARD_MARKERS.map((yard, i) => (
              <span
                key={yard}
                className="absolute text-[10px] text-[var(--text-muted)] -translate-x-1/2"
                style={{ left: `${yard}%` }}
              >
                {YARD_LABELS[i]}
              </span>
            ))}
          </div>
          {/* Right spacer for result column */}
          <div className="w-[110px] shrink-0" />
        </div>

        {/* Drive rows */}
        <div className="flex">
          {/* Left column: team indicators */}
          <div className="w-[72px] shrink-0">
            {drives.map((drive, i) => {
              const isHome = drive.is_home_offense
              const color = isHome ? game.homeColor : game.awayColor
              const teamName = drive.offense
              return (
                <div
                  key={i}
                  className={`flex items-center gap-1.5 px-1 ${
                    i % 2 === 0 ? 'bg-[var(--bg-surface)]' : ''
                  }`}
                  style={{ height: ROW_HEIGHT }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: color ?? 'var(--text-muted)' }}
                  />
                  <span className="text-[11px] text-[var(--text-secondary)] font-medium truncate">
                    {abbreviateTeam(teamName)}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Center: SVG chart area */}
          <div className="flex-1 relative">
            <svg
              ref={svgRef}
              width="100%"
              height={totalHeight}
              className="block"
            >
              {/* Alternating row backgrounds */}
              {drives.map((_, i) => (
                i % 2 === 0 ? (
                  <rect
                    key={`bg-${i}`}
                    x={0}
                    y={i * ROW_HEIGHT}
                    width="100%"
                    height={ROW_HEIGHT}
                    fill="var(--bg-surface)"
                  />
                ) : null
              ))}
              {/* Yard marker lines */}
              {YARD_MARKERS.map(yard => (
                <line
                  key={`line-${yard}`}
                  x1={`${yard}%`}
                  y1={0}
                  x2={`${yard}%`}
                  y2={totalHeight}
                  stroke="var(--border)"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
              ))}
              {/* 50-yard line slightly more prominent */}
              <line
                x1="50%"
                y1={0}
                x2="50%"
                y2={totalHeight}
                stroke="var(--text-muted)"
                strokeWidth={1}
                opacity={0.4}
              />
              {/* Rough bars get appended here */}
              <g className="chart-area" />
            </svg>
          </div>

          {/* Right column: result + stats */}
          <div className="w-[110px] shrink-0">
            {drives.map((drive, i) => {
              const outcome = mapDriveResult(drive.drive_result)
              const label = RESULT_LABELS[outcome] ?? drive.drive_result
              const colorVar = getOutcomeColor(outcome)
              return (
                <div
                  key={i}
                  className={`flex items-center gap-1.5 px-2 ${
                    i % 2 === 0 ? 'bg-[var(--bg-surface)]' : ''
                  }`}
                  style={{ height: ROW_HEIGHT }}
                >
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${colorVar} 15%, transparent)`,
                      color: colorVar,
                    }}
                  >
                    {label}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">
                    {drive.plays}p&middot;{drive.yards}yd
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
