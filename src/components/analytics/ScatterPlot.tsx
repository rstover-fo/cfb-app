'use client'

/**
 * Rough-aesthetic scatter explorer (docs/chart-style-spec.md; chart-consistency
 * sweep C2). Follows the TrajectoryChart recipe: manual scales in `useMemo`, a
 * static token-ink scaffold (grid, quadrant rules/labels, axis labels), one
 * seeded rough layer, and a `drawChart` callback wired via
 * `useEffect` + `useChartTheme`.
 *
 * Raster exemption (spec §7): team-logo points stay native `<image>` elements
 * and are never roughified. The retired `feDropShadow` glow and `animate-pulse`
 * dashed ring are replaced by rough `rc.circle` accent rings -- solid for
 * hover, static dashed for the search highlight. Details render in the
 * `ChartTooltip` panel below the SVG (never a floating cursor panel).
 */
import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import rough from 'roughjs'
import { ChartScatter } from '@phosphor-icons/react'
import { CHART_INK, resolveColor, useChartTheme } from '@/lib/charts/theme'
import { teamInk } from '@/lib/charts/series'
import { ChartFrame } from '@/lib/charts/ChartFrame'
import { ChartTooltip } from '@/lib/charts/ChartTooltip'
import type { ChartTooltipRow } from '@/lib/charts/ChartTooltip'
import { gridLinesY, axisLabelsY } from '@/lib/charts/axes'
import type { ChartLayout } from '@/lib/charts/axes'
import { teamNameToSlug } from '@/lib/utils'

interface DataPoint {
  id: number
  name: string
  x: number
  y: number
  color: string
  logo: string | null
  conference: string | null
  compositeScore?: number // Optional third dimension for point sizing
}

interface QuadrantLabels {
  topLeft: string
  topRight: string
  bottomLeft: string
  bottomRight: string
}

interface ScatterPlotProps {
  data: DataPoint[]
  xLabel: string
  yLabel: string
  xInvert?: boolean // Lower is better (for ranks)
  yInvert?: boolean
  quadrantLabels?: QuadrantLabels
  showLogos?: boolean
  highlightedTeamId?: number | null
}

const WIDTH = 700
// Taller than the 350 default (spec §9, Gate B allowance): a ~130-team logo
// scatter needs a near-square plot so both quadrant axes read at equal weight
// and logos don't overlap into an unreadable band.
const HEIGHT = 440
const PADDING = { top: 30, right: 30, bottom: 50, left: 60 }
const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom
const LAYOUT: ChartLayout = { width: WIDTH, height: HEIGHT, padding: PADDING }

/** Stable wobble (spec §9): identical strokes across re-renders and theme flips. */
const ROUGH_SEED = 53

const TICK_COUNT = 6
/** Logo marks: 24px raster squares. */
const LOGO_RADIUS = 12
/** Fallback color-dot marks. */
const DOT_RADIUS = 7

export function ScatterPlot({
  data,
  xLabel,
  yLabel,
  xInvert = false,
  yInvert = false,
  quadrantLabels,
  showLogos = true,
  highlightedTeamId = null,
}: ScatterPlotProps) {
  const router = useRouter()
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)
  const [hoveredPoint, setHoveredPoint] = useState<DataPoint | null>(null)

  // Scales, projected points, ticks, and means -- geometry only (spec §1.3):
  // ink is resolved inside drawChart so theme flips re-resolve it.
  const chartGeometry = useMemo(() => {
    if (data.length === 0) return null

    const xValues = data.map(d => d.x)
    const yValues = data.map(d => d.y)

    const xMin = Math.min(...xValues)
    const xMax = Math.max(...xValues)
    const yMin = Math.min(...yValues)
    const yMax = Math.max(...yValues)

    // Add 10% padding; guard degenerate single-value domains.
    const xPad = (xMax - xMin) * 0.1 || 1
    const yPad = (yMax - yMin) * 0.1 || 1

    const xDomain: [number, number] = [xMin - xPad, xMax + xPad]
    const yDomain: [number, number] = [yMin - yPad, yMax + yPad]

    const xScale = (val: number) => {
      const normalized = (val - xDomain[0]) / (xDomain[1] - xDomain[0])
      return PADDING.left + (xInvert ? 1 - normalized : normalized) * PLOT_WIDTH
    }
    const yScale = (val: number) => {
      const normalized = (val - yDomain[0]) / (yDomain[1] - yDomain[0])
      return PADDING.top + (yInvert ? normalized : 1 - normalized) * PLOT_HEIGHT
    }

    const points = data.map(point => ({
      ...point,
      cx: xScale(point.x),
      cy: yScale(point.y),
    }))

    // X ticks: evenly spaced domain values, positioned through the scale.
    const xTicks = Array.from({ length: TICK_COUNT }, (_, i) => {
      const val = xDomain[0] + (i / (TICK_COUNT - 1)) * (xDomain[1] - xDomain[0])
      return { x: xScale(val), val }
    })

    // Y ticks keyed by fractional position (axes-helper convention): pct 0 is
    // the top of the plot, so the value there depends on axis inversion.
    const yTicks = Array.from({ length: TICK_COUNT }, (_, i) => {
      const pct = i / (TICK_COUNT - 1)
      const val = yInvert
        ? yDomain[0] + pct * (yDomain[1] - yDomain[0])
        : yDomain[1] - pct * (yDomain[1] - yDomain[0])
      return { pct, val }
    })

    // Means split the plot into quadrants.
    const xMean = data.reduce((sum, d) => sum + d.x, 0) / data.length
    const yMean = data.reduce((sum, d) => sum + d.y, 0) / data.length

    return { points, xTicks, yTicks, meanX: xScale(xMean), meanY: yScale(yMean) }
  }, [data, xInvert, yInvert])

  const drawChart = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group || !chartGeometry) return

    while (group.firstChild) group.removeChild(group.firstChild)

    const rc = rough.svg(svg)
    const accentColor = resolveColor(CHART_INK.accent)
    const surfaceColor = resolveColor(CHART_INK.surface)

    for (const point of chartGeometry.points) {
      const usesLogo = showLogos && point.logo !== null
      const isHovered = hoveredPoint?.id === point.id
      const isHighlighted = highlightedTeamId === point.id
      const isDimmed = highlightedTeamId !== null && !isHighlighted && !isHovered
      const markRadius = usesLogo ? LOGO_RADIUS : DOT_RADIUS

      // Fallback mode: non-logo points are rough color dots (team ink through
      // the §6 pass-through). Logo points stay native <image> (raster
      // exemption, §7) and add no rough content here -- in logo mode the
      // rough layer is just the one or two active rings, so hover redraws
      // stay cheap. Roughness 0.5 / bowing 0.2 (below the §9 hierarchy
      // defaults): default roughness distorts 14px circles into scribbles.
      if (!usesLogo) {
        const dot = rc.circle(point.cx, point.cy, DOT_RADIUS * 2, {
          fill: teamInk(point.color || null, 'primary'),
          fillStyle: 'solid',
          stroke: surfaceColor, // was rgba(255,255,255,.3): §6 -> var(--bg-surface) rim
          strokeWidth: 1,
          roughness: 0.5,
          bowing: 0.2,
          seed: ROUGH_SEED,
        })
        if (isDimmed) dot.style.opacity = '0.3'
        group.appendChild(dot)
      }

      // Accent selection rings (spec §3 dense-surfaces rule, §7): rough
      // rc.circle in --accent ink at the §9 secondary weights (2 / 0.7 / 0.3).
      // Hover ring is solid; the search highlight is a static dashed ring
      // (no CSS animation -- animate-pulse retired).
      if (isHovered) {
        group.appendChild(
          rc.circle(point.cx, point.cy, (markRadius + 5) * 2, {
            stroke: accentColor,
            strokeWidth: 2,
            roughness: 0.7,
            bowing: 0.3,
            seed: ROUGH_SEED,
          }),
        )
      }
      if (isHighlighted) {
        group.appendChild(
          rc.circle(point.cx, point.cy, (markRadius + 9) * 2, {
            stroke: accentColor,
            strokeWidth: 2,
            strokeLineDash: [6, 4],
            roughness: 0.7,
            bowing: 0.3,
            seed: ROUGH_SEED,
          }),
        )
      }
    }
  }, [chartGeometry, showLogos, hoveredPoint, highlightedTeamId])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Redraw on theme change
  useChartTheme(drawChart)

  const handleClick = (point: DataPoint) => {
    router.push(`/teams/${teamNameToSlug(point.name)}`)
  }

  const tooltipRows: ChartTooltipRow[] = hoveredPoint
    ? [
        { label: `${xLabel}:`, value: hoveredPoint.x.toFixed(3) },
        { label: `${yLabel}:`, value: hoveredPoint.y.toFixed(3) },
        { label: hoveredPoint.conference || 'Independent', muted: true },
        { label: 'Click the point to view the team →', muted: true },
      ]
    : []

  return (
    <ChartFrame
      ariaLabel={`Scatter plot of ${xLabel} vs ${yLabel} for all FBS teams`}
      empty={!chartGeometry}
      emptyState={{
        icon: ChartScatter,
        title: 'No teams to plot',
        description: 'Nothing matches this metric and filter combination — try another plot or clear the conference filter.',
      }}
    >
      {a11y => {
        const { points, xTicks, yTicks, meanX, meanY } = chartGeometry!

        return (
          <>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="w-full h-auto"
              {...a11y}
              onMouseLeave={() => setHoveredPoint(null)}
            >
              {/* Static scaffold: grid + axis tick labels (token inks) */}
              {gridLinesY(yTicks, LAYOUT)}
              {axisLabelsY(yTicks, val => val.toFixed(2), LAYOUT)}
              {xTicks.map(({ x }) => (
                <line
                  key={`grid-x-${x}`}
                  x1={x}
                  y1={PADDING.top}
                  x2={x}
                  y2={PADDING.top + PLOT_HEIGHT}
                  stroke="var(--border)"
                  strokeWidth={1}
                  opacity={0.4}
                />
              ))}
              {/* X tick labels sit just under the plot (not axisLabelsX's
                  bottom-gutter edge) so the axis title keeps the gutter. */}
              {xTicks.map(({ x, val }) => (
                <text
                  key={`label-x-${x}`}
                  x={x}
                  y={PADDING.top + PLOT_HEIGHT + 18}
                  textAnchor="middle"
                  className="fill-[var(--text-muted)] text-xs"
                >
                  {val.toFixed(2)}
                </text>
              ))}

              {/* Quadrant mean rules (scaffold reference lines, token ink) */}
              <line
                x1={meanX}
                y1={PADDING.top}
                x2={meanX}
                y2={PADDING.top + PLOT_HEIGHT}
                stroke="var(--text-muted)"
                strokeWidth={1.5}
                strokeDasharray="8 4"
                opacity={0.5}
              />
              <line
                x1={PADDING.left}
                y1={meanY}
                x2={WIDTH - PADDING.right}
                y2={meanY}
                stroke="var(--text-muted)"
                strokeWidth={1.5}
                strokeDasharray="8 4"
                opacity={0.5}
              />

              {/* Quadrant labels */}
              {quadrantLabels && (
                <>
                  <text
                    x={PADDING.left + 12}
                    y={PADDING.top + 16}
                    className="fill-[var(--text-muted)]"
                    fontSize={10}
                    fontWeight={500}
                    opacity={0.7}
                  >
                    {quadrantLabels.topLeft}
                  </text>
                  <text
                    x={WIDTH - PADDING.right - 12}
                    y={PADDING.top + 16}
                    className="fill-[var(--text-muted)]"
                    fontSize={10}
                    fontWeight={500}
                    textAnchor="end"
                    opacity={0.7}
                  >
                    {quadrantLabels.topRight}
                  </text>
                  <text
                    x={PADDING.left + 12}
                    y={PADDING.top + PLOT_HEIGHT - 10}
                    className="fill-[var(--text-muted)]"
                    fontSize={10}
                    fontWeight={500}
                    opacity={0.7}
                  >
                    {quadrantLabels.bottomLeft}
                  </text>
                  <text
                    x={WIDTH - PADDING.right - 12}
                    y={PADDING.top + PLOT_HEIGHT - 10}
                    className="fill-[var(--text-muted)]"
                    fontSize={10}
                    fontWeight={500}
                    textAnchor="end"
                    opacity={0.7}
                  >
                    {quadrantLabels.bottomRight}
                  </text>
                </>
              )}

              {/* Axis titles */}
              <text
                x={PADDING.left + PLOT_WIDTH / 2}
                y={HEIGHT - 10}
                textAnchor="middle"
                className="fill-[var(--text-secondary)]"
                fontSize={13}
                fontWeight={500}
              >
                {xLabel}
              </text>
              <text
                x={16}
                y={PADDING.top + PLOT_HEIGHT / 2}
                textAnchor="middle"
                className="fill-[var(--text-secondary)]"
                fontSize={13}
                fontWeight={500}
                transform={`rotate(-90, 16, ${PADDING.top + PLOT_HEIGHT / 2})`}
              >
                {yLabel}
              </text>

              {/* Team logos: native raster marks (spec §7 exemption) -- no
                  glow filters, no clip paths, never roughified. */}
              {showLogos &&
                points.map(point =>
                  point.logo ? (
                    <image
                      key={`logo-${point.id}`}
                      href={point.logo}
                      x={point.cx - LOGO_RADIUS}
                      y={point.cy - LOGO_RADIUS}
                      width={LOGO_RADIUS * 2}
                      height={LOGO_RADIUS * 2}
                      preserveAspectRatio="xMidYMid meet"
                      opacity={
                        highlightedTeamId !== null &&
                        highlightedTeamId !== point.id &&
                        hoveredPoint?.id !== point.id
                          ? 0.3
                          : 1
                      }
                      style={{ pointerEvents: 'none' }}
                    />
                  ) : null,
                )}

              {/* Rough-drawn marks: fallback dots + accent selection rings */}
              <g ref={roughGroupRef} data-testid="rough-layer" />

              {/* Interaction layer: transparent hit targets (spec §1.5) */}
              {points.map(point => (
                <circle
                  key={`hit-${point.id}`}
                  cx={point.cx}
                  cy={point.cy}
                  r={LOGO_RADIUS + 4}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredPoint(point)}
                  onClick={() => handleClick(point)}
                />
              ))}
            </svg>

            <ChartTooltip
              header={hoveredPoint?.name}
              headerAdornment={
                hoveredPoint?.logo ? (
                  <Image
                    src={hoveredPoint.logo}
                    alt=""
                    width={20}
                    height={20}
                    className="w-5 h-5 object-contain"
                    unoptimized
                  />
                ) : undefined
              }
              rows={tooltipRows}
              prompt="Hover a team for details"
              minRows={4}
            />
          </>
        )
      }}
    </ChartFrame>
  )
}
