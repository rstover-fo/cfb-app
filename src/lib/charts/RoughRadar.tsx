'use client'

/**
 * The one rough radar (docs/chart-style-spec.md; chart-consistency sweep C1).
 * Replaces the plain-SVG analytics radars (RadarChart/OffenseRadar/
 * DefenseRadar) and the players PercentileRadar drawing. Follows the
 * TrajectoryChart recipe: static scaffold (spokes + concentric rings) in
 * JSX, one seeded rough layer for the series polygons, wedge hit-targets
 * driving a ChartTooltip panel below, ChartLegend for two-series renders,
 * framed EmptyState behind an explicit null-guard.
 */
import { useRef, useMemo, useState, useCallback, useEffect } from 'react'
import type { ComponentProps } from 'react'
import rough from 'roughjs'
import { EmptyState } from '@/components/EmptyState'
import { useChartTheme } from './theme'
import { teamInk } from './series'
import { ChartFrame } from './ChartFrame'
import { ChartTooltip } from './ChartTooltip'
import type { ChartTooltipRow } from './ChartTooltip'
import { ChartLegend } from './ChartLegend'
import type { ChartLegendItem } from './ChartLegend'

export interface RoughRadarAxis {
  key: string
  label: string
  /**
   * Tooltip display for this axis's plotted value. Defaults to ordinal
   * percentile formatting ("62nd percentile") -- every current consumer
   * plots percentiles.
   */
  format?: (value: number) => string
}

export interface RoughRadarSeries {
  label: string
  /**
   * Series ink: a resolved team hex or a `var(--…)` token reference.
   * Resolved through `teamInk` inside `drawChart` (spec §6); when omitted,
   * falls back to `--text-primary` (series 1) / `--text-muted` (series 2).
   */
  color?: string
  /** One plotted value per axis, in `axes` order, on 0..domainMax. `null` = missing. */
  values: (number | null)[]
  /**
   * Optional per-axis muted caption rows for the tooltip -- context behind
   * the plotted percentile (e.g. the raw metric value).
   */
  captions?: (string | null)[]
}

export interface RoughRadarProps {
  axes: RoughRadarAxis[]
  /** At most 2 series (spec §9 hierarchy: series 1 primary, series 2 secondary). */
  series: RoughRadarSeries[]
  /**
   * Value domain upper bound. Defaults to 100 (percentile radar) -- the
   * minimal contract covering all current consumers, which normalize to
   * 0-100 percentiles upstream. Custom max is the escape hatch for
   * non-percentile domains; ring labels scale with it.
   */
  domainMax?: number
  /** ChartFrame passthrough. */
  title?: string
  ariaLabel?: string
  decorative?: boolean
  /** Extra null-guard from the consumer, OR-ed with the built-in all-null predicate. */
  empty?: boolean
  emptyState: ComponentProps<typeof EmptyState>
  /** Muted line under the title (e.g. "vs. QB · 2025"). */
  subtitle?: string
  /** Idle tooltip line. */
  tooltipPrompt?: string
  className?: string
}

// Radial chart: square 400x400 canvas instead of the 700x350 default --
// spec §9 (Gate B): dimensions follow the chart's form, and a radar needs
// equal axes in both directions.
const SIZE = 400
const CENTER = SIZE / 2
const RADIUS = 132
const LABEL_RADIUS = RADIUS + 22
const HIT_RADIUS = RADIUS + 30

const RING_LEVELS = [0.25, 0.5, 0.75, 1]

/** Stable wobble (spec §9): identical strokes across re-renders and theme flips. */
const ROUGH_SEED = 41

function angleFor(index: number, total: number): number {
  return (index / total) * 2 * Math.PI - Math.PI / 2
}

function pointAt(angle: number, radius: number): [number, number] {
  return [CENTER + Math.cos(angle) * radius, CENTER + Math.sin(angle) * radius]
}

function ordinal(value: number): string {
  const n = Math.round(value)
  const mod100 = n % 100
  const mod10 = n % 10
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? 'th'
    : mod10 === 1 ? 'st'
    : mod10 === 2 ? 'nd'
    : mod10 === 3 ? 'rd'
    : 'th'
  return `${n}${suffix}`
}

function defaultFormat(value: number): string {
  return `${ordinal(value)} percentile`
}

/** Anchor labels away from the plot: right half starts, left half ends, poles center. */
function anchorFor(angle: number): 'start' | 'middle' | 'end' {
  const normalized = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  if (normalized > Math.PI * 0.1 && normalized < Math.PI * 0.9) return 'start'
  if (normalized > Math.PI * 1.1 && normalized < Math.PI * 1.9) return 'end'
  return 'middle'
}

/** HTML-side swatch color (tooltip/legend): raw prop or the §6 fallback tokens. */
function swatchColor(series: RoughRadarSeries, index: number): string {
  return series.color ?? (index === 0 ? 'var(--text-primary)' : 'var(--text-muted)')
}

export function RoughRadar({
  axes,
  series,
  domainMax = 100,
  title,
  ariaLabel,
  decorative,
  empty = false,
  emptyState,
  subtitle,
  tooltipPrompt = 'Hover a metric for details',
  className,
}: RoughRadarProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)
  const [hoveredAxis, setHoveredAxis] = useState<number | null>(null)

  // At most 2 series draw (spec-mandated API bound).
  const drawnSeries = useMemo(() => series.slice(0, 2), [series])

  // Null-guard predicate (spec §5): a radar needs >= 3 axes and at least one
  // real value -- never a fake zero-polygon from absent data.
  const isEmpty =
    empty ||
    axes.length < 3 ||
    drawnSeries.length === 0 ||
    drawnSeries.every(s => s.values.every(v => v == null))

  // Geometry only -- ink is resolved inside drawChart so theme flips re-resolve it.
  const geometry = useMemo(() => {
    if (isEmpty) return null
    return drawnSeries.map(s => {
      const points = axes.map((_, i) => {
        const value = s.values[i]
        if (value == null) return null
        const clamped = Math.min(Math.max(value, 0), domainMax)
        return pointAt(angleFor(i, axes.length), (clamped / domainMax) * RADIUS)
      })
      return { color: s.color ?? null, points }
    })
  }, [isEmpty, drawnSeries, axes, domainMax])

  const drawChart = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group || !geometry) return

    while (group.firstChild) group.removeChild(group.firstChild)

    const rc = rough.svg(svg)

    geometry.forEach(({ color, points }, si) => {
      const ink = teamInk(color, si === 0 ? 'primary' : 'muted')
      const vertices = points.filter((p): p is [number, number] => p !== null)

      // Series hierarchy (spec §9): series 1 primary weight, series 2
      // secondary. Opposed hachure angles (the ±41° vocabulary from the
      // paired-bar rule) keep overlapping polygons separable when hue alone
      // won't do it.
      const options =
        si === 0
          ? { strokeWidth: 3, roughness: 1.0, bowing: 0.4, hachureAngle: -41 }
          : { strokeWidth: 2, roughness: 0.7, bowing: 0.3, hachureAngle: 41 }

      if (vertices.length >= 3) {
        group.appendChild(
          rc.polygon(vertices, {
            stroke: ink,
            fill: ink,
            fillStyle: 'hachure',
            fillWeight: 0.8,
            hachureGap: 8,
            seed: ROUGH_SEED,
            ...options,
          }),
        )
      }

      // Vertex dots. Roughness 0.5 (below the series hierarchy defaults,
      // spec §9): the default roughness distorts 6-8px circles into scribbles.
      for (const [x, y] of vertices) {
        group.appendChild(
          rc.circle(x, y, si === 0 ? 8 : 6, {
            fill: ink,
            fillStyle: 'solid',
            stroke: ink,
            strokeWidth: 1,
            roughness: 0.5,
            seed: ROUGH_SEED,
          }),
        )
      }
    })
  }, [geometry])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Redraw on theme change
  useChartTheme(drawChart)

  const tooltipRows: ChartTooltipRow[] = []
  if (hoveredAxis !== null && !isEmpty) {
    const axis = axes[hoveredAxis]
    const format = axis.format ?? defaultFormat
    drawnSeries.forEach((s, si) => {
      const value = s.values[hoveredAxis]
      tooltipRows.push({
        swatch: 'solid',
        color: swatchColor(s, si),
        label: `${s.label}:`,
        value: value == null ? '—' : format(value),
      })
      const caption = s.captions?.[hoveredAxis]
      if (caption != null) {
        tooltipRows.push({ label: caption, muted: true })
      }
    })
  }

  // Reserve the densest layout: one row per series plus its caption row.
  const minRows =
    drawnSeries.length +
    drawnSeries.filter(s => s.captions?.some(c => c != null)).length

  const legendItems: ChartLegendItem[] = drawnSeries.map((s, si) => ({
    key: `${s.label}-${si}`,
    label: s.label,
    swatch: 'hachure',
    color: swatchColor(s, si),
  }))

  const halfStep = axes.length > 0 ? Math.PI / axes.length : 0

  return (
    <ChartFrame
      title={title}
      ariaLabel={ariaLabel}
      decorative={decorative}
      empty={isEmpty}
      emptyState={emptyState}
      className={className}
    >
      {a11y => (
        <>
          {subtitle && <p className="text-xs text-[var(--text-muted)] mb-3">{subtitle}</p>}

          <svg
            ref={svgRef}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="w-full h-auto"
            {...a11y}
            onMouseLeave={() => setHoveredAxis(null)}
          >
            {/* Static scaffold: concentric rings */}
            {RING_LEVELS.map(level => (
              <circle
                key={level}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS * level}
                fill="none"
                stroke="var(--border)"
                strokeWidth={1}
                opacity={0.4}
              />
            ))}

            {/* Ring value labels along the top spoke */}
            {RING_LEVELS.map(level => (
              <text
                key={`ring-${level}`}
                x={CENTER + 4}
                y={CENTER - RADIUS * level + 12}
                className="fill-[var(--text-muted)]"
                fontSize={10}
                opacity={0.6}
              >
                {Math.round(level * domainMax)}
              </text>
            ))}

            {/* Static scaffold: spokes + axis labels */}
            {axes.map((axis, i) => {
              const angle = angleFor(i, axes.length)
              const [endX, endY] = pointAt(angle, RADIUS)
              const [labelX, labelY] = pointAt(angle, LABEL_RADIUS)
              return (
                <g key={axis.key}>
                  <line
                    x1={CENTER}
                    y1={CENTER}
                    x2={endX}
                    y2={endY}
                    stroke="var(--border)"
                    strokeWidth={1}
                    opacity={0.4}
                  />
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor={anchorFor(angle)}
                    dominantBaseline="middle"
                    className="fill-[var(--text-muted)] text-xs"
                  >
                    {axis.label}
                  </text>
                </g>
              )
            })}

            {/* Rough-drawn series polygons */}
            <g ref={roughGroupRef} data-testid="rough-layer" />

            {/* Interaction layer: one transparent hit wedge per axis */}
            {axes.map((axis, i) => {
              const angle = angleFor(i, axes.length)
              const [aX, aY] = pointAt(angle - halfStep, HIT_RADIUS)
              const [bX, bY] = pointAt(angle + halfStep, HIT_RADIUS)
              return (
                <polygon
                  key={`hit-${axis.key}`}
                  points={`${CENTER},${CENTER} ${aX},${aY} ${bX},${bY}`}
                  fill="transparent"
                  onMouseEnter={() => setHoveredAxis(i)}
                />
              )
            })}

            {/* Hovered-spoke indicator (the radar's crosshair) */}
            {hoveredAxis !== null && (
              <line
                x1={CENTER}
                y1={CENTER}
                x2={pointAt(angleFor(hoveredAxis, axes.length), RADIUS)[0]}
                y2={pointAt(angleFor(hoveredAxis, axes.length), RADIUS)[1]}
                stroke="var(--text-muted)"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                opacity={0.6}
              />
            )}
          </svg>

          <ChartTooltip
            header={hoveredAxis !== null ? axes[hoveredAxis].label : undefined}
            rows={tooltipRows}
            prompt={tooltipPrompt}
            minRows={Math.max(minRows, 1)}
          />

          {drawnSeries.length === 2 && <ChartLegend items={legendItems} />}
        </>
      )}
    </ChartFrame>
  )
}
