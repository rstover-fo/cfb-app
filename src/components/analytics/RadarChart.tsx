'use client'

import { useMemo } from 'react'

interface RadarMetric {
  label: string
  value: number  // 0-100 percentile
}

interface RadarChartProps {
  metrics: RadarMetric[]
  teamName: string
  teamColor: string
  size?: number
}

export function RadarChart({ metrics, teamName, teamColor, size = 300 }: RadarChartProps) {
  const center = size / 2
  const radius = (size - 60) / 2
  const angleStep = (2 * Math.PI) / metrics.length

  const points = useMemo(() => {
    return metrics.map((m, i) => {
      const angle = i * angleStep - Math.PI / 2  // Start from top
      const r = (m.value / 100) * radius
      return {
        x: center + r * Math.cos(angle),
        y: center + r * Math.sin(angle),
        labelX: center + (radius + 20) * Math.cos(angle),
        labelY: center + (radius + 20) * Math.sin(angle),
        label: m.label,
        value: m.value
      }
    })
  }, [metrics, center, radius, angleStep])

  const pathD = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
  ).join(' ') + ' Z'

  // Grid circles at 25%, 50%, 75%, 100%
  const gridLevels = [25, 50, 75, 100]

  return (
    <div className="flex flex-col items-center">
      <h4 className="font-headline text-lg mb-2 text-[var(--text-primary)]">{teamName}</h4>
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
        {points.map((p, i) => (
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

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            fill={teamColor}
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
          >
            {p.label}
          </text>
        ))}
      </svg>
    </div>
  )
}
