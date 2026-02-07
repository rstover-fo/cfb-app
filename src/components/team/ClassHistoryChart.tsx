'use client'

import { useRef, useCallback, useEffect, useMemo, useState } from 'react'
import rough from 'roughjs'
import { RecruitingClassHistory } from '@/lib/types/database'

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

function resolveColor(cssVar: string): string {
  if (typeof document === 'undefined') return '#999'
  const match = cssVar.match(/var\((.+)\)/)
  if (!match) return cssVar
  return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || '#999'
}

const STAR_KEYS = ['two_stars', 'three_stars', 'four_stars', 'five_stars'] as const
const STAR_LABELS = ['2-star', '3-star', '4-star', '5-star']

export function ClassHistoryChart({ data, currentSeason, teamColor }: ClassHistoryChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; item: RecruitingClassHistory } | null>(null)

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
    return PADDING.left + (i / (sorted.length - 1)) * CHART_W
  }, [sorted.length])

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
    const baseColor = teamColor || resolveColor('var(--color-run)')
    const mutedColor = resolveColor('var(--text-muted)')
    const borderColor = resolveColor('var(--border)')

    // Opacity levels for star tiers (2-star lightest → 5-star darkest)
    const opacities = [0.25, 0.45, 0.7, 1.0]

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
          stroke: isCurrent ? resolveColor('var(--text-primary)') : borderColor,
          strokeWidth: isCurrent ? 2 : 1,
          roughness: 0.8,
        })
        rect.style.opacity = String(opacities[si])
        group.appendChild(rect)

        currentY = y
      })
    })

    // Draw rank line
    if (sorted.length >= 2) {
      const points: [number, number][] = sorted.map((d, i) => [getX(i), getRankY(d.rank)])
      const line = rc.linearPath(points, {
        stroke: resolveColor('var(--color-negative)'),
        strokeWidth: 2.5,
        roughness: 0.6,
        bowing: 0.3,
      })
      group.appendChild(line)

      // Rank dots
      points.forEach(([x, y]) => {
        const dot = rc.circle(x, y, 6, {
          fill: resolveColor('var(--color-negative)'),
          fillStyle: 'solid',
          stroke: 'none',
          roughness: 0.3,
        })
        group.appendChild(dot)
      })
    }

    // X-axis labels (show every year or every other if dense)
    const step = sorted.length > 15 ? 2 : 1
    sorted.forEach((d, i) => {
      if (i % step !== 0 && i !== sorted.length - 1) return
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      text.setAttribute('x', String(getX(i)))
      text.setAttribute('y', String(PADDING.top + CHART_H + 20))
      text.setAttribute('text-anchor', 'middle')
      text.setAttribute('fill', mutedColor)
      text.setAttribute('font-size', '11')
      text.setAttribute('font-family', 'var(--font-body)')
      text.textContent = `'${String(d.year).slice(-2)}`
      group.appendChild(text)
    })

    // Left Y-axis label (commits)
    const leftLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    leftLabel.setAttribute('x', String(PADDING.left - 40))
    leftLabel.setAttribute('y', String(PADDING.top + CHART_H / 2))
    leftLabel.setAttribute('text-anchor', 'middle')
    leftLabel.setAttribute('fill', mutedColor)
    leftLabel.setAttribute('font-size', '11')
    leftLabel.setAttribute('transform', `rotate(-90, ${PADDING.left - 40}, ${PADDING.top + CHART_H / 2})`)
    leftLabel.textContent = 'Signees'
    group.appendChild(leftLabel)

    // Right Y-axis label (rank)
    const rightLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    rightLabel.setAttribute('x', String(WIDTH - PADDING.right + 40))
    rightLabel.setAttribute('y', String(PADDING.top + CHART_H / 2))
    rightLabel.setAttribute('text-anchor', 'middle')
    rightLabel.setAttribute('fill', resolveColor('var(--color-negative)'))
    rightLabel.setAttribute('font-size', '11')
    rightLabel.setAttribute('transform', `rotate(90, ${WIDTH - PADDING.right + 40}, ${PADDING.top + CHART_H / 2})`)
    rightLabel.textContent = 'Class Rank'
    group.appendChild(rightLabel)

    // Right Y-axis ticks (rank)
    const rankTicks = [1, Math.round(maxRank / 2), maxRank]
    rankTicks.forEach(rank => {
      const y = getRankY(rank)
      const tick = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      tick.setAttribute('x', String(WIDTH - PADDING.right + 10))
      tick.setAttribute('y', String(y + 4))
      tick.setAttribute('fill', resolveColor('var(--color-negative)'))
      tick.setAttribute('font-size', '10')
      tick.textContent = `#${rank}`
      group.appendChild(tick)
    })
  }, [sorted, currentSeason, teamColor, barWidth, getX, getRankY, maxCommits, maxRank])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Redraw on theme change
  useEffect(() => {
    const observer = new MutationObserver(() => drawChart())
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
    return () => observer.disconnect()
  }, [drawChart])

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg || sorted.length === 0) return

    const rect = svg.getBoundingClientRect()
    const scaleX = WIDTH / rect.width
    const mx = (e.clientX - rect.left) * scaleX

    // Find closest bar
    let closest = 0
    let minDist = Infinity
    sorted.forEach((_, i) => {
      const dist = Math.abs(mx - getX(i))
      if (dist < minDist) {
        minDist = dist
        closest = i
      }
    })

    if (minDist < barWidth * 1.5) {
      setTooltip({ x: getX(closest), y: PADDING.top, item: sorted[closest] })
    } else {
      setTooltip(null)
    }
  }

  return (
    <section>
      <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Recruiting Class History</h2>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-xs text-[var(--text-muted)]">
        {STAR_LABELS.map((label, i) => (
          <span key={label} className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{
                backgroundColor: teamColor || 'var(--color-run)',
                opacity: [0.25, 0.45, 0.7, 1.0][i],
              }}
            />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-0.5 rounded" style={{ backgroundColor: 'var(--color-negative)' }} />
          Class Rank
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <g ref={roughGroupRef} />

        {/* Tooltip */}
        {tooltip && (
          <g>
            <rect
              x={tooltip.x > WIDTH / 2 ? tooltip.x - 155 : tooltip.x + 10}
              y={tooltip.y}
              width={145}
              height={90}
              rx={4}
              fill={resolveColor('var(--bg-surface)')}
              stroke={resolveColor('var(--border)')}
              strokeWidth={1}
            />
            <text
              x={tooltip.x > WIDTH / 2 ? tooltip.x - 148 : tooltip.x + 17}
              y={tooltip.y + 18}
              fill={resolveColor('var(--text-primary)')}
              fontSize="13"
              fontWeight="600"
            >
              {tooltip.item.year} — Rank #{tooltip.item.rank}
            </text>
            <text
              x={tooltip.x > WIDTH / 2 ? tooltip.x - 148 : tooltip.x + 17}
              y={tooltip.y + 36}
              fill={resolveColor('var(--text-secondary)')}
              fontSize="11"
            >
              {tooltip.item.total_commits} commits · {Number(tooltip.item.points).toFixed(1)} pts
            </text>
            <text
              x={tooltip.x > WIDTH / 2 ? tooltip.x - 148 : tooltip.x + 17}
              y={tooltip.y + 52}
              fill={resolveColor('var(--text-muted)')}
              fontSize="10"
            >
              {tooltip.item.five_stars}★5 · {tooltip.item.four_stars}★4 · {tooltip.item.three_stars}★3 · {tooltip.item.two_stars}★2
            </text>
          </g>
        )}
      </svg>
    </section>
  )
}
