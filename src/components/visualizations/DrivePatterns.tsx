'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import rough from 'roughjs'
import { FootballField, yardToX } from './FootballField'
import { DrivePattern } from '@/lib/types/database'

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

// Convert bucketed yard number to readable field position label
function formatYardLabel(yard: number): string {
  if (yard >= 100) return 'End Zone'
  if (yard <= 0) return 'Own Goal'
  if (yard === 50) return 'Midfield'
  if (yard < 50) return `Own ${yard}s`
  return `Opp ${100 - yard}s`
}

function resolveColor(cssVar: string): string {
  if (typeof document === 'undefined') return '#999'
  const match = cssVar.match(/var\((.+)\)/)
  if (!match) return cssVar
  return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || '#999'
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

export function DrivePatterns({ offenseDrives, defenseDrives, teamName }: DrivePatternsProps) {
  const [side, setSide] = useState<Side>('offense')
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: DrivePattern } | null>(null)
  const [animationKey, setAnimationKey] = useState(0)

  const svgRef = useRef<SVGSVGElement>(null)
  const barsRef = useRef<SVGGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const fieldWidth = 1000 - (1000 / 120) * 20
  const fieldHeight = 400

  const allDrives = side === 'offense' ? offenseDrives : defenseDrives
  const grouped = groupByOutcome(allDrives)
  const maxCount = allDrives.reduce((m, d) => Math.max(m, d.count), 0)
  const outcomes = LANE_ORDER.filter(o => (grouped.get(o)?.length ?? 0) > 0)
  const lanes = computeLaneLayouts(grouped, fieldHeight, maxCount, selectedOutcome)

  const handleSideToggle = useCallback((newSide: Side) => {
    setSide(newSide)
    setSelectedOutcome(null)
    setAnimationKey(k => k + 1)
  }, [])

  const handleOutcomeSelect = useCallback((outcome: string) => {
    setSelectedOutcome(prev => prev === outcome ? null : outcome)
    setAnimationKey(k => k + 1)
  }, [])

  // Force-clear tooltip when mouse leaves the entire container
  const handleContainerMouseLeave = useCallback(() => {
    setTooltip(null)
  }, [])

  // Render roughjs bars
  useEffect(() => {
    const svg = svgRef.current
    const barsGroup = barsRef.current
    if (!svg || !barsGroup) return

    // Clean up previous
    while (barsGroup.firstChild) {
      barsGroup.removeChild(barsGroup.firstChild)
    }

    const rc = rough.svg(svg)

    // Track all bar elements for animation
    const barElements: { el: SVGGElement; index: number }[] = []
    // Build a flat list of drives for tooltip lookup
    const flatDrives: DrivePattern[] = []
    let globalIndex = 0

    for (const lane of lanes) {
      const cssColor = OUTCOME_COLORS[lane.outcome] || 'var(--color-neutral)'
      const color = resolveColor(cssColor)

      // Lane label on the left
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      label.setAttribute('x', '4')
      label.setAttribute('y', String(lane.y + 12))
      label.setAttribute('fill', color)
      label.setAttribute('font-size', '10')
      label.setAttribute('font-family', 'var(--font-body)')
      label.setAttribute('opacity', '0.7')
      label.textContent = OUTCOME_LABELS[lane.outcome] || lane.outcome
      barsGroup.appendChild(label)

      // Stack bars within the lane
      let barY = lane.y + 16 // offset below the label

      for (const drive of lane.drives) {
        const h = barHeight(drive.count, maxCount)
        const startX = yardToX(drive.start_yard, fieldWidth)
        const endX = yardToX(drive.end_yard, fieldWidth)
        const x = Math.min(startX, endX)
        const w = Math.max(Math.abs(endX - startX), 4)

        const roughRect = rc.rectangle(x, barY, w, h, {
          stroke: color,
          fill: color,
          fillStyle: 'solid',
          fillWeight: 0.5,
          roughness: 0.8,
          strokeWidth: 1,
        })

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        g.setAttribute('data-outcome', lane.outcome)
        g.setAttribute('data-index', String(globalIndex))
        g.style.opacity = '0'
        g.style.cursor = 'pointer'

        // Invisible hit area for easier hovering
        const hitRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        hitRect.setAttribute('x', String(x))
        hitRect.setAttribute('y', String(barY - 2))
        hitRect.setAttribute('width', String(w))
        hitRect.setAttribute('height', String(h + 4))
        hitRect.setAttribute('fill', 'transparent')
        g.appendChild(hitRect)

        g.appendChild(roughRect)

        // Count label on the bar if wide enough
        if (w > 30) {
          const countLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text')
          countLabel.setAttribute('x', String(x + w / 2))
          countLabel.setAttribute('y', String(barY + h / 2 + 3))
          countLabel.setAttribute('text-anchor', 'middle')
          countLabel.setAttribute('fill', '#fff')
          countLabel.setAttribute('font-size', String(Math.min(h - 1, 10)))
          countLabel.setAttribute('font-family', 'var(--font-body)')
          countLabel.setAttribute('pointer-events', 'none')
          countLabel.textContent = String(drive.count)
          g.appendChild(countLabel)
        }

        barElements.push({ el: g, index: globalIndex })
        flatDrives.push(drive)
        barsGroup.appendChild(g)

        barY += h + LANE_GAP
        globalIndex++
      }
    }

    // Staggered entrance animation
    let frameId: number
    let startTime: number | null = null
    const staggerMs = 40
    const animDuration = 250

    function animate(now: number) {
      if (startTime === null) startTime = now
      const elapsed = now - startTime
      for (const { el, index } of barElements) {
        const delay = index * staggerMs
        if (elapsed >= delay) {
          const progress = Math.min(1, (elapsed - delay) / animDuration)
          const t = 1 - Math.pow(1 - progress, 3)
          el.style.opacity = String(0.85 * t)
        }
      }

      const totalDuration = barElements.length * staggerMs + animDuration
      if (elapsed < totalDuration) {
        frameId = requestAnimationFrame(animate)
      }
    }

    frameId = requestAnimationFrame(animate)

    // Tooltip event delegation using mouseover/mouseout (bubbles properly)
    let activeTarget: Element | null = null

    function handleMouseOver(e: MouseEvent) {
      const target = (e.target as Element).closest('g[data-index]')
      if (!target || !containerRef.current) {
        // Mouse moved to a non-bar element within the SVG — clear tooltip
        if (activeTarget) {
          ;(activeTarget as HTMLElement).style.opacity = '0.85'
          activeTarget = null
          setTooltip(null)
        }
        return
      }
      if (target === activeTarget) return // same bar, no-op

      // Un-highlight previous
      if (activeTarget) {
        ;(activeTarget as HTMLElement).style.opacity = '0.85'
      }

      const idx = parseInt(target.getAttribute('data-index') || '-1', 10)
      if (idx < 0 || idx >= flatDrives.length) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const rect = target.getBoundingClientRect()

      let x = rect.x + rect.width / 2 - containerRect.x
      const y = rect.y - containerRect.y

      const tooltipWidth = 220
      x = Math.max(tooltipWidth / 2, Math.min(x, containerRect.width - tooltipWidth / 2))

      ;(target as HTMLElement).style.opacity = '1'
      activeTarget = target

      setTooltip({ x, y, data: flatDrives[idx] })
    }

    function handleMouseOut(e: MouseEvent) {
      const related = e.relatedTarget as Element | null
      // Only clear if we left the bars group entirely
      if (related && barsGroup?.contains(related)) return
      if (activeTarget) {
        ;(activeTarget as HTMLElement).style.opacity = '0.85'
        activeTarget = null
      }
      setTooltip(null)
    }

    barsGroup.addEventListener('mouseover', handleMouseOver as EventListener)
    barsGroup.addEventListener('mouseout', handleMouseOut as EventListener)

    return () => {
      cancelAnimationFrame(frameId)
      barsGroup.removeEventListener('mouseover', handleMouseOver as EventListener)
      barsGroup.removeEventListener('mouseout', handleMouseOut as EventListener)
    }
  }, [lanes, fieldWidth, fieldHeight, maxCount, animationKey])

  return (
    <div className="relative" ref={containerRef} onMouseLeave={handleContainerMouseLeave}>
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

      {/* Outcome Filter */}
      <div className="flex flex-wrap gap-2 mb-4" role="list" aria-label="Filter by drive outcome">
        <button
          onClick={() => {
            setSelectedOutcome(null)
            setAnimationKey(k => k + 1)
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
          const color = OUTCOME_COLORS[outcome] || '#999'
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
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: color }}
              />
              <span>{label}</span>
              <span className="text-[var(--text-muted)] text-xs">
                ({grouped.get(outcome)?.length ?? 0})
              </span>
            </button>
          )
        })}
      </div>

      {/* Field with Bars */}
      <FootballField ref={svgRef} width={1000} height={400} id="drive-patterns">
        <g ref={barsRef} />
      </FootballField>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute bg-[var(--bg-surface)] text-[var(--text-primary)] text-sm px-4 py-3 rounded border border-[var(--border)] shadow-lg pointer-events-none z-10"
          style={{
            left: tooltip.x,
            top: tooltip.y - 80,
            transform: 'translateX(-50%)',
          }}
        >
          <p className="font-headline text-base capitalize mb-1">
            {tooltip.data.outcome.replace('_', ' ')}
          </p>
          <p className="text-[var(--text-secondary)]">
            {tooltip.data.count} drive{tooltip.data.count !== 1 ? 's' : ''}
          </p>
          <p className="text-[var(--text-muted)] text-xs">
            {formatYardLabel(tooltip.data.start_yard)} → {formatYardLabel(tooltip.data.end_yard)}
          </p>
          <p className="text-[var(--text-muted)] text-xs">
            {tooltip.data.avg_plays} plays avg · {tooltip.data.avg_yards} yds avg
          </p>
        </div>
      )}

      {/* Data Table */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
          View {teamName} drive data as table
        </summary>
        <table className="mt-2 w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left p-2 text-[var(--text-muted)]">Outcome</th>
              <th className="text-left p-2 text-[var(--text-muted)]">From</th>
              <th className="text-left p-2 text-[var(--text-muted)]">To</th>
              <th className="text-left p-2 text-[var(--text-muted)]">Count</th>
              <th className="text-left p-2 text-[var(--text-muted)]">Avg Plays</th>
              <th className="text-left p-2 text-[var(--text-muted)]">Avg Yards</th>
            </tr>
          </thead>
          <tbody>
            {allDrives.map((drive, i) => (
              <tr key={`${drive.outcome}-${drive.start_yard}-${drive.end_yard}-${i}`} className="border-b border-[var(--border)]">
                <td className="p-2 capitalize text-[var(--text-primary)]">{drive.outcome.replace('_', ' ')}</td>
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
  )
}
