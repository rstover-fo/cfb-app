'use client'

import { useState, useEffect, useRef } from 'react'
import { TeamSeasonTrajectory } from '@/lib/types/database'

interface TrajectoryChartProps {
  trajectory: TeamSeasonTrajectory[]
}

type MetricKey = 'wins' | 'epa' | 'rank'

const METRICS: { key: MetricKey; label: string; getValue: (t: TeamSeasonTrajectory) => number | null; format: (v: number) => string; invert?: boolean }[] = [
  { key: 'wins', label: 'Wins', getValue: t => t.wins, format: v => v.toString() },
  { key: 'epa', label: 'EPA', getValue: t => t.epa_per_play, format: v => v.toFixed(3) },
  { key: 'rank', label: 'Rank', getValue: t => t.off_epa_rank, format: v => `#${v}`, invert: true },
]

const ANIMATION_DURATION = 800

export function TrajectoryChart({ trajectory }: TrajectoryChartProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('wins')
  const [animationProgress, setAnimationProgress] = useState(0)
  const animationRef = useRef<number | null>(null)

  const metric = METRICS.find(m => m.key === selectedMetric)!
  const data = trajectory
    .map(t => ({ season: t.season, value: metric.getValue(t) }))
    .filter((d): d is { season: number; value: number } => d.value !== null)
    .sort((a, b) => a.season - b.season)

  // Start animation on metric change
  useEffect(() => {
    const startTime = performance.now()

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / ANIMATION_DURATION, 1)
      setAnimationProgress(progress)

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      }
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [selectedMetric])

  if (data.length === 0) {
    return (
      <div className="card p-6">
        <p className="text-[var(--text-muted)] text-center py-8">
          Historical data not available for this team.
        </p>
      </div>
    )
  }

  const padding = { top: 20, right: 20, bottom: 40, left: 50 }
  const width = 600
  const height = 300
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const values = data.map(d => d.value)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal || 1

  const getX = (i: number) => padding.left + (i / (data.length - 1 || 1)) * chartWidth
  const getY = (val: number) => {
    const normalized = (val - minVal) / range
    return metric.invert
      ? padding.top + normalized * chartHeight
      : padding.top + (1 - normalized) * chartHeight
  }

  const pathPoints = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.value)}`).join(' ')
  const visibleLength = animationProgress * data.length

  return (
    <div className="card p-6">
      {/* Metric Toggle */}
      <div className="flex gap-2 mb-6">
        {METRICS.map(m => (
          <button
            key={m.key}
            onClick={() => setSelectedMetric(m.key)}
            className={`px-3 py-1.5 border-[1.5px] rounded-sm text-sm transition-all ${
              selectedMetric === m.key
                ? 'bg-[var(--bg-surface-alt)] border-[var(--color-run)] text-[var(--text-primary)]'
                : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Y-axis labels */}
        {[0, 0.5, 1].map(pct => {
          const val = metric.invert
            ? minVal + pct * range
            : maxVal - pct * range
          return (
            <text
              key={pct}
              x={padding.left - 10}
              y={padding.top + pct * chartHeight}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-[var(--text-muted)] text-xs"
            >
              {metric.format(val)}
            </text>
          )
        })}

        {/* X-axis labels (seasons) */}
        {data.map((d, i) => (
          <text
            key={d.season}
            x={getX(i)}
            y={height - 10}
            textAnchor="middle"
            className="fill-[var(--text-muted)] text-xs"
          >
            {d.season}
          </text>
        ))}

        {/* Grid lines */}
        {[0, 0.5, 1].map(pct => (
          <line
            key={pct}
            x1={padding.left}
            y1={padding.top + pct * chartHeight}
            x2={width - padding.right}
            y2={padding.top + pct * chartHeight}
            stroke="var(--border)"
            strokeWidth={1}
            opacity={0.5}
          />
        ))}

        {/* Line path with hand-drawn effect */}
        <path
          d={pathPoints}
          fill="none"
          stroke="var(--color-run)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={chartWidth * 2}
          strokeDashoffset={chartWidth * 2 * (1 - animationProgress)}
          style={{
            filter: 'url(#chart-roughen)',
            transition: 'stroke-dashoffset 50ms linear',
          }}
        />

        {/* Data points */}
        {data.map((d, i) => {
          const visible = i < visibleLength
          return (
            <g key={d.season}>
              <circle
                cx={getX(i)}
                cy={getY(d.value)}
                r={6}
                fill="var(--bg-surface)"
                stroke="var(--color-run)"
                strokeWidth={2}
                opacity={visible ? 1 : 0}
                style={{ transition: 'opacity 150ms ease' }}
              />
              {visible && (
                <title>{`${d.season}: ${metric.format(d.value)}`}</title>
              )}
            </g>
          )
        })}

        {/* SVG filter for roughness */}
        <defs>
          <filter id="chart-roughen">
            <feTurbulence type="turbulence" baseFrequency="0.015" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1" />
          </filter>
        </defs>
      </svg>
    </div>
  )
}
