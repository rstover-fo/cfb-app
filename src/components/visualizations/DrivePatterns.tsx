'use client'

import { useState } from 'react'
import { FootballField, yardToX } from './FootballField'
import { DrivePattern } from '@/lib/types/database'

interface DrivePatternsProps {
  drives: DrivePattern[]
  teamName: string
}

const OUTCOME_STYLES = {
  touchdown: { color: '#22c55e', dash: 'none', label: 'Touchdown' },
  field_goal: { color: '#3b82f6', dash: '8,4', label: 'Field Goal' },
  punt: { color: '#6b7280', dash: '4,4', label: 'Punt' },
  turnover: { color: '#ef4444', dash: 'none', label: 'Turnover' },
  downs: { color: '#f59e0b', dash: '2,2', label: 'Turnover on Downs' },
  end_of_half: { color: '#8b5cf6', dash: '6,2', label: 'End of Half' },
} as const

export function DrivePatterns({ drives, teamName }: DrivePatternsProps) {
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: DrivePattern } | null>(null)

  const fieldWidth = 1000 - (1000 / 120) * 20  // Subtract end zones
  const fieldHeight = 400

  // Generate arc path
  function getArcPath(drive: DrivePattern): string {
    const startX = yardToX(drive.start_yard, fieldWidth)
    const endX = yardToX(drive.end_yard, fieldWidth)
    const midX = (startX + endX) / 2

    // Arc height based on drive length, scaled by count
    const driveLength = Math.abs(drive.end_yard - drive.start_yard)
    const baseHeight = Math.min(driveLength * 2, fieldHeight * 0.4)
    const arcHeight = baseHeight * (1 + Math.log10(drive.count) * 0.2)

    const midY = fieldHeight / 2
    const controlY = midY - arcHeight

    return `M ${startX} ${midY} Q ${midX} ${controlY} ${endX} ${midY}`
  }

  const outcomes = [...new Set(drives.map(d => d.outcome))]

  return (
    <div className="relative">
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4" role="list" aria-label="Drive outcome legend">
        {outcomes.map(outcome => {
          const style = OUTCOME_STYLES[outcome as keyof typeof OUTCOME_STYLES] || { color: '#999', dash: 'none', label: outcome }
          const isSelected = selectedOutcome === null || selectedOutcome === outcome

          return (
            <button
              key={outcome}
              onClick={() => setSelectedOutcome(selectedOutcome === outcome ? null : outcome)}
              className={`flex items-center gap-2 px-3 py-1 rounded border transition-opacity ${
                isSelected ? 'opacity-100' : 'opacity-40'
              }`}
              aria-pressed={selectedOutcome === outcome}
            >
              <svg width={24} height={12}>
                <line
                  x1={0} y1={6} x2={24} y2={6}
                  stroke={style.color}
                  strokeWidth={3}
                  strokeDasharray={style.dash}
                />
              </svg>
              <span className="text-sm">{style.label}</span>
            </button>
          )
        })}
      </div>

      {/* Field with Arcs */}
      <FootballField width={1000} height={400}>
        {drives.map((drive, i) => {
          const style = OUTCOME_STYLES[drive.outcome as keyof typeof OUTCOME_STYLES] || { color: '#999', dash: 'none' }
          const isVisible = selectedOutcome === null || selectedOutcome === drive.outcome

          return (
            <path
              key={i}
              d={getArcPath(drive)}
              fill="none"
              stroke={style.color}
              strokeWidth={Math.max(2, Math.min(drive.count / 2, 8))}
              strokeDasharray={style.dash}
              opacity={isVisible ? 0.7 : 0.1}
              className="transition-opacity cursor-pointer hover:opacity-100"
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                setTooltip({ x: rect.x + rect.width / 2, y: rect.y, data: drive })
              }}
              onMouseLeave={() => setTooltip(null)}
              onFocus={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                setTooltip({ x: rect.x + rect.width / 2, y: rect.y, data: drive })
              }}
              onBlur={() => setTooltip(null)}
              tabIndex={0}
              role="button"
              aria-label={`${drive.count} drives from ${drive.start_yard} to ${drive.end_yard} yard line, ${drive.outcome}`}
            />
          )
        })}
      </FootballField>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute bg-black text-white text-sm px-3 py-2 rounded shadow-lg pointer-events-none z-10"
          style={{
            left: tooltip.x,
            top: tooltip.y - 60,
            transform: 'translateX(-50%)'
          }}
        >
          <p className="font-semibold capitalize">{tooltip.data.outcome.replace('_', ' ')}</p>
          <p>{tooltip.data.count} drives</p>
          <p>{tooltip.data.start_yard} → {tooltip.data.end_yard} yard line</p>
          <p>Avg: {tooltip.data.avg_plays} plays, {tooltip.data.avg_yards} yards</p>
        </div>
      )}

      {/* Data Table Toggle */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-blue-600 hover:underline">
          View as table (screen reader accessible)
        </summary>
        <table className="mt-2 w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Outcome</th>
              <th className="text-left p-2">Start</th>
              <th className="text-left p-2">End</th>
              <th className="text-left p-2">Count</th>
              <th className="text-left p-2">Avg Plays</th>
              <th className="text-left p-2">Avg Yards</th>
            </tr>
          </thead>
          <tbody>
            {drives.map((drive, i) => (
              <tr key={i} className="border-b">
                <td className="p-2 capitalize">{drive.outcome.replace('_', ' ')}</td>
                <td className="p-2">{drive.start_yard}</td>
                <td className="p-2">{drive.end_yard}</td>
                <td className="p-2">{drive.count}</td>
                <td className="p-2">{drive.avg_plays}</td>
                <td className="p-2">{drive.avg_yards}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
