'use client'

import { useState } from 'react'
import { DownDistanceSplit } from '@/lib/types/database'

interface DownDistanceHeatmapProps {
  data: DownDistanceSplit[]
  side: 'offense' | 'defense'
  title: string
}

const DOWNS = [1, 2, 3, 4] as const
const DISTANCE_BUCKETS = ['1-3', '4-6', '7-10', '11+'] as const
const DISTANCE_LABELS = ['1-3', '4-6', '7-10', '11+']

function getPerformanceColor(successRate: number, side: 'offense' | 'defense'): string {
  // For defense, lower opponent success rate is better
  const normalizedRate = side === 'defense' ? 1 - successRate : successRate

  if (normalizedRate >= 0.55) return 'var(--color-positive)'
  if (normalizedRate >= 0.45) return 'var(--bg-surface-alt)'
  if (normalizedRate >= 0.35) return 'var(--color-neutral)'
  return 'var(--color-negative)'
}

function getPerformanceLabel(successRate: number, side: 'offense' | 'defense'): string {
  const normalizedRate = side === 'defense' ? 1 - successRate : successRate

  if (normalizedRate >= 0.55) return 'Elite'
  if (normalizedRate >= 0.45) return 'Above Avg'
  if (normalizedRate >= 0.35) return 'Average'
  return 'Below Avg'
}

export function DownDistanceHeatmap({ data, side, title }: DownDistanceHeatmapProps) {
  const [tooltip, setTooltip] = useState<{
    x: number
    y: number
    data: DownDistanceSplit
  } | null>(null)

  const getCellData = (down: number, bucket: string): DownDistanceSplit | undefined => {
    return data.find(d => d.down === down && d.distance_bucket === bucket && d.side === side)
  }

  return (
    <div className="relative">
      <h3 className="font-headline text-lg text-[var(--text-primary)] mb-3">{title}</h3>

      <div className="card p-4">
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
              {down === 1 ? '1st' : down === 2 ? '2nd' : down === 3 ? '3rd' : '4th'}
            </div>

            {/* Data Cells */}
            {DISTANCE_BUCKETS.map(bucket => {
              const cellData = getCellData(down, bucket)
              const hasData = cellData && cellData.success_rate != null
              const bgColor = hasData
                ? getPerformanceColor(cellData.success_rate, side)
                : 'var(--bg-surface-alt)'

              return (
                <button
                  key={`${down}-${bucket}`}
                  className="aspect-square min-h-[44px] rounded border border-[var(--border)] transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[var(--color-run)]"
                  style={{ backgroundColor: bgColor }}
                  onMouseEnter={(e) => {
                    if (hasData) {
                      const rect = e.currentTarget.getBoundingClientRect()
                      setTooltip({ x: rect.left + rect.width / 2, y: rect.top, data: cellData })
                    }
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  onFocus={(e) => {
                    if (hasData) {
                      const rect = e.currentTarget.getBoundingClientRect()
                      setTooltip({ x: rect.left + rect.width / 2, y: rect.top, data: cellData })
                    }
                  }}
                  onBlur={() => setTooltip(null)}
                  aria-label={
                    hasData
                      ? `${down}${down === 1 ? 'st' : down === 2 ? 'nd' : down === 3 ? 'rd' : 'th'} and ${bucket}: ${(cellData.success_rate * 100).toFixed(0)}% success rate, ${(cellData.epa_per_play ?? 0).toFixed(2)} EPA, ${cellData.play_count} plays`
                      : `${down}${down === 1 ? 'st' : down === 2 ? 'nd' : down === 3 ? 'rd' : 'th'} and ${bucket}: No data`
                  }
                >
                  {hasData && (
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      {(cellData.success_rate * 100).toFixed(0)}%
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
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'var(--color-negative)' }} />
            <span className="text-xs text-[var(--text-muted)]">Below Avg</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'var(--bg-surface-alt)' }} />
            <span className="text-xs text-[var(--text-muted)]">Average</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'var(--color-positive)' }} />
            <span className="text-xs text-[var(--text-muted)]">Elite</span>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed bg-[var(--bg-surface)] text-[var(--text-primary)] text-sm px-4 py-3 rounded border border-[var(--border)] shadow-lg pointer-events-none z-50"
          style={{
            left: tooltip.x,
            top: tooltip.y - 90,
            transform: 'translateX(-50%)'
          }}
        >
          <p className="font-headline text-base mb-1">
            {tooltip.data.down}{tooltip.data.down === 1 ? 'st' : tooltip.data.down === 2 ? 'nd' : tooltip.data.down === 3 ? 'rd' : 'th'} & {tooltip.data.distance_bucket}
          </p>
          <p className="text-[var(--text-secondary)]">
            {((tooltip.data.success_rate ?? 0) * 100).toFixed(1)}% success · {(tooltip.data.epa_per_play ?? 0).toFixed(3)} EPA
          </p>
          <p className="text-[var(--text-muted)] text-xs">
            {tooltip.data.play_count} plays · {getPerformanceLabel(tooltip.data.success_rate, side)}
          </p>
        </div>
      )}
    </div>
  )
}
