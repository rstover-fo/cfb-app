'use client'

import { useEffect, useCallback, useRef, useMemo } from 'react'
import rough from 'roughjs'
import { ChartLine } from '@phosphor-icons/react'
import { FootballField, yardToX } from '@/components/visualizations/FootballField'
import type { GameDrive } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'
import { CHART_INK, resolveColor, useChartTheme } from '@/lib/charts/theme'
import { inkFor } from '@/lib/charts/series'
import type { SeriesRole } from '@/lib/charts/series'
import { ChartFrame } from '@/lib/charts/ChartFrame'
import { ChartLegend } from '@/lib/charts/ChartLegend'
import type { ChartLegendItem } from '@/lib/charts/ChartLegend'

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

/** Stable wobble (spec §9): identical strokes across re-renders and theme flips. */
const ROUGH_SEED = 53

/** Outcomes with a direct SeriesRole ink match (spec §6/§10 inkFor). */
const OUTCOME_ROLE_MAP: Partial<Record<string, SeriesRole>> = {
  touchdown: 'positive',
  safety: 'negative',
  turnover: 'negative',
  punt: 'neutral',
  downs: 'run',
  end_of_half: 'pass',
}

// Raw var(--token) references — for the HTML legend swatches (CSS handles
// their theme flip) and for outcomes outside the SeriesRole vocabulary
// (field_goal/missed_fg use --color-field-goal, which has no SeriesRole).
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

/** Convert drive yards_to_goal to a 0-100 own-yard-line position */
function toOwnYardLine(yardsToGoal: number): number {
  return 100 - yardsToGoal
}

// ---------------------------------------------------------------------------
// Geometry (spec §1.3 — scales/points computed in useMemo, never in drawChart)
// ---------------------------------------------------------------------------

interface DriveArrowGeometry {
  driveNumber: number
  outcome: string
  x1: number
  x2: number
  y: number
}

function layoutDriveSet(driveList: GameDrive[], yMin: number, yMax: number): DriveArrowGeometry[] {
  const count = driveList.length
  if (count === 0) return []
  const ySpacing = count === 1 ? 0 : (yMax - yMin) / (count - 1)

  return driveList.map((drive, i) => {
    const startYard = toOwnYardLine(drive.start_yards_to_goal)
    const endYard = toOwnYardLine(drive.end_yards_to_goal)
    return {
      driveNumber: drive.drive_number,
      outcome: mapDriveResult(drive.drive_result),
      x1: yardToX(startYard, PLAYABLE_WIDTH),
      x2: yardToX(endYard, PLAYABLE_WIDTH),
      y: count === 1 ? (yMin + yMax) / 2 : yMin + i * ySpacing,
    }
  })
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
  const roughGroupRef = useRef<SVGGElement>(null)

  const homeDrives = useMemo(() => drives.filter(d => d.is_home_offense), [drives])
  const awayDrives = useMemo(() => drives.filter(d => !d.is_home_offense), [drives])

  const arrowGeometry = useMemo<DriveArrowGeometry[]>(
    () => [
      ...layoutDriveSet(homeDrives, HOME_Y_MIN, HOME_Y_MAX),
      ...layoutDriveSet(awayDrives, AWAY_Y_MIN, AWAY_Y_MAX),
    ],
    [homeDrives, awayDrives],
  )

  // Draw roughjs chart elements: one line + arrowhead per drive.
  const drawChart = useCallback(() => {
    const svg = fieldRef.current
    const group = roughGroupRef.current
    if (!svg || !group) return

    while (group.firstChild) group.removeChild(group.firstChild)
    if (arrowGeometry.length === 0) return

    const rc = rough.svg(svg)
    const fieldGoalColor = resolveColor('var(--color-field-goal)')
    const mutedColor = resolveColor(CHART_INK.muted)
    const inkMap: Record<string, string> = {
      field_goal: fieldGoalColor,
      missed_fg: fieldGoalColor,
    }
    for (const [outcome, role] of Object.entries(OUTCOME_ROLE_MAP)) {
      if (role) inkMap[outcome] = inkFor(role)
    }

    for (const drive of arrowGeometry) {
      const color = inkMap[drive.outcome] ?? mutedColor
      const { x1, x2, y } = drive

      const line = rc.line(x1, y, x2, y, {
        stroke: color,
        strokeWidth: 2.5,
        roughness: 1.0,
        bowing: 0.4,
        seed: ROUGH_SEED,
      })
      group.appendChild(line)

      // Arrowhead at the end position — rough-drawn (spec: no un-rough data
      // marks), not a native path with a baked-in fill.
      const direction = x2 >= x1 ? 1 : -1
      const arrowTipX = x2
      const arrowBaseX = x2 - direction * ARROW_HEAD_LENGTH
      const arrow = rc.polygon(
        [
          [arrowTipX, y],
          [arrowBaseX, y - ARROW_HEAD_WIDTH],
          [arrowBaseX, y + ARROW_HEAD_WIDTH],
        ],
        {
          fill: color,
          fillStyle: 'solid',
          stroke: color,
          strokeWidth: 1,
          roughness: 0.5,
          seed: ROUGH_SEED,
        },
      )
      group.appendChild(arrow)
    }
  }, [arrowGeometry])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Redraw on theme change
  useChartTheme(drawChart)

  const legendItems: ChartLegendItem[] = LEGEND_ITEMS.map(item => ({
    key: item.key,
    label: item.label,
    swatch: 'solid',
    color: OUTCOME_COLOR_MAP[item.key] ?? 'var(--text-muted)',
  }))

  const ariaLabel = `Field view of ${drives.length} drives for ${game.home_team} vs ${game.away_team}, plotted by starting and ending field position`

  return (
    <ChartFrame
      ariaLabel={ariaLabel}
      empty={drives.length === 0}
      emptyState={{
        icon: ChartLine,
        title: 'No drives to plot',
        description: "Field position charts publish once this game's drive-by-drive data loads.",
      }}
    >
      <div className="space-y-3">
        {/* Field with drive overlays. FootballField manages its own SVG
            role/aria-label (spec §2) — not modified here. */}
        <FootballField
          ref={fieldRef}
          width={FIELD_WIDTH_DEFAULT}
          height={FIELD_HEIGHT}
          id="drive-field-overlay"
          ariaLabel={ariaLabel}
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

          {/* Rough-drawn drive lines + arrowheads */}
          <g ref={roughGroupRef} data-testid="rough-layer" />
        </FootballField>

        <ChartLegend items={legendItems} />
      </div>
    </ChartFrame>
  )
}
