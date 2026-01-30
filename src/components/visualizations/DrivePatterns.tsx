'use client'

import { useState, useEffect, useRef } from 'react'
import { FootballField, yardToX } from './FootballField'
import { DrivePattern } from '@/lib/types/database'

interface DrivePatternsProps {
  drives: DrivePattern[]
  teamName: string
}

const OUTCOME_COLORS = {
  touchdown: 'var(--color-positive)',
  field_goal: 'var(--color-field-goal)',
  punt: 'var(--color-neutral)',
  turnover: 'var(--color-negative)',
  downs: 'var(--color-run)',
  end_of_half: 'var(--color-pass)',
} as const

const OUTCOME_LABELS = {
  touchdown: 'Touchdown',
  field_goal: 'Field Goal',
  punt: 'Punt',
  turnover: 'Turnover',
  downs: 'Turnover on Downs',
  end_of_half: 'End of Half',
} as const

const OUTCOME_ORDER = ['touchdown', 'field_goal', 'punt', 'turnover', 'downs', 'end_of_half']

export function DrivePatterns({ drives, teamName: _teamName }: DrivePatternsProps) {
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: DrivePattern } | null>(null)
  const [animatedArcs, setAnimatedArcs] = useState<Set<number>>(new Set())
  const svgRef = useRef<SVGGElement>(null)

  const fieldWidth = 1000 - (1000 / 120) * 20
  const fieldHeight = 400

  // Animate arcs by outcome group
  useEffect(() => {
    const grouped = OUTCOME_ORDER.map(outcome =>
      drives.map((d, i) => ({ drive: d, index: i })).filter(({ drive }) => drive.outcome === outcome)
    ).flat()

    let delay = 0
    grouped.forEach(({ index }) => {
      setTimeout(() => {
        setAnimatedArcs(prev => new Set([...prev, index]))
      }, delay)
      delay += 150
    })

    return () => setAnimatedArcs(new Set())
  }, [drives])

  // Generate arc path
  function getArcPath(drive: DrivePattern): string {
    const startX = yardToX(drive.start_yard, fieldWidth)
    const endX = yardToX(drive.end_yard, fieldWidth)
    const midX = (startX + endX) / 2

    const driveLength = Math.abs(drive.end_yard - drive.start_yard)
    const baseHeight = Math.min(driveLength * 2, fieldHeight * 0.4)
    const arcHeight = baseHeight * (1 + Math.log10(Math.max(drive.count, 1)) * 0.2)

    const midY = fieldHeight / 2
    const controlY = midY - arcHeight

    return `M ${startX} ${midY} Q ${midX} ${controlY} ${endX} ${midY}`
  }

  const outcomes = [...new Set(drives.map(d => d.outcome))]

  return (
    <div className="relative">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4" role="list" aria-label="Drive outcome legend">
        {outcomes.map(outcome => {
          const color = OUTCOME_COLORS[outcome as keyof typeof OUTCOME_COLORS] || '#999'
          const label = OUTCOME_LABELS[outcome as keyof typeof OUTCOME_LABELS] || outcome
          const isSelected = selectedOutcome === null || selectedOutcome === outcome

          return (
            <button
              key={outcome}
              onClick={() => setSelectedOutcome(selectedOutcome === outcome ? null : outcome)}
              className={`flex items-center gap-2 px-3 py-1.5 border-[1.5px] border-[var(--border)] rounded-sm transition-all ${
                isSelected ? 'opacity-100' : 'opacity-40'
              } ${selectedOutcome === outcome ? 'bg-[var(--bg-surface-alt)] border-[var(--color-run)]' : 'bg-transparent'}`}
              aria-pressed={selectedOutcome === outcome}
            >
              <svg width={24} height={12}>
                <path
                  d="M 0 6 Q 12 0 24 6"
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  style={{ stroke: color }}
                />
              </svg>
              <span className="text-sm text-[var(--text-secondary)]">{label}</span>
            </button>
          )
        })}
      </div>

      {/* Field with Arcs */}
      <FootballField width={1000} height={400}>
        <g ref={svgRef}>
          {drives.map((drive, i) => {
            const color = OUTCOME_COLORS[drive.outcome as keyof typeof OUTCOME_COLORS] || '#999'
            const isVisible = selectedOutcome === null || selectedOutcome === drive.outcome
            const isAnimated = animatedArcs.has(i)
            const pathLength = 500

            return (
              <path
                key={i}
                d={getArcPath(drive)}
                fill="none"
                stroke={color}
                strokeWidth={Math.max(2, Math.min(drive.count / 2, 8))}
                opacity={isVisible ? (isAnimated ? 0.8 : 0) : 0.1}
                strokeLinecap="round"
                strokeDasharray={pathLength}
                strokeDashoffset={isAnimated ? 0 : pathLength}
                style={{
                  transition: 'stroke-dashoffset 400ms ease-out, opacity 200ms ease',
                  filter: 'url(#roughen)',
                }}
                className="cursor-pointer hover:opacity-100"
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setTooltip({ x: rect.x + rect.width / 2, y: rect.y, data: drive })
                }}
                onMouseLeave={() => setTooltip(null)}
                tabIndex={isVisible ? 0 : -1}
                role="button"
                aria-label={`${drive.count} drives from ${drive.start_yard} to ${drive.end_yard} yard line, ${drive.outcome}`}
              />
            )
          })}
        </g>
        {/* SVG filter for slight roughness */}
        <defs>
          <filter id="roughen">
            <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" />
          </filter>
        </defs>
      </FootballField>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute bg-[var(--bg-surface)] text-[var(--text-primary)] text-sm px-4 py-3 rounded border border-[var(--border)] shadow-lg pointer-events-none z-10"
          style={{
            left: tooltip.x,
            top: tooltip.y - 80,
            transform: 'translateX(-50%)'
          }}
        >
          <p className="font-headline text-base capitalize mb-1">
            {tooltip.data.outcome.replace('_', ' ')}
          </p>
          <p className="text-[var(--text-secondary)]">{tooltip.data.count} drives</p>
          <p className="text-[var(--text-muted)] text-xs">
            {tooltip.data.start_yard} → {tooltip.data.end_yard} yd | {tooltip.data.avg_plays} plays avg
          </p>
        </div>
      )}

      {/* Data Table */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
          View as table
        </summary>
        <table className="mt-2 w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left p-2 text-[var(--text-muted)]">Outcome</th>
              <th className="text-left p-2 text-[var(--text-muted)]">Start</th>
              <th className="text-left p-2 text-[var(--text-muted)]">End</th>
              <th className="text-left p-2 text-[var(--text-muted)]">Count</th>
              <th className="text-left p-2 text-[var(--text-muted)]">Avg Plays</th>
            </tr>
          </thead>
          <tbody>
            {drives.map((drive, i) => (
              <tr key={i} className="border-b border-[var(--border)]">
                <td className="p-2 capitalize text-[var(--text-primary)]">{drive.outcome.replace('_', ' ')}</td>
                <td className="p-2 text-[var(--text-secondary)]">{drive.start_yard}</td>
                <td className="p-2 text-[var(--text-secondary)]">{drive.end_yard}</td>
                <td className="p-2 text-[var(--text-secondary)]">{drive.count}</td>
                <td className="p-2 text-[var(--text-secondary)]">{drive.avg_plays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
