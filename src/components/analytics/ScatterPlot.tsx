'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

interface DataPoint {
  id: number
  name: string
  x: number
  y: number
  color: string
  logo: string | null
  conference: string | null
}

interface ScatterPlotProps {
  data: DataPoint[]
  xLabel: string
  yLabel: string
  xInvert?: boolean  // Lower is better (for ranks)
  yInvert?: boolean
}

const MARGIN = { top: 40, right: 40, bottom: 60, left: 70 }
const WIDTH = 800
const HEIGHT = 500

export function ScatterPlot({ data, xLabel, yLabel, xInvert = false, yInvert = false }: ScatterPlotProps) {
  const router = useRouter()
  const [hoveredPoint, setHoveredPoint] = useState<DataPoint | null>(null)

  const { xScale, yScale, xDomain, yDomain } = useMemo(() => {
    const xValues = data.map(d => d.x)
    const yValues = data.map(d => d.y)

    const xMin = Math.min(...xValues)
    const xMax = Math.max(...xValues)
    const yMin = Math.min(...yValues)
    const yMax = Math.max(...yValues)

    // Add 10% padding
    const xPad = (xMax - xMin) * 0.1
    const yPad = (yMax - yMin) * 0.1

    const xDomain = [xMin - xPad, xMax + xPad]
    const yDomain = [yMin - yPad, yMax + yPad]

    const plotWidth = WIDTH - MARGIN.left - MARGIN.right
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom

    const xScale = (val: number) => {
      const normalized = (val - xDomain[0]) / (xDomain[1] - xDomain[0])
      return MARGIN.left + (xInvert ? 1 - normalized : normalized) * plotWidth
    }

    const yScale = (val: number) => {
      const normalized = (val - yDomain[0]) / (yDomain[1] - yDomain[0])
      return MARGIN.top + (yInvert ? normalized : 1 - normalized) * plotHeight
    }

    return { xScale, yScale, xDomain, yDomain }
  }, [data, xInvert, yInvert])

  const handleClick = (point: DataPoint) => {
    const slug = point.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    router.push(`/teams/${slug}`)
  }

  // Generate axis ticks
  const xTicks = useMemo(() => {
    const count = 6
    const step = (xDomain[1] - xDomain[0]) / (count - 1)
    return Array.from({ length: count }, (_, i) => xDomain[0] + i * step)
  }, [xDomain])

  const yTicks = useMemo(() => {
    const count = 6
    const step = (yDomain[1] - yDomain[0]) / (count - 1)
    return Array.from({ length: count }, (_, i) => yDomain[0] + i * step)
  }, [yDomain])

  // Calculate means for reference lines
  const { xMean, yMean } = useMemo(() => {
    const xSum = data.reduce((sum, d) => sum + d.x, 0)
    const ySum = data.reduce((sum, d) => sum + d.y, 0)
    return {
      xMean: xSum / data.length,
      yMean: ySum / data.length
    }
  }, [data])

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full max-w-4xl mx-auto"
        role="img"
        aria-label={`Scatter plot of ${xLabel} vs ${yLabel} for all FBS teams`}
      >
        {/* Grid lines */}
        <g className="grid-lines">
          {xTicks.map((tick, i) => (
            <line
              key={`x-${i}`}
              x1={xScale(tick)}
              y1={MARGIN.top}
              x2={xScale(tick)}
              y2={HEIGHT - MARGIN.bottom}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          ))}
          {yTicks.map((tick, i) => (
            <line
              key={`y-${i}`}
              x1={MARGIN.left}
              y1={yScale(tick)}
              x2={WIDTH - MARGIN.right}
              y2={yScale(tick)}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          ))}
        </g>

        {/* Mean reference lines */}
        <line
          x1={xScale(xMean)}
          y1={MARGIN.top}
          x2={xScale(xMean)}
          y2={HEIGHT - MARGIN.bottom}
          stroke="var(--color-run)"
          strokeWidth={1.5}
          strokeDasharray="8,4"
          opacity={0.5}
        />
        <line
          x1={MARGIN.left}
          y1={yScale(yMean)}
          x2={WIDTH - MARGIN.right}
          y2={yScale(yMean)}
          stroke="var(--color-run)"
          strokeWidth={1.5}
          strokeDasharray="8,4"
          opacity={0.5}
        />

        {/* Quadrant labels */}
        <text
          x={MARGIN.left + 10}
          y={MARGIN.top + 20}
          fill="var(--text-muted)"
          fontSize={11}
          opacity={0.6}
        >
          {yInvert ? 'Strong Defense' : 'High Y'} / {xInvert ? 'Strong Offense' : 'Low X'}
        </text>
        <text
          x={WIDTH - MARGIN.right - 10}
          y={MARGIN.top + 20}
          fill="var(--text-muted)"
          fontSize={11}
          textAnchor="end"
          opacity={0.6}
        >
          {yInvert ? 'Strong Defense' : 'High Y'} / {xInvert ? 'Weak Offense' : 'High X'}
        </text>
        <text
          x={MARGIN.left + 10}
          y={HEIGHT - MARGIN.bottom - 10}
          fill="var(--text-muted)"
          fontSize={11}
          opacity={0.6}
        >
          {yInvert ? 'Weak Defense' : 'Low Y'} / {xInvert ? 'Strong Offense' : 'Low X'}
        </text>
        <text
          x={WIDTH - MARGIN.right - 10}
          y={HEIGHT - MARGIN.bottom - 10}
          fill="var(--text-muted)"
          fontSize={11}
          textAnchor="end"
          opacity={0.6}
        >
          {yInvert ? 'Weak Defense' : 'Low Y'} / {xInvert ? 'Weak Offense' : 'High X'}
        </text>

        {/* Axes */}
        <line
          x1={MARGIN.left}
          y1={HEIGHT - MARGIN.bottom}
          x2={WIDTH - MARGIN.right}
          y2={HEIGHT - MARGIN.bottom}
          stroke="var(--text-muted)"
          strokeWidth={1.5}
        />
        <line
          x1={MARGIN.left}
          y1={MARGIN.top}
          x2={MARGIN.left}
          y2={HEIGHT - MARGIN.bottom}
          stroke="var(--text-muted)"
          strokeWidth={1.5}
        />

        {/* X-axis ticks and labels */}
        {xTicks.map((tick, i) => (
          <g key={`x-tick-${i}`}>
            <line
              x1={xScale(tick)}
              y1={HEIGHT - MARGIN.bottom}
              x2={xScale(tick)}
              y2={HEIGHT - MARGIN.bottom + 6}
              stroke="var(--text-muted)"
              strokeWidth={1}
            />
            <text
              x={xScale(tick)}
              y={HEIGHT - MARGIN.bottom + 20}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize={12}
            >
              {tick.toFixed(2)}
            </text>
          </g>
        ))}

        {/* Y-axis ticks and labels */}
        {yTicks.map((tick, i) => (
          <g key={`y-tick-${i}`}>
            <line
              x1={MARGIN.left - 6}
              y1={yScale(tick)}
              x2={MARGIN.left}
              y2={yScale(tick)}
              stroke="var(--text-muted)"
              strokeWidth={1}
            />
            <text
              x={MARGIN.left - 12}
              y={yScale(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              fill="var(--text-muted)"
              fontSize={12}
            >
              {tick.toFixed(2)}
            </text>
          </g>
        ))}

        {/* Axis labels */}
        <text
          x={WIDTH / 2}
          y={HEIGHT - 10}
          textAnchor="middle"
          fill="var(--text-secondary)"
          fontSize={14}
          fontWeight={500}
        >
          {xLabel}
        </text>
        <text
          x={20}
          y={HEIGHT / 2}
          textAnchor="middle"
          fill="var(--text-secondary)"
          fontSize={14}
          fontWeight={500}
          transform={`rotate(-90, 20, ${HEIGHT / 2})`}
        >
          {yLabel}
        </text>

        {/* Data points */}
        {data.map(point => (
          <g
            key={point.id}
            style={{ cursor: 'pointer' }}
            onClick={() => handleClick(point)}
            onMouseEnter={() => setHoveredPoint(point)}
            onMouseLeave={() => setHoveredPoint(null)}
          >
            <circle
              cx={xScale(point.x)}
              cy={yScale(point.y)}
              r={hoveredPoint?.id === point.id ? 10 : 7}
              fill={point.color || 'var(--color-run)'}
              fillOpacity={hoveredPoint?.id === point.id ? 1 : 0.7}
              stroke={hoveredPoint?.id === point.id ? 'var(--text-primary)' : 'none'}
              strokeWidth={2}
              className="transition-all duration-150"
            />
          </g>
        ))}
      </svg>

      {/* Tooltip */}
      {hoveredPoint && (
        <div
          className="absolute bg-[var(--bg-surface)] border border-[var(--border)] rounded-sm shadow-lg p-3 pointer-events-none z-10"
          style={{
            left: `${xScale(hoveredPoint.x) / WIDTH * 100}%`,
            top: `${yScale(hoveredPoint.y) / HEIGHT * 100 - 15}%`,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            {hoveredPoint.logo && (
              <img src={hoveredPoint.logo} alt="" className="w-6 h-6 object-contain" />
            )}
            <span className="font-medium text-[var(--text-primary)]">{hoveredPoint.name}</span>
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {hoveredPoint.conference || 'Independent'}
          </div>
          <div className="text-sm text-[var(--text-secondary)] mt-1">
            {xLabel}: {hoveredPoint.x.toFixed(3)}
            <br />
            {yLabel}: {hoveredPoint.y.toFixed(3)}
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1">
            Click to view team
          </div>
        </div>
      )}
    </div>
  )
}
