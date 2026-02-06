'use client'

import { useEffect, useCallback, useRef, useState, useMemo } from 'react'
import rough from 'roughjs'
import type { RoughSVG } from 'roughjs/bin/svg'
import { FootballField, yardToX } from '@/components/visualizations/FootballField'
import type { GameDrive } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIELD_WIDTH_DEFAULT = 1000
const FIELD_HEIGHT = 400
const END_ZONE_WIDTH = (FIELD_WIDTH_DEFAULT / 120) * 10
const PLAYABLE_WIDTH = FIELD_WIDTH_DEFAULT - 2 * END_ZONE_WIDTH

// Drive swim lanes: home on top half, away on bottom half
const HOME_Y_MIN = 30
const HOME_Y_MAX = 170
const AWAY_Y_MIN = 230
const AWAY_Y_MAX = 370
const DIVIDER_Y = 200

// Arrowhead dimensions
const ARROW_HEAD_LENGTH = 8
const ARROW_HEAD_WIDTH = 5

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

const LEGEND_ITEMS: { key: string; label: string }[] = [
  { key: 'touchdown', label: 'TD' },
  { key: 'field_goal', label: 'FG' },
  { key: 'punt', label: 'Punt' },
  { key: 'turnover', label: 'TO' },
  { key: 'downs', label: 'Downs' },
  { key: 'end_of_half', label: 'End' },
]

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

/** Convert drive yards_to_goal to a 0-100 own-yard-line position */
function toOwnYardLine(yardsToGoal: number): number {
  return 100 - yardsToGoal
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DriveFieldOverlayProps {
  drives: GameDrive[]
  game: GameWithTeams
}

export function DriveFieldOverlay({ drives, game }: DriveFieldOverlayProps) {
  const fieldRef = useRef<SVGSVGElement>(null)
  const [rc, setRc] = useState<RoughSVG | null>(null)

  // Initialize roughjs on the FootballField SVG
  useEffect(() => {
    if (fieldRef.current && !rc) {
      setRc(rough.svg(fieldRef.current))
    }
  }, [rc])

  // Split drives by team (memoized to prevent unnecessary redraws)
  const homeDrives = useMemo(() => drives.filter(d => d.is_home_offense), [drives])
  const awayDrives = useMemo(() => drives.filter(d => !d.is_home_offense), [drives])

  const drawDrives = useCallback(() => {
    if (!rc || !fieldRef.current) return
    const svg = fieldRef.current

    // Clear old rough elements
    svg.querySelectorAll('.rough-drive').forEach(el => el.remove())

    // Find the overlay group inside the FootballField children area
    const overlayGroup = svg.querySelector('.drive-overlay-group')
    if (!overlayGroup) return

    function drawDriveSet(
      driveList: GameDrive[],
      yMin: number,
      yMax: number,
    ) {
      const count = driveList.length
      if (count === 0) return
      const ySpacing = count === 1 ? 0 : (yMax - yMin) / (count - 1)

      driveList.forEach((drive, i) => {
        const outcome = mapDriveResult(drive.drive_result)
        const colorVar = getOutcomeColor(outcome)
        const color = resolveColor(colorVar)

        const startYard = toOwnYardLine(drive.start_yards_to_goal)
        const endYard = toOwnYardLine(drive.end_yards_to_goal)

        const x1 = yardToX(startYard, PLAYABLE_WIDTH)
        const x2 = yardToX(endYard, PLAYABLE_WIDTH)
        const y = count === 1 ? (yMin + yMax) / 2 : yMin + i * ySpacing

        // Draw the rough line for this drive
        const line = rc!.line(x1, y, x2, y, {
          stroke: color,
          strokeWidth: 2.5,
          roughness: 1.0,
        })
        line.classList.add('rough-drive')
        overlayGroup!.appendChild(line)

        // Draw arrowhead at end position
        const direction = x2 >= x1 ? 1 : -1
        const arrowTipX = x2
        const arrowBaseX = x2 - direction * ARROW_HEAD_LENGTH

        const arrowPath = `M ${arrowTipX} ${y} L ${arrowBaseX} ${y - ARROW_HEAD_WIDTH} L ${arrowBaseX} ${y + ARROW_HEAD_WIDTH} Z`
        const arrowEl = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        arrowEl.setAttribute('d', arrowPath)
        arrowEl.setAttribute('fill', color)
        arrowEl.setAttribute('opacity', '0.9')
        arrowEl.classList.add('rough-drive')
        overlayGroup!.appendChild(arrowEl)
      })
    }

    drawDriveSet(homeDrives, HOME_Y_MIN, HOME_Y_MAX)
    drawDriveSet(awayDrives, AWAY_Y_MIN, AWAY_Y_MAX)
  }, [rc, homeDrives, awayDrives])

  useEffect(() => {
    drawDrives()
  }, [drawDrives])

  // Redraw on theme change
  useEffect(() => {
    const observer = new MutationObserver(() => {
      requestAnimationFrame(drawDrives)
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
    return () => observer.disconnect()
  }, [drawDrives])

  return (
    <div className="space-y-3">
      {/* Field with drive overlays */}
      <FootballField
        ref={fieldRef}
        width={FIELD_WIDTH_DEFAULT}
        height={FIELD_HEIGHT}
        id="drive-field-overlay"
      >
        {/* Team labels */}
        <text
          x={-4}
          y={(HOME_Y_MIN + HOME_Y_MAX) / 2}
          fill="var(--field-line)"
          fontSize={12}
          fontWeight={600}
          textAnchor="end"
          dominantBaseline="middle"
          opacity={0.8}
        >
          {game.home_team}
        </text>
        <text
          x={-4}
          y={(AWAY_Y_MIN + AWAY_Y_MAX) / 2}
          fill="var(--field-line)"
          fontSize={12}
          fontWeight={600}
          textAnchor="end"
          dominantBaseline="middle"
          opacity={0.8}
        >
          {game.away_team}
        </text>

        {/* Divider between home and away */}
        <line
          x1={0}
          y1={DIVIDER_Y}
          x2={PLAYABLE_WIDTH}
          y2={DIVIDER_Y}
          stroke="var(--field-line)"
          strokeWidth={1}
          strokeDasharray="6 4"
          opacity={0.4}
        />

        {/* Group for rough-drawn drives */}
        <g className="drive-overlay-group" />
      </FootballField>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {LEGEND_ITEMS.map(item => {
          const colorVar = OUTCOME_COLOR_MAP[item.key] ?? 'var(--text-muted)'
          return (
            <div key={item.key} className="flex items-center gap-1.5">
              <span
                className="w-3 h-1 rounded-sm inline-block"
                style={{ backgroundColor: colorVar }}
              />
              <span className="text-[11px] text-[var(--text-muted)]">
                {item.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
