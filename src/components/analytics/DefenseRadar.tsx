'use client'

import { useMemo, useState } from 'react'

interface DefenseMetrics {
  epaAllowed: number      // Lower is better - will be inverted
  havocRate: number       // Higher is better
  stuffRate: number       // Higher is better
  sacks: number           // Higher is better
  interceptions: number   // Higher is better
  tfls: number           // Higher is better (tackles for loss)
}

interface TeamDefenseData {
  team: string
  metrics: DefenseMetrics
}

interface DefenseRadarProps {
  teamData: TeamDefenseData
  allTeamsData: TeamDefenseData[]  // For percentile calculation
  teamColor: string
  size?: number
}

interface RadarMetric {
  label: string
  shortLabel: string
  value: number       // 0-100 percentile
  actualValue: number // Raw value for tooltip
  format: (v: number) => string
  inverted: boolean   // Whether lower is better
}

function computePercentile(value: number, allValues: number[], higherIsBetter: boolean = true): number {
  const sorted = [...allValues].sort((a, b) => a - b)
  const rank = sorted.filter(v => v < value).length
  const percentile = (rank / Math.max(sorted.length - 1, 1)) * 100
  return higherIsBetter ? percentile : 100 - percentile
}

export function DefenseRadar({ teamData, allTeamsData, teamColor, size = 320 }: DefenseRadarProps) {
  const [hoveredMetric, setHoveredMetric] = useState<RadarMetric | null>(null)

  const metrics = useMemo((): RadarMetric[] => {
    const allEpaAllowed = allTeamsData.map(t => t.metrics.epaAllowed)
    const allHavocRate = allTeamsData.map(t => t.metrics.havocRate)
    const allStuffRate = allTeamsData.map(t => t.metrics.stuffRate)
    const allSacks = allTeamsData.map(t => t.metrics.sacks)
    const allInterceptions = allTeamsData.map(t => t.metrics.interceptions)
    const allTfls = allTeamsData.map(t => t.metrics.tfls)

    return [
      {
        label: 'EPA Allowed',
        shortLabel: 'EPA Def',
        // Lower EPA allowed is better, so invert the percentile
        value: computePercentile(teamData.metrics.epaAllowed, allEpaAllowed, false),
        actualValue: teamData.metrics.epaAllowed,
        format: (v) => v.toFixed(3),
        inverted: true
      },
      {
        label: 'Havoc Rate',
        shortLabel: 'Havoc',
        value: computePercentile(teamData.metrics.havocRate, allHavocRate, true),
        actualValue: teamData.metrics.havocRate,
        format: (v) => `${(v * 100).toFixed(1)}%`,
        inverted: false
      },
      {
        label: 'Stuff Rate',
        shortLabel: 'Stuffs',
        value: computePercentile(teamData.metrics.stuffRate, allStuffRate, true),
        actualValue: teamData.metrics.stuffRate,
        format: (v) => `${(v * 100).toFixed(1)}%`,
        inverted: false
      },
      {
        label: 'Sacks',
        shortLabel: 'Sacks',
        value: computePercentile(teamData.metrics.sacks, allSacks, true),
        actualValue: teamData.metrics.sacks,
        format: (v) => v.toFixed(0),
        inverted: false
      },
      {
        label: 'Interceptions',
        shortLabel: 'INTs',
        value: computePercentile(teamData.metrics.interceptions, allInterceptions, true),
        actualValue: teamData.metrics.interceptions,
        format: (v) => v.toFixed(0),
        inverted: false
      },
      {
        label: 'Tackles for Loss',
        shortLabel: 'TFLs',
        value: computePercentile(teamData.metrics.tfls, allTfls, true),
        actualValue: teamData.metrics.tfls,
        format: (v) => v.toFixed(0),
        inverted: false
      }
    ]
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
        {teamData.team} - Defense
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
            {hoveredMetric.inverted && (
              <span className="text-xs text-[var(--text-muted)] ml-1">(lower is better)</span>
            )}
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
            <span>
              {m.shortLabel}
              {m.inverted && <span className="text-[var(--text-muted)]">*</span>}:
            </span>
            <span className="font-mono">{m.format(m.actualValue)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-[var(--text-muted)]">
        * Lower is better (shown inverted on chart)
      </div>
    </div>
  )
}
