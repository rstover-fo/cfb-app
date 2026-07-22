'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import rough from 'roughjs'
import { ChartLine } from '@phosphor-icons/react'
import { FootballField, yardToX } from './FootballField'
import { DrivePattern } from '@/lib/types/database'
import { CHART_INK, resolveColor, useChartTheme } from '@/lib/charts/theme'
import { ChartFrame } from '@/lib/charts/ChartFrame'
import { ChartTooltip, swatchBackground } from '@/lib/charts/ChartTooltip'
import type { ChartTooltipRow } from '@/lib/charts/ChartTooltip'

type Side = 'offense' | 'defense'

interface DrivePatternsProps {
  offenseDrives: DrivePattern[]
  defenseDrives: DrivePattern[]
  teamName: string
}

const OUTCOME_COLORS: Record<string, string> = {
  touchdown: 'var(--color-positive)',
  field_goal: 'var(--color-field-goal)',
  punt: 'var(--color-neutral)',
  turnover: 'var(--color-negative)',
  downs: 'var(--color-run)',
  end_of_half: 'var(--color-pass)',
}

const OUTCOME_LABELS: Record<string, string> = {
  touchdown: 'Touchdown',
  field_goal: 'Field Goal',
  punt: 'Punt',
  turnover: 'Turnover',
  downs: 'Turnover on Downs',
  end_of_half: 'End of Half',
}

// Top-to-bottom lane order
const LANE_ORDER = ['touchdown', 'field_goal', 'punt', 'turnover', 'downs', 'end_of_half']

const MIN_BAR_HEIGHT = 4
const MAX_BAR_HEIGHT = 20
const LANE_PADDING = 4
const LANE_GAP = 2

const FIELD_WIDTH = 1000
const FIELD_HEIGHT = 400
const PLAYABLE_WIDTH = FIELD_WIDTH - (FIELD_WIDTH / 120) * 20

/** Stable wobble (spec §9): identical strokes across re-renders and theme flips. */
const ROUGH_SEED = 68

// Convert bucketed yard number to readable field position label
function formatYardLabel(yard: number): string {
  if (yard >= 100) return 'End Zone'
  if (yard <= 0) return 'Own Goal'
  if (yard === 50) return 'Midfield'
  if (yard < 50) return `Own ${yard}s`
  return `Opp ${100 - yard}s`
}

// Compute bar height based on count relative to max count in the dataset
function barHeight(count: number, maxCount: number): number {
  if (maxCount <= 0) return MIN_BAR_HEIGHT
  const ratio = count / maxCount
  return MIN_BAR_HEIGHT + ratio * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT)
}

// Group drives by outcome, sorted within each group by start_yard then count desc
function groupByOutcome(drives: DrivePattern[]): Map<string, DrivePattern[]> {
  const groups = new Map<string, DrivePattern[]>()
  for (const outcome of LANE_ORDER) {
    groups.set(outcome, [])
  }
  for (const d of drives) {
    const list = groups.get(d.outcome)
    if (list) list.push(d)
  }
  // Sort each group: by start yard asc, then by count desc
  for (const [, list] of groups) {
    list.sort((a, b) => a.start_yard - b.start_yard || b.count - a.count)
  }
  return groups
}

// Calculate the total height needed for a lane's bars
function laneContentHeight(drives: DrivePattern[], maxCount: number): number {
  if (drives.length === 0) return 0
  let total = 0
  for (const d of drives) {
    total += barHeight(d.count, maxCount) + LANE_GAP
  }
  return total - LANE_GAP // no gap after last bar
}

interface LaneLayout {
  outcome: string
  y: number       // top y of this lane's content area
  height: number  // total height available for this lane
  drives: DrivePattern[]
}

function computeLaneLayouts(
  grouped: Map<string, DrivePattern[]>,
  fieldHeight: number,
  maxCount: number,
  selectedOutcome: string | null
): LaneLayout[] {
  const activeOutcomes = selectedOutcome
    ? LANE_ORDER.filter(o => o === selectedOutcome)
    : LANE_ORDER.filter(o => (grouped.get(o)?.length ?? 0) > 0)

  if (activeOutcomes.length === 0) return []

  // Calculate natural content height for each lane
  const contentHeights = activeOutcomes.map(o => {
    const drives = grouped.get(o) || []
    return { outcome: o, drives, contentHeight: laneContentHeight(drives, maxCount) }
  })

  const totalContent = contentHeights.reduce((s, c) => s + c.contentHeight, 0)
  const totalPadding = activeOutcomes.length * LANE_PADDING * 2
  const availableHeight = fieldHeight - totalPadding

  // Distribute proportionally, with a minimum lane height
  const minLaneHeight = 20
  const layouts: LaneLayout[] = []
  let currentY = 0

  for (const { outcome, drives, contentHeight } of contentHeights) {
    const proportion = totalContent > 0 ? contentHeight / totalContent : 1 / activeOutcomes.length
    const laneHeight = Math.max(minLaneHeight, proportion * availableHeight)

    layouts.push({
      outcome,
      y: currentY + LANE_PADDING,
      height: laneHeight,
      drives,
    })
    currentY += laneHeight + LANE_PADDING * 2
  }

  return layouts
}

interface BarGeometry {
  outcome: string
  index: number
  x: number
  y: number
  width: number
  height: number
  drive: DrivePattern
}

// Flatten lane layouts into individual bar rectangles (spec §1.3: geometry
// computed in useMemo, never inside drawChart).
function layoutBars(lanes: LaneLayout[], maxCount: number): BarGeometry[] {
  const bars: BarGeometry[] = []
  let index = 0
  for (const lane of lanes) {
    let barY = lane.y + 16 // offset below the lane label
    for (const drive of lane.drives) {
      const h = barHeight(drive.count, maxCount)
      const startX = yardToX(drive.start_yard, PLAYABLE_WIDTH)
      const endX = yardToX(drive.end_yard, PLAYABLE_WIDTH)
      const x = Math.min(startX, endX)
      const width = Math.max(Math.abs(endX - startX), 4)
      bars.push({ outcome: lane.outcome, index, x, y: barY, width, height: h, drive })
      barY += h + LANE_GAP
      index++
    }
  }
  return bars
}

export function DrivePatterns({ offenseDrives, defenseDrives, teamName }: DrivePatternsProps) {
  const [side, setSide] = useState<Side>('offense')
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const svgRef = useRef<SVGSVGElement>(null)
  const barsRef = useRef<SVGGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const allDrives = side === 'offense' ? offenseDrives : defenseDrives

  const grouped = useMemo(() => groupByOutcome(allDrives), [allDrives])
  const maxCount = useMemo(() => allDrives.reduce((m, d) => Math.max(m, d.count), 0), [allDrives])
  const outcomes = useMemo(() => LANE_ORDER.filter(o => (grouped.get(o)?.length ?? 0) > 0), [grouped])
  const lanes = useMemo(
    () => computeLaneLayouts(grouped, FIELD_HEIGHT, maxCount, selectedOutcome),
    [grouped, maxCount, selectedOutcome],
  )
  const barGeometry = useMemo(() => layoutBars(lanes, maxCount), [lanes, maxCount])

  const handleSideToggle = useCallback((newSide: Side) => {
    setSide(newSide)
    setSelectedOutcome(null)
    setHoveredIndex(null)
  }, [])

  const handleOutcomeSelect = useCallback((outcome: string) => {
    setSelectedOutcome(prev => (prev === outcome ? null : outcome))
    setHoveredIndex(null)
  }, [])

  // Draw the rough-drawn bars, then run the staggered entrance fade.
  const drawChart = useCallback(() => {
    const svg = svgRef.current
    const group = barsRef.current
    if (!svg || !group) return

    while (group.firstChild) group.removeChild(group.firstChild)
    if (barGeometry.length === 0) return

    const rc = rough.svg(svg)
    const mutedColor = resolveColor(CHART_INK.muted)
    const inkMap: Record<string, string> = {}
    for (const outcome of LANE_ORDER) {
      inkMap[outcome] = resolveColor(OUTCOME_COLORS[outcome] ?? CHART_INK.muted)
    }

    const rects: SVGElement[] = []
    for (const bar of barGeometry) {
      const color = inkMap[bar.outcome] ?? mutedColor
      // Solid fill, not the hachure bar default (spec §9): each bar's meaning
      // comes from its lane + outcome color, not a paired/mirrored side, so a
      // hachure fill would add texture without adding legibility here.
      const rect = rc.rectangle(bar.x, bar.y, bar.width, bar.height, {
        fill: color,
        stroke: color,
        fillStyle: 'solid',
        strokeWidth: 1.5,
        roughness: 1.1,
        bowing: 0.5,
        seed: ROUGH_SEED,
      })
      rect.style.opacity = '0'
      group.appendChild(rect)
      rects.push(rect)
    }

    // Staggered entrance animation.
    let frameId: number
    let startTime: number | null = null
    const staggerMs = 40
    const animDuration = 250

    function animate(now: number) {
      if (startTime === null) startTime = now
      const elapsed = now - startTime
      rects.forEach((el, i) => {
        const delay = i * staggerMs
        if (elapsed >= delay) {
          const progress = Math.min(1, (elapsed - delay) / animDuration)
          const t = 1 - Math.pow(1 - progress, 3)
          el.style.opacity = String(0.85 * t)
        }
      })
      const totalDuration = rects.length * staggerMs + animDuration
      if (elapsed < totalDuration) {
        frameId = requestAnimationFrame(animate)
      }
    }
    frameId = requestAnimationFrame(animate)

    // Deviation from the plain `useEffect(() => { drawChart() })` recipe
    // form: the entrance animation schedules its own rAF loop, so drawChart
    // returns a cleanup to cancel it on redraw/unmount.
    return () => cancelAnimationFrame(frameId)
  }, [barGeometry])

  useEffect(() => {
    return drawChart()
  }, [drawChart])

  // Redraw on theme change
  useChartTheme(drawChart)

  const hoveredBar = hoveredIndex !== null ? barGeometry.find(b => b.index === hoveredIndex) ?? null : null

  const tooltipRows: ChartTooltipRow[] = hoveredBar
    ? [
        {
          swatch: 'solid',
          color: OUTCOME_COLORS[hoveredBar.outcome],
          label: 'Drives:',
          value: String(hoveredBar.drive.count),
        },
        {
          label: 'Field position:',
          value: `${formatYardLabel(hoveredBar.drive.start_yard)} → ${formatYardLabel(hoveredBar.drive.end_yard)}`,
          muted: true,
        },
        {
          label: 'Averages:',
          value: `${hoveredBar.drive.avg_plays} plays · ${hoveredBar.drive.avg_yards} yds`,
          muted: true,
        },
      ]
    : []

  return (
    <ChartFrame
      decorative
      empty={offenseDrives.length === 0 && defenseDrives.length === 0}
      emptyState={{
        icon: ChartLine,
        title: 'No drive data for this team',
        description: "Drive-by-drive patterns publish once this season's play-by-play data loads.",
      }}
    >
      <div ref={containerRef} onMouseLeave={() => setHoveredIndex(null)}>
        {/* Side Toggle */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => handleSideToggle('offense')}
            className={`px-4 py-2 border-[1.5px] rounded-sm text-sm transition-all ${
              side === 'offense'
                ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
            }`}
            aria-pressed={side === 'offense'}
          >
            Our Drives
          </button>
          <button
            onClick={() => handleSideToggle('defense')}
            className={`px-4 py-2 border-[1.5px] rounded-sm text-sm transition-all ${
              side === 'defense'
                ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
            }`}
            aria-pressed={side === 'defense'}
          >
            Opponent Drives
          </button>
        </div>

        {/* Outcome Filter -- controls, not a legend (kept as buttons); swatches
            reuse the house `swatchBackground` helper for the solid-swatch vocabulary. */}
        <div className="flex flex-wrap gap-2 mb-4" role="list" aria-label="Filter by drive outcome">
          <button
            onClick={() => {
              setSelectedOutcome(null)
              setHoveredIndex(null)
            }}
            className={`px-3 py-1.5 border-[1.5px] rounded-sm text-sm transition-all ${
              selectedOutcome === null
                ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
            }`}
            aria-pressed={selectedOutcome === null}
          >
            All
          </button>
          {outcomes.map(outcome => {
            const color = OUTCOME_COLORS[outcome] ?? CHART_INK.muted
            const label = OUTCOME_LABELS[outcome] || outcome
            const isActive = selectedOutcome === outcome

            return (
              <button
                key={outcome}
                onClick={() => handleOutcomeSelect(outcome)}
                className={`flex items-center gap-2 px-3 py-1.5 border-[1.5px] rounded-sm text-sm transition-all ${
                  isActive
                    ? 'bg-[var(--bg-surface-alt)] border-[var(--color-run)] text-[var(--text-primary)]'
                    : selectedOutcome === null
                      ? 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
                      : 'border-[var(--border)] text-[var(--text-secondary)] opacity-40 hover:opacity-70'
                }`}
                aria-pressed={isActive}
              >
                <span aria-hidden="true" className="inline-block w-3 h-3 rounded-sm" style={swatchBackground('solid', color)} />
                <span>{label}</span>
                <span className="text-[var(--text-muted)] text-xs">
                  ({grouped.get(outcome)?.length ?? 0})
                </span>
              </button>
            )
          })}
        </div>

        {/* Field with Bars -- decorative: the "View drive data as table" details below is
            the accessible equivalent of everything plotted here. */}
        <FootballField ref={svgRef} width={FIELD_WIDTH} height={FIELD_HEIGHT} id="drive-patterns" decorative>
          {/* Lane labels -- static scaffold, var() refs flip natively with theme */}
          {lanes.map(lane => (
            <text
              key={lane.outcome}
              x={4}
              y={lane.y + 12}
              fill={OUTCOME_COLORS[lane.outcome] ?? CHART_INK.muted}
              fontSize={10}
              opacity={0.7}
            >
              {OUTCOME_LABELS[lane.outcome] || lane.outcome}
            </text>
          ))}

          {/* Hover highlight -- bar/row highlight behind the rough layer (spec §3) */}
          {hoveredBar && (
            <rect
              x={hoveredBar.x - 2}
              y={hoveredBar.y - 2}
              width={hoveredBar.width + 4}
              height={hoveredBar.height + 4}
              fill="var(--bg-surface-alt)"
              rx={2}
            />
          )}

          {/* Rough-drawn bars */}
          <g ref={barsRef} data-testid="rough-layer" />

          {/* Count labels on wide-enough bars */}
          {barGeometry
            .filter(b => b.width > 30)
            .map(b => (
              <text
                key={`count-${b.index}`}
                x={b.x + b.width / 2}
                y={b.y + b.height / 2 + 3}
                textAnchor="middle"
                fill="var(--bg-surface)"
                fontSize={Math.min(b.height - 1, 10)}
                pointerEvents="none"
              >
                {b.drive.count}
              </text>
            ))}

          {/* Interaction layer (spec §1.5): base rect clears the highlight,
              per-bar rects on top drive the hover state. */}
          <rect
            x={0}
            y={0}
            width={PLAYABLE_WIDTH}
            height={FIELD_HEIGHT}
            fill="transparent"
            onMouseEnter={() => setHoveredIndex(null)}
          />
          {barGeometry.map(b => (
            <rect
              key={`hit-${b.index}`}
              x={b.x}
              y={b.y - 2}
              width={b.width}
              height={b.height + 4}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoveredIndex(b.index)}
            />
          ))}
        </FootballField>

        <ChartTooltip
          header={hoveredBar ? OUTCOME_LABELS[hoveredBar.outcome] || hoveredBar.outcome : undefined}
          rows={tooltipRows}
          prompt="Hover a drive bar for details"
          minRows={3}
        />

        {/* Data Table */}
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            View {teamName} drive data as table
          </summary>
          <table className="mt-2 w-full text-sm border-collapse" aria-label={`${teamName} ${side} drive data`}>
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th scope="col" className="text-left p-2 text-[var(--text-muted)]">Outcome</th>
                <th scope="col" className="text-left p-2 text-[var(--text-muted)]">From</th>
                <th scope="col" className="text-left p-2 text-[var(--text-muted)]">To</th>
                <th scope="col" className="text-left p-2 text-[var(--text-muted)]">Count</th>
                <th scope="col" className="text-left p-2 text-[var(--text-muted)]">Avg Plays</th>
                <th scope="col" className="text-left p-2 text-[var(--text-muted)]">Avg Yards</th>
              </tr>
            </thead>
            <tbody>
              {allDrives.map((drive, i) => (
                <tr key={`${drive.outcome}-${drive.start_yard}-${drive.end_yard}-${i}`} className="border-b border-[var(--border)]">
                  <th scope="row" className="p-2 text-left font-normal capitalize text-[var(--text-primary)]">{drive.outcome.replace('_', ' ')}</th>
                  <td className="p-2 text-[var(--text-secondary)]">{formatYardLabel(drive.start_yard)}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{formatYardLabel(drive.end_yard)}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{drive.count}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{drive.avg_plays}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{drive.avg_yards}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </ChartFrame>
  )
}
