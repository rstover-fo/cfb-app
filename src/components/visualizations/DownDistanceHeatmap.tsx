'use client'

import { useState } from 'react'
import { DownDistanceSplit } from '@/lib/types/database'
import { heatLevelForRate, type HeatThreshold } from '@/lib/charts/theme'
import { ChartFrame } from '@/lib/charts/ChartFrame'
import { ChartTooltip, type ChartTooltipRow } from '@/lib/charts/ChartTooltip'

interface DownDistanceHeatmapProps {
  data: DownDistanceSplit[]
  side: 'offense' | 'defense'
  title: string
}

const DOWNS = [1, 2, 3, 4] as const
const DISTANCE_BUCKETS = ['1-3', '4-6', '7-10', '11+'] as const
const DISTANCE_LABELS = ['1-3', '4-6', '7-10', '11+']

// docs/chart-style-spec.md §8 -- DownDistanceHeatmap is the behavioral
// reference: side-normalized thresholds (defense inverts the rate before
// bucketing).
const SUCCESS_RATE_THRESHOLDS: HeatThreshold[] = [
  { min: 0.55, level: 5 },
  { min: 0.45, level: 4 },
  { min: 0.35, level: 3 },
]

function getPerformanceLevel(successRate: number, side: 'offense' | 'defense') {
  // For defense, lower opponent success rate is better.
  const normalizedRate = side === 'defense' ? 1 - successRate : successRate
  return heatLevelForRate(normalizedRate, SUCCESS_RATE_THRESHOLDS)
}

function getPerformanceLabel(successRate: number, side: 'offense' | 'defense'): string {
  const normalizedRate = side === 'defense' ? 1 - successRate : successRate

  if (normalizedRate >= 0.55) return 'Elite'
  if (normalizedRate >= 0.45) return 'Above Avg'
  if (normalizedRate >= 0.35) return 'Average'
  return 'Below Avg'
}

function downLabel(down: number): string {
  return down === 1 ? '1st' : down === 2 ? '2nd' : down === 3 ? '3rd' : '4th'
}

export function DownDistanceHeatmap({ data, side, title }: DownDistanceHeatmapProps) {
  const [selected, setSelected] = useState<DownDistanceSplit | null>(null)

  const getCellData = (down: number, bucket: string): DownDistanceSplit | undefined => {
    return data.find(d => d.down === down && d.distance_bucket === bucket && d.side === side)
  }

  const selectCell = (cellData: DownDistanceSplit | undefined) => {
    if (cellData) setSelected(cellData)
  }

  const tooltipRows: ChartTooltipRow[] = selected
    ? [
        { label: 'Success rate', value: `${((selected.success_rate ?? 0) * 100).toFixed(1)}%` },
        { label: 'EPA/play', value: (selected.epa_per_play ?? 0).toFixed(3) },
        { label: 'Plays', value: `${selected.play_count}`, muted: true },
        { label: 'Rating', value: getPerformanceLabel(selected.success_rate, side), muted: true },
      ]
    : []

  return (
    // The one chart shell (spec §2) -- no hand-rolled frame. Plain-children
    // form: this is an interactive HTML grid, so a11y lives on the cell
    // buttons, not an SVG role.
    <ChartFrame title={title}>
      <div>
        {/* Column Headers */}
        <div className="grid grid-cols-5 gap-1 mb-1">
          <div /> {/* Empty corner cell */}
          {DISTANCE_LABELS.map(label => (
            <div
              key={label}
              className="text-center text-xs text-[var(--text-muted)] py-1"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Rows */}
        {DOWNS.map(down => (
          <div key={down} className="grid grid-cols-5 gap-1 mb-1">
            {/* Row Header */}
            <div className="flex items-center justify-end pr-2 text-xs text-[var(--text-muted)]">
              {downLabel(down)}
            </div>

            {/* Data Cells */}
            {DISTANCE_BUCKETS.map(bucket => {
              const cellData = getCellData(down, bucket)
              const hasData = cellData && cellData.success_rate != null
              const level = hasData ? getPerformanceLevel(cellData.success_rate, side) : null
              const isSelected = hasData && selected === cellData

              return (
                <button
                  key={`${down}-${bucket}`}
                  type="button"
                  className={`aspect-square min-h-[44px] rounded border transition-all hover:scale-105 focus:outline-none ${
                    isSelected
                      ? 'border-[2px] border-[var(--accent)]'
                      : 'border-[var(--border)]'
                  }`}
                  style={{ backgroundColor: level ? `var(--heat-${level})` : 'var(--bg-surface-alt)' }}
                  onMouseEnter={() => selectCell(cellData)}
                  onMouseLeave={() => setSelected(null)}
                  onFocus={() => selectCell(cellData)}
                  onBlur={() => setSelected(null)}
                  aria-label={
                    hasData
                      ? `${downLabel(down)} and ${bucket}: ${(cellData.success_rate * 100).toFixed(0)}% success rate, ${(cellData.epa_per_play ?? 0).toFixed(2)} EPA, ${cellData.play_count} plays`
                      : `${downLabel(down)} and ${bucket}: No data`
                  }
                >
                  {hasData && (
                    <span className="flex flex-col items-center">
                      <span className="text-xs font-medium tabular-nums text-[var(--text-primary)]">
                        {(cellData.success_rate * 100).toFixed(0)}%
                      </span>
                      <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
                        {cellData.play_count}
                      </span>
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-[var(--border)]">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'var(--heat-1)' }} />
            <span className="text-xs text-[var(--text-muted)]">Below Avg</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'var(--heat-3)' }} />
            <span className="text-xs text-[var(--text-muted)]">Average</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'var(--heat-5)' }} />
            <span className="text-xs text-[var(--text-muted)]">Elite</span>
          </div>
        </div>
      </div>

      {/* Dense-surface detail panel (docs/chart-style-spec.md §3): hover/focus
          selects one cell (accent outline above); details render here, never
          in a floating cursor-following panel. */}
      <ChartTooltip
        header={selected ? `${downLabel(selected.down)} & ${selected.distance_bucket}` : undefined}
        rows={tooltipRows}
        prompt="Hover or focus a cell for details"
        minRows={4}
      />
    </ChartFrame>
  )
}
