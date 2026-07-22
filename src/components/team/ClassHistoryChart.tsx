'use client'

import { useRef, useCallback, useEffect, useMemo, useState } from 'react'
import rough from 'roughjs'
import { ChartLine } from '@phosphor-icons/react'
import { RecruitingClassHistory } from '@/lib/types/database'
import { CHART_INK, resolveColor, useChartTheme } from '@/lib/charts/theme'
import { inkFor, teamInk } from '@/lib/charts/series'
import { ChartFrame } from '@/lib/charts/ChartFrame'
import { ChartTooltip } from '@/lib/charts/ChartTooltip'
import type { ChartTooltipRow } from '@/lib/charts/ChartTooltip'
import { ChartLegend } from '@/lib/charts/ChartLegend'
import type { ChartLegendItem } from '@/lib/charts/ChartLegend'
import { axisLabelsX } from '@/lib/charts/axes'
import type { ChartLayout, XTick } from '@/lib/charts/axes'

interface ClassHistoryChartProps {
  data: RecruitingClassHistory[]
  currentSeason: number
  teamColor: string | null
}

const WIDTH = 800
const HEIGHT = 360
const PADDING = { top: 30, right: 55, bottom: 50, left: 55 }
const CHART_W = WIDTH - PADDING.left - PADDING.right
const CHART_H = HEIGHT - PADDING.top - PADDING.bottom
const LAYOUT: ChartLayout = { width: WIDTH, height: HEIGHT, padding: PADDING }

const STAR_KEYS = ['two_stars', 'three_stars', 'four_stars', 'five_stars'] as const
const STAR_LABELS = ['2-star', '3-star', '4-star', '5-star']
// Opacity levels for star tiers (2-star lightest -> 5-star darkest), baked
// into the legend swatch color via color-mix rather than a wrapper opacity
// style -- ChartLegend's swatch only takes a `color`, and migrations may not
// fork/wrap the primitive with per-chart styling (spec §10).
const STAR_OPACITIES = [0.25, 0.45, 0.7, 1.0]

/** Stable wobble (spec §9): identical strokes across re-renders and theme flips. */
const ROUGH_SEED = 79

export function ClassHistoryChart({ data, currentSeason, teamColor }: ClassHistoryChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const sorted = useMemo(() => [...data].sort((a, b) => a.year - b.year), [data])

  const maxCommits = useMemo(() => Math.max(...sorted.map(d => d.total_commits), 1), [sorted])
  const maxRank = useMemo(() => Math.max(...sorted.map(d => d.rank), 1), [sorted])

  const barWidth = useMemo(() => {
    if (sorted.length <= 1) return 20
    const gap = CHART_W / sorted.length
    return Math.min(gap * 0.7, 28)
  }, [sorted])

  const getX = useCallback((i: number) => {
    if (sorted.length <= 1) return PADDING.left + CHART_W / 2
    // Inset the band by half a bar plus a hair: edge bars centered on the
    // plot bounds otherwise run the last bar under the right-gutter rank
    // tick labels (and the first bar past the left gutter).
    const inset = barWidth / 2 + 4
    return PADDING.left + inset + (i / (sorted.length - 1)) * (CHART_W - inset * 2)
  }, [sorted.length, barWidth])

  const getRankY = useCallback((rank: number) => {
    // Rank 1 at top, maxRank at bottom
    return PADDING.top + ((rank - 1) / (maxRank - 1 || 1)) * CHART_H
  }, [maxRank])

  const drawChart = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group || sorted.length === 0) return

    while (group.firstChild) group.removeChild(group.firstChild)

    const rc = rough.svg(svg)
    // Team brand color, rough-ops-only (spec §6); falls back to the "home"
    // ink (--text-primary) when the team has no configured color.
    const baseColor = teamInk(teamColor, 'primary')
    const primaryColor = resolveColor(CHART_INK.primary)
    const borderColor = resolveColor(CHART_INK.border)
    const rankColor = inkFor('negative')

    // Draw bars
    sorted.forEach((d, i) => {
      const cx = getX(i)
      const x0 = cx - barWidth / 2
      let currentY = PADDING.top + CHART_H

      const isCurrent = d.year === currentSeason

      STAR_KEYS.forEach((key, si) => {
        const count = d[key]
        if (count === 0) return
        const barH = (count / maxCommits) * CHART_H
        const y = currentY - barH

        const rect = rc.rectangle(x0, y, barWidth, barH, {
          fill: baseColor,
          fillStyle: 'solid',
          stroke: isCurrent ? primaryColor : borderColor,
          strokeWidth: isCurrent ? 2 : 1,
          roughness: 0.8,
          bowing: 0.3,
          seed: ROUGH_SEED,
        })
        rect.style.opacity = String(STAR_OPACITIES[si])
        group.appendChild(rect)

        currentY = y
      })
    })

    // Draw rank line
    if (sorted.length >= 2) {
      const points: [number, number][] = sorted.map((d, i) => [getX(i), getRankY(d.rank)])
      const line = rc.linearPath(points, {
        stroke: rankColor,
        strokeWidth: 2.5,
        roughness: 0.6,
        bowing: 0.3,
        seed: ROUGH_SEED,
      })
      group.appendChild(line)

      // Rank dots
      points.forEach(([x, y]) => {
        const dot = rc.circle(x, y, 6, {
          fill: rankColor,
          fillStyle: 'solid',
          stroke: 'none',
          roughness: 0.3,
          seed: ROUGH_SEED,
        })
        group.appendChild(dot)
      })
    }
  }, [sorted, currentSeason, teamColor, barWidth, getX, getRankY, maxCommits])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Redraw on theme change
  useChartTheme(drawChart)

  const hovered = hoveredIndex !== null ? sorted[hoveredIndex] : null

  const legendBase = teamColor || CHART_INK.primary
  const legendItems: ChartLegendItem[] = [
    ...STAR_KEYS.map((key, i) => ({
      key,
      label: STAR_LABELS[i],
      swatch: 'solid' as const,
      color: `color-mix(in srgb, ${legendBase} ${STAR_OPACITIES[i] * 100}%, transparent)`,
    })),
    { key: 'rank', label: 'Class Rank', swatch: 'solid' as const, color: 'var(--color-negative)' },
  ]

  const tooltipRows: ChartTooltipRow[] = hovered
    ? [
        { swatch: 'solid', color: teamColor || CHART_INK.primary, label: 'Commits:', value: String(hovered.total_commits) },
        { swatch: 'solid', color: 'var(--color-negative)', label: 'Class rank:', value: `#${hovered.rank}` },
        { label: 'Composite:', value: `${Number(hovered.points).toFixed(1)} pts`, muted: true },
        {
          label: 'By rating:',
          value: `${hovered.five_stars}★5 · ${hovered.four_stars}★4 · ${hovered.three_stars}★3 · ${hovered.two_stars}★2`,
          muted: true,
        },
      ]
    : []

  const step = sorted.length > 15 ? 2 : 1
  const xTicks: XTick[] = sorted
    .map((d, i) => ({ i, d }))
    .filter(({ i }) => i % step === 0 || i === sorted.length - 1)
    .map(({ i, d }) => ({ x: getX(i), label: `'${String(d.year).slice(-2)}` }))

  const rankTicks = Array.from(new Set([1, Math.round(maxRank / 2), maxRank]))

  return (
    <ChartFrame
      title="Recruiting Class History"
      ariaLabel={
        sorted.length > 0
          ? `Recruiting class history from ${sorted[0].year} to ${sorted[sorted.length - 1].year}: total commits by star rating and national class rank per year`
          : 'Recruiting class history'
      }
      empty={sorted.length === 0}
      emptyState={{
        icon: ChartLine,
        title: 'No recruiting class history for this team',
        description: "Class rankings publish once a team's first signing class is on the board.",
      }}
    >
      {a11y => (
        <>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="w-full h-auto"
            {...a11y}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {/* Static scaffold: axis titles, rank ticks, X labels */}
            <text
              x={PADDING.left - 40}
              y={PADDING.top + CHART_H / 2}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize={11}
              transform={`rotate(-90, ${PADDING.left - 40}, ${PADDING.top + CHART_H / 2})`}
            >
              Signees
            </text>
            <text
              x={WIDTH - PADDING.right + 40}
              y={PADDING.top + CHART_H / 2}
              textAnchor="middle"
              fill="var(--color-negative)"
              fontSize={11}
              transform={`rotate(90, ${WIDTH - PADDING.right + 40}, ${PADDING.top + CHART_H / 2})`}
            >
              Class Rank
            </text>
            {rankTicks.map(rank => (
              <text
                key={rank}
                x={WIDTH - PADDING.right + 10}
                y={getRankY(rank) + 4}
                fill="var(--color-negative)"
                fontSize={10}
              >
                #{rank}
              </text>
            ))}
            {axisLabelsX(xTicks, LAYOUT)}

            {/* Rough-drawn bars + rank line */}
            <g ref={roughGroupRef} data-testid="rough-layer" />

            {/* Interaction layer: one hit-rect per year */}
            {sorted.map((d, i) => (
              <rect
                key={d.year}
                x={getX(i) - CHART_W / sorted.length / 2}
                y={PADDING.top}
                width={CHART_W / sorted.length}
                height={CHART_H}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(i)}
              />
            ))}

            {/* Hover crosshair */}
            {hoveredIndex !== null && (
              <line
                x1={getX(hoveredIndex)}
                y1={PADDING.top}
                x2={getX(hoveredIndex)}
                y2={PADDING.top + CHART_H}
                stroke="var(--text-muted)"
                strokeWidth={1}
                strokeDasharray="4 2"
                opacity={0.6}
              />
            )}
          </svg>

          <ChartTooltip
            header={hovered ? String(hovered.year) : undefined}
            rows={tooltipRows}
            prompt="Hover a year for details"
            minRows={4}
          />

          <ChartLegend items={legendItems} />
        </>
      )}
    </ChartFrame>
  )
}
