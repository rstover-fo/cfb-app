'use client'

import { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import rough from 'roughjs'
import { ChartLineUp } from '@phosphor-icons/react'
import type { PlayerGameLogEntry } from '@/lib/types/database'
import { CHART_INK, resolveColor, useChartTheme } from '@/lib/charts/theme'
import { inkFor } from '@/lib/charts/series'
import { ChartFrame } from '@/lib/charts/ChartFrame'
import { ChartTooltip } from '@/lib/charts/ChartTooltip'
import type { ChartTooltipRow } from '@/lib/charts/ChartTooltip'
import { gridLinesY, axisLabelsY, axisLabelsX } from '@/lib/charts/axes'
import type { ChartLayout } from '@/lib/charts/axes'

interface GameTrendChartProps {
  gameLog: PlayerGameLogEntry[]
  statKey?: 'epa_per_play' | 'total_yards' | 'success_rate'
}

const WIDTH = 700
const HEIGHT = 350
const PADDING = { top: 30, right: 30, bottom: 50, left: 60 }
const CHART_WIDTH = WIDTH - PADDING.left - PADDING.right
const CHART_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom
const LAYOUT: ChartLayout = { width: WIDTH, height: HEIGHT, padding: PADDING }

/** Stable wobble (spec §9): identical strokes across re-renders and theme flips. */
const ROUGH_SEED = 37

const STAT_LABELS: Record<string, string> = {
  epa_per_play: 'EPA / Play',
  total_yards: 'Total Yards',
  success_rate: 'Success Rate',
}

/** Axis-tick precision (fewer decimals than the tooltip's exact value). */
function formatTick(statKey: GameTrendChartProps['statKey'], v: number): string {
  if (statKey === 'success_rate') return `${(v * 100).toFixed(0)}%`
  if (statKey === 'epa_per_play') return v.toFixed(2)
  return v.toFixed(0)
}

/** Tooltip-row precision. */
function formatValue(statKey: GameTrendChartProps['statKey'], v: number): string {
  if (statKey === 'success_rate') return `${(v * 100).toFixed(0)}%`
  if (statKey === 'epa_per_play') return v.toFixed(3)
  return v.toFixed(0)
}

/**
 * Deduplicate game log by game_id, keeping the entry with the most plays
 * per game (primary play category).
 */
function deduplicateByGame(entries: PlayerGameLogEntry[]): PlayerGameLogEntry[] {
  const byGame = new Map<number, PlayerGameLogEntry>()
  for (const entry of entries) {
    const existing = byGame.get(entry.game_id)
    if (!existing || entry.plays > existing.plays) {
      byGame.set(entry.game_id, entry)
    }
  }
  // Sort by week for chronological order
  return Array.from(byGame.values()).sort((a, b) => (a.week ?? 0) - (b.week ?? 0))
}

export function GameTrendChart({ gameLog, statKey = 'epa_per_play' }: GameTrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // Deduplicate and sort entries -- memoize to prevent redraw loops
  const entries = useMemo(() => deduplicateByGame(gameLog), [gameLog])

  // Chart geometry: scales, points, ticks, reference value
  const chartGeometry = useMemo(() => {
    if (entries.length === 0) return null

    const values = entries.map(e => e[statKey] ?? 0)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const avg = values.reduce((s, v) => s + v, 0) / values.length

    const range = max - min || 1
    const yPad = range * 0.15
    const minVal = statKey === 'epa_per_play' ? Math.min(min - yPad, -0.1) : Math.max(0, min - yPad)
    const maxVal = max + yPad
    const valSpan = maxVal - minVal || 1

    const getX = (index: number) =>
      entries.length > 1 ? PADDING.left + index * (CHART_WIDTH / (entries.length - 1)) : PADDING.left + CHART_WIDTH / 2
    const getY = (val: number) => PADDING.top + CHART_HEIGHT * (1 - (val - minVal) / valSpan)

    const points = entries.map((e, i) => ({ x: getX(i), y: getY(e[statKey] ?? 0) }))

    const refValue = statKey === 'epa_per_play' ? 0 : avg
    const refY = getY(refValue)
    const refInFrame = refY >= PADDING.top && refY <= PADDING.top + CHART_HEIGHT

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
      pct,
      val: maxVal - pct * valSpan,
    }))

    const xTicks = entries.map((e, i) => ({
      x: getX(i),
      label: e.week != null ? `Wk ${e.week}` : `G${i + 1}`,
    }))

    return { getX, points, yTicks, xTicks, refY, refInFrame, refLabel: statKey === 'epa_per_play' ? '0' : 'avg' }
  }, [entries, statKey])

  // Draw roughjs chart elements
  const drawChart = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group || !chartGeometry) return

    while (group.firstChild) group.removeChild(group.firstChild)

    const rc = rough.svg(svg)
    const lineColor = inkFor('run')
    const surfaceColor = resolveColor(CHART_INK.surface)

    const { points } = chartGeometry

    if (points.length >= 2) {
      group.appendChild(
        rc.linearPath(points.map(p => [p.x, p.y] as [number, number]), {
          stroke: lineColor,
          strokeWidth: 3,
          roughness: 1.0,
          bowing: 0.4,
          seed: ROUGH_SEED,
        }),
      )
    }

    for (const p of points) {
      group.appendChild(
        rc.circle(p.x, p.y, 10, {
          fill: surfaceColor,
          fillStyle: 'solid',
          stroke: lineColor,
          strokeWidth: 2,
          roughness: 0.5,
          seed: ROUGH_SEED,
        }),
      )
    }
  }, [chartGeometry])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Redraw on theme change
  useChartTheme(drawChart)

  const hoveredEntry = hoveredIndex !== null ? entries[hoveredIndex] : null

  const tooltipRows: ChartTooltipRow[] = []
  if (hoveredEntry) {
    tooltipRows.push({
      swatch: 'solid',
      color: 'var(--color-run)',
      label: `${STAT_LABELS[statKey]}:`,
      value: formatValue(statKey, hoveredEntry[statKey] ?? 0),
    })
    if (hoveredEntry.result) {
      tooltipRows.push({ muted: true, label: hoveredEntry.result })
    }
    tooltipRows.push({
      muted: true,
      label: `${hoveredEntry.total_yards ?? 0} yds · ${hoveredEntry.plays} plays · ${(
        (hoveredEntry.success_rate ?? 0) * 100
      ).toFixed(0)}% success`,
    })
  }

  return (
    <ChartFrame
      ariaLabel={`Game-by-game ${STAT_LABELS[statKey]} trend over the season`}
      empty={!chartGeometry}
      emptyState={{
        icon: ChartLineUp,
        title: 'No game log for this player yet',
        description: 'Game-by-game trends publish once the player has logged plays this season.',
      }}
    >
      {a11y => {
        const { getX, points, yTicks, xTicks, refY, refInFrame, refLabel } = chartGeometry!

        return (
          <>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="w-full h-auto"
              {...a11y}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Static scaffold: grid + axis labels */}
              {gridLinesY(yTicks, LAYOUT)}
              {axisLabelsY(yTicks, v => formatTick(statKey, v), LAYOUT)}
              {axisLabelsX(xTicks, LAYOUT)}

              {/* Y-axis stat caption -- the parent heading is a generic
                  "Season Trend", so the plotted stat's name must be visible
                  without hovering (the tooltip/aria-label alone don't serve
                  sighted users at a glance). */}
              <text
                x={14}
                y={PADDING.top + CHART_HEIGHT / 2}
                textAnchor="middle"
                transform={`rotate(-90, 14, ${PADDING.top + CHART_HEIGHT / 2})`}
                className="fill-[var(--text-muted)] text-xs"
              >
                {STAT_LABELS[statKey]}
              </text>

              {/* Reference line (0 for EPA, season average otherwise) -- static, never rough */}
              {refInFrame && (
                <>
                  <line
                    data-testid="reference-line"
                    x1={PADDING.left}
                    y1={refY}
                    x2={WIDTH - PADDING.right}
                    y2={refY}
                    stroke="var(--text-muted)"
                    strokeWidth={1}
                    strokeDasharray="6 4"
                    opacity={0.6}
                  />
                  <text
                    x={WIDTH - PADDING.right + 4}
                    y={refY}
                    dominantBaseline="middle"
                    className="fill-[var(--text-muted)] text-xs tabular-nums"
                  >
                    {refLabel}
                  </text>
                </>
              )}

              {/* Rough-drawn chart elements */}
              <g ref={roughGroupRef} data-testid="rough-layer" />

              {/* Interactive hover areas */}
              {entries.map((entry, i) => (
                <rect
                  key={entry.game_id}
                  x={getX(i) - CHART_WIDTH / entries.length / 2}
                  y={PADDING.top}
                  width={CHART_WIDTH / entries.length}
                  height={CHART_HEIGHT}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIndex(i)}
                />
              ))}

              {/* Hover crosshair */}
              {hoveredIndex !== null && (
                <line
                  x1={points[hoveredIndex].x}
                  y1={PADDING.top}
                  x2={points[hoveredIndex].x}
                  y2={PADDING.top + CHART_HEIGHT}
                  stroke="var(--text-muted)"
                  strokeWidth={1}
                  strokeDasharray="4 2"
                  opacity={0.6}
                />
              )}
            </svg>

            <ChartTooltip
              header={
                hoveredEntry
                  ? `${hoveredEntry.week != null ? `Week ${hoveredEntry.week}` : 'Game'}${
                      hoveredEntry.opponent ? ` vs ${hoveredEntry.opponent}` : ''
                    }`
                  : undefined
              }
              rows={tooltipRows}
              prompt="Hover a game for details"
              minRows={3}
            />
          </>
        )
      }}
    </ChartFrame>
  )
}
