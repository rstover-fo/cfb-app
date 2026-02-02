'use client'

import { useMemo, useState } from 'react'

interface OffenseMetrics {
  rushEpa: number
  passEpa: number
  successRate: number
  explosiveness: number
  thirdDownRate?: number  // Optional - use if available
}

interface TeamOffenseData {
  team: string
  metrics: OffenseMetrics
}

interface OffenseRadarProps {
  teamData: TeamOffenseData
  allTeamsData: TeamOffenseData[]  // For percentile calculation
  teamColor: string
  size?: number
}

interface RadarMetric {
  label: string
  shortLabel: string
  value: number       // 0-100 percentile
  actualValue: number // Raw value for tooltip
  format: (v: number) => string
}

function computePercentile(value: number, allValues: number[], higherIsBetter: boolean = true): number {
  const sorted = [...allValues].sort((a, b) => a - b)
  const rank = sorted.filter(v => v < value).length
  const percentile = (rank / Math.max(sorted.length - 1, 1)) * 100
  return higherIsBetter ? percentile : 100 - percentile
}

export function OffenseRadar({ teamData, allTeamsData, teamColor, size = 320 }: OffenseRadarProps) {
  const [hoveredMetric, setHoveredMetric] = useState<RadarMetric | null>(null)

  const metrics = useMemo((): RadarMetric[] => {
    const allRushEpa = allTeamsData.map(t => t.metrics.rushEpa)
    const allPassEpa = allTeamsData.map(t => t.metrics.passEpa)
    const allSuccessRate = allTeamsData.map(t => t.metrics.successRate)
    const allExplosiveness = allTeamsData.map(t => t.metrics.explosiveness)
    const allThirdDown = allTeamsData
      .filter(t => t.metrics.thirdDownRate !== undefined)
      .map(t => t.metrics.thirdDownRate!)

    const result: RadarMetric[] = [
      {
        label: 'Rush EPA',
        shortLabel: 'Rush',
        value: computePercentile(teamData.metrics.rushEpa, allRushEpa),
        actualValue: teamData.metrics.rushEpa,
        format: (v) => v.toFixed(3)
      },
      {
        label: 'Pass EPA',
        shortLabel: 'Pass',
        value: computePercentile(teamData.metrics.passEpa, allPassEpa),
        actualValue: teamData.metrics.passEpa,
        format: (v) => v.toFixed(3)
      },
      {
        label: 'Success Rate',
        shortLabel: 'Success',
        value: computePercentile(teamData.metrics.successRate, allSuccessRate),
        actualValue: teamData.metrics.successRate,
        format: (v) => `${(v * 100).toFixed(1)}%`
      },
      {
        label: 'Explosiveness',
        shortLabel: 'Explosive',
        value: computePercentile(teamData.metrics.explosiveness, allExplosiveness),
        actualValue: teamData.metrics.explosiveness,
        format: (v) => v.toFixed(3)
      }
    ]

    // Add 3rd down conversion if available
    if (teamData.metrics.thirdDownRate !== undefined && allThirdDown.length > 0) {
      result.push({
        label: '3rd Down Rate',
        shortLabel: '3rd Down',
        value: computePercentile(teamData.metrics.thirdDownRate, allThirdDown),
        actualValue: teamData.metrics.thirdDownRate,
        format: (v) => `${(v * 100).toFixed(1)}%`
      })
    }

    return result
  }, [teamData, allTeamsData])

  const center = size / 2
  const radius = (size - 80) / 2
  const angleStep = (2 * Math.PI) / metrics.length

  const points = useMemo(() => {
    return metrics.map((m, i) => {
      const angle = i * angleStep - Math.PI / 2  // Start from top
      const r = (m.value / 100) * radius
      return {
        x: center + r * Math.cos(angle),
        y: center + r * Math.sin(angle),
        labelX: center + (radius + 28) * Math.cos(angle),
        labelY: center + (radius + 28) * Math.sin(angle),
        metric: m
      }
    })
  }, [metrics, center, radius, angleStep])

  const pathD = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
  ).join(' ') + ' Z'

  // Grid circles at 25%, 50%, 75%, 100%
  const gridLevels = [25, 50, 75, 100]

  return (
    <div className="flex flex-col items-center relative">
      <h4 className="font-headline text-lg mb-2 text-[var(--text-primary)]">
        {teamData.team} - Offense
      </h4>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid circles */}
        {gridLevels.map(level => (
          <circle
            key={level}
            cx={center}
            cy={center}
            r={(level / 100) * radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray={level === 100 ? 'none' : '2,2'}
          />
        ))}

        {/* Axis lines */}
        {points.map((_, i) => (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={center + radius * Math.cos(i * angleStep - Math.PI / 2)}
            y2={center + radius * Math.sin(i * angleStep - Math.PI / 2)}
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}

        {/* Data polygon */}
        <path
          d={pathD}
          fill={teamColor}
          fillOpacity={0.3}
          stroke={teamColor}
          strokeWidth={2}
        />

        {/* Data points with hover detection */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hoveredMetric?.label === p.metric.label ? 6 : 4}
            fill={teamColor}
            stroke={hoveredMetric?.label === p.metric.label ? 'white' : 'none'}
            strokeWidth={2}
            style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
            onMouseEnter={() => setHoveredMetric(p.metric)}
            onMouseLeave={() => setHoveredMetric(null)}
          />
        ))}

        {/* Labels */}
        {points.map((p, i) => (
          <text
            key={i}
            x={p.labelX}
            y={p.labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-xs fill-[var(--text-secondary)]"
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHoveredMetric(p.metric)}
            onMouseLeave={() => setHoveredMetric(null)}
          >
            {p.metric.shortLabel}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {hoveredMetric && (
        <div
          className="absolute bg-[var(--bg-surface)] border border-[var(--border)] rounded px-3 py-2 shadow-lg z-10 pointer-events-none"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)'
          }}
        >
          <div className="text-sm font-medium text-[var(--text-primary)]">
            {hoveredMetric.label}
          </div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">
            Value: {hoveredMetric.format(hoveredMetric.actualValue)}
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            Percentile: {hoveredMetric.value.toFixed(0)}th
          </div>
        </div>
      )}

      {/* Metric legend */}
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {metrics.map((m, i) => (
          <div
            key={i}
            className="flex justify-between items-center gap-2 text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)]"
            onMouseEnter={() => setHoveredMetric(m)}
            onMouseLeave={() => setHoveredMetric(null)}
          >
            <span>{m.shortLabel}:</span>
            <span className="font-mono">{m.format(m.actualValue)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
