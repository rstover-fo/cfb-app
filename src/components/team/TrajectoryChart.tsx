'use client'

import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { CaretDown, ChartLine } from '@phosphor-icons/react'
import rough from 'roughjs'
import { TeamSeasonTrajectory, TrajectoryAverages } from '@/lib/types/database'
import { CHART_INK, resolveColor, useChartTheme } from '@/lib/charts/theme'
import { inkFor } from '@/lib/charts/series'
import { ChartFrame } from '@/lib/charts/ChartFrame'
import { ChartTooltip } from '@/lib/charts/ChartTooltip'
import type { ChartTooltipRow } from '@/lib/charts/ChartTooltip'
import { ChartLegend } from '@/lib/charts/ChartLegend'
import type { ChartLegendItem } from '@/lib/charts/ChartLegend'
import { gridLinesY, axisLabelsY, axisLabelsX } from '@/lib/charts/axes'
import type { ChartLayout } from '@/lib/charts/axes'

interface TrajectoryChartProps {
  trajectory: TeamSeasonTrajectory[]
  averages: TrajectoryAverages[] | null
  conference: string
  /** Team display name, used to build a meaningful chart aria-label. */
  teamName?: string
}

type MetricKey = 'wins' | 'win_pct' | 'epa' | 'success' | 'off_rank' | 'def_rank' | 'recruiting' | 'epa_delta'

interface MetricConfig {
  key: MetricKey
  label: string
  definition: string
  getValue: (t: TeamSeasonTrajectory) => number | null
  getConfValue: (a: TrajectoryAverages) => number | null
  getFbsValue: (a: TrajectoryAverages) => number | null
  format: (v: number) => string
  invert?: boolean
}

const METRICS: MetricConfig[] = [
  {
    key: 'wins',
    label: 'Wins',
    definition: 'Total wins for the season',
    getValue: t => t.wins,
    getConfValue: a => a.conf_wins,
    getFbsValue: a => a.fbs_wins,
    format: v => v.toFixed(1),
  },
  {
    key: 'win_pct',
    label: 'Win %',
    definition: 'Percentage of games won',
    getValue: t => t.win_pct ? t.win_pct * 100 : null,
    getConfValue: a => a.conf_win_pct ? a.conf_win_pct * 100 : null,
    getFbsValue: a => a.fbs_win_pct ? a.fbs_win_pct * 100 : null,
    format: v => `${v.toFixed(0)}%`,
  },
  {
    key: 'epa',
    label: 'EPA/Play',
    definition: 'Expected points added per play — measures offensive efficiency',
    getValue: t => t.epa_per_play,
    getConfValue: a => a.conf_epa_per_play,
    getFbsValue: a => a.fbs_epa_per_play,
    format: v => v.toFixed(3),
  },
  {
    key: 'success',
    label: 'Success Rate',
    definition: 'Percentage of plays with positive EPA',
    getValue: t => t.success_rate ? t.success_rate * 100 : null,
    getConfValue: a => a.conf_success_rate ? a.conf_success_rate * 100 : null,
    getFbsValue: a => a.fbs_success_rate ? a.fbs_success_rate * 100 : null,
    format: v => `${v.toFixed(1)}%`,
  },
  {
    key: 'off_rank',
    label: 'Off EPA Rank',
    definition: 'Offensive efficiency ranking among FBS teams (lower is better)',
    getValue: t => t.off_epa_rank,
    getConfValue: a => a.conf_off_epa_rank,
    getFbsValue: a => a.fbs_off_epa_rank,
    format: v => `#${Math.round(v)}`,
    invert: true,
  },
  {
    key: 'def_rank',
    label: 'Def EPA Rank',
    definition: 'Defensive efficiency ranking among FBS teams (lower is better)',
    getValue: t => t.def_epa_rank,
    getConfValue: a => a.conf_def_epa_rank,
    getFbsValue: a => a.fbs_def_epa_rank,
    format: v => `#${Math.round(v)}`,
    invert: true,
  },
  {
    key: 'recruiting',
    label: 'Recruiting',
    definition: '247Sports composite recruiting class rank (lower is better)',
    getValue: t => t.recruiting_rank,
    getConfValue: a => a.conf_recruiting_rank,
    getFbsValue: a => a.fbs_recruiting_rank,
    format: v => `#${Math.round(v)}`,
    invert: true,
  },
  {
    key: 'epa_delta',
    label: 'EPA Δ',
    definition: 'Year-over-year change in EPA/play',
    getValue: t => t.epa_delta,
    getConfValue: () => null,
    getFbsValue: () => null,
    format: v => (v >= 0 ? '+' : '') + v.toFixed(3),
  },
]

const WIDTH = 700
const HEIGHT = 350
const PADDING = { top: 30, right: 30, bottom: 50, left: 60 }
const CHART_WIDTH = WIDTH - PADDING.left - PADDING.right
const CHART_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom
const LAYOUT: ChartLayout = { width: WIDTH, height: HEIGHT, padding: PADDING }

/** Stable wobble (spec §9): identical strokes across re-renders and theme flips. */
const ROUGH_SEED = 24

type LineKey = 'team' | 'conf' | 'fbs'

export function TrajectoryChart({ trajectory, averages, conference, teamName }: TrajectoryChartProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('wins')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [hoveredSeason, setHoveredSeason] = useState<number | null>(null)
  const [visibleLines, setVisibleLines] = useState({ team: true, conf: true, fbs: true })
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)

  const metric = METRICS.find(m => m.key === selectedMetric)!

  const teamData = useMemo(() => {
    return trajectory
      .map(t => ({ season: t.season, value: metric.getValue(t) }))
      .filter((d): d is { season: number; value: number } => d.value !== null)
      .sort((a, b) => a.season - b.season)
  }, [trajectory, metric])

  const confData = useMemo(() => {
    if (!averages) return []
    return averages
      .map(a => ({ season: a.season, value: metric.getConfValue(a) }))
      .filter((d): d is { season: number; value: number } => d.value !== null)
      .sort((a, b) => a.season - b.season)
  }, [averages, metric])

  const fbsData = useMemo(() => {
    if (!averages) return []
    return averages
      .map(a => ({ season: a.season, value: metric.getFbsValue(a) }))
      .filter((d): d is { season: number; value: number } => d.value !== null)
      .sort((a, b) => a.season - b.season)
  }, [averages, metric])

  // Chart geometry: scales, points, ticks
  const chartGeometry = useMemo(() => {
    if (teamData.length === 0) return null

    const allValues = [
      ...(visibleLines.team ? teamData.map(d => d.value) : []),
      ...(visibleLines.conf ? confData.map(d => d.value) : []),
      ...(visibleLines.fbs ? fbsData.map(d => d.value) : []),
    ]
    const scaleValues = allValues.length > 0 ? allValues : teamData.map(d => d.value)

    const minVal = Math.min(...scaleValues)
    const maxVal = Math.max(...scaleValues)
    const valueRange = maxVal - minVal || 1
    const valuePadding = valueRange * 0.1

    const seasons = teamData.map(d => d.season)

    const getX = (season: number) => {
      const idx = seasons.indexOf(season)
      return PADDING.left + (idx / (seasons.length - 1 || 1)) * CHART_WIDTH
    }
    const getY = (val: number) => {
      const normalized = (val - (minVal - valuePadding)) / (valueRange + valuePadding * 2)
      return metric.invert
        ? PADDING.top + normalized * CHART_HEIGHT
        : PADDING.top + (1 - normalized) * CHART_HEIGHT
    }

    const teamPoints = teamData.map(d => ({
      x: getX(d.season), y: getY(d.value), season: d.season, value: d.value,
    }))
    const confPoints = confData
      .filter(d => seasons.includes(d.season))
      .map(d => ({ x: getX(d.season), y: getY(d.value) }))
    const fbsPoints = fbsData
      .filter(d => seasons.includes(d.season))
      .map(d => ({ x: getX(d.season), y: getY(d.value) }))

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => {
      const val = metric.invert
        ? minVal - valuePadding + pct * (valueRange + valuePadding * 2)
        : maxVal + valuePadding - pct * (valueRange + valuePadding * 2)
      return { pct, val }
    })

    return { seasons, getX, teamPoints, confPoints, fbsPoints, yTicks }
  }, [teamData, confData, fbsData, visibleLines, metric])

  // Draw roughjs chart elements
  const drawChart = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group || !chartGeometry) return

    while (group.firstChild) group.removeChild(group.firstChild)

    const rc = rough.svg(svg)
    const runColor = inkFor('run')
    const mutedColor = resolveColor(CHART_INK.muted)
    const surfaceColor = resolveColor(CHART_INK.surface)

    const { teamPoints, confPoints, fbsPoints } = chartGeometry

    // Area fill under team line (solid @ 0.1 opacity, roughness 0 — spec §6)
    if (visibleLines.team && teamPoints.length >= 2) {
      const areaCoords: [number, number][] = [
        ...teamPoints.map(p => [p.x, p.y] as [number, number]),
        [teamPoints[teamPoints.length - 1].x, PADDING.top + CHART_HEIGHT],
        [teamPoints[0].x, PADDING.top + CHART_HEIGHT],
      ]
      const area = rc.polygon(areaCoords, {
        fill: runColor,
        fillStyle: 'solid',
        stroke: 'none',
        strokeWidth: 0,
        roughness: 0,
        seed: ROUGH_SEED,
      })
      area.style.opacity = '0.1'
      group.appendChild(area)
    }

    // FBS average line (tertiary/context weight)
    if (visibleLines.fbs && fbsPoints.length >= 2) {
      const line = rc.linearPath(
        fbsPoints.map(p => [p.x, p.y] as [number, number]),
        { stroke: mutedColor, strokeWidth: 1.5, roughness: 0.5, bowing: 0.2, seed: ROUGH_SEED },
      )
      line.style.opacity = '0.45'
      group.appendChild(line)
    }

    // Conference average line (secondary weight)
    if (visibleLines.conf && confPoints.length >= 2) {
      const line = rc.linearPath(
        confPoints.map(p => [p.x, p.y] as [number, number]),
        { stroke: mutedColor, strokeWidth: 2, roughness: 0.7, bowing: 0.3, seed: ROUGH_SEED },
      )
      line.style.opacity = '0.65'
      group.appendChild(line)
    }

    // Team line (primary weight)
    if (visibleLines.team && teamPoints.length >= 2) {
      const line = rc.linearPath(
        teamPoints.map(p => [p.x, p.y] as [number, number]),
        { stroke: runColor, strokeWidth: 3, roughness: 1.0, bowing: 0.4, seed: ROUGH_SEED },
      )
      group.appendChild(line)
    }

    // Data dots. Roughness 0.5 throughout (below the series hierarchy
    // defaults, spec §9): the default roughness distorts 5–10px circles
    // into scribbles.
    if (visibleLines.team) {
      for (const p of teamPoints) {
        group.appendChild(rc.circle(p.x, p.y, 10, {
          fill: surfaceColor, fillStyle: 'solid',
          stroke: runColor, strokeWidth: 2, roughness: 0.5, seed: ROUGH_SEED,
        }))
      }
    }

    if (visibleLines.conf) {
      for (const p of confPoints) {
        const dot = rc.circle(p.x, p.y, 6, {
          fill: surfaceColor, fillStyle: 'solid',
          stroke: mutedColor, strokeWidth: 1.5, roughness: 0.5, seed: ROUGH_SEED,
        })
        dot.style.opacity = '0.7'
        group.appendChild(dot)
      }
    }

    if (visibleLines.fbs) {
      for (const p of fbsPoints) {
        const dot = rc.circle(p.x, p.y, 5, {
          fill: surfaceColor, fillStyle: 'solid',
          stroke: mutedColor, strokeWidth: 1, roughness: 0.5, seed: ROUGH_SEED,
        })
        dot.style.opacity = '0.5'
        group.appendChild(dot)
      }
    }
  }, [chartGeometry, visibleLines])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Redraw on theme change
  useChartTheme(drawChart)

  const getHoverData = (season: number) => {
    const teamVal = teamData.find(d => d.season === season)?.value
    const confVal = confData.find(d => d.season === season)?.value
    const fbsVal = fbsData.find(d => d.season === season)?.value
    return { teamVal, confVal, fbsVal }
  }

  const toggleLine = (line: LineKey) => {
    setVisibleLines(prev => ({ ...prev, [line]: !prev[line] }))
  }

  const tooltipRows: ChartTooltipRow[] = []
  if (hoveredSeason !== null) {
    const { teamVal, confVal, fbsVal } = getHoverData(hoveredSeason)
    if (visibleLines.team && teamVal !== undefined) {
      tooltipRows.push({ swatch: 'solid', color: 'var(--color-run)', label: 'Team:', value: metric.format(teamVal) })
    }
    if (visibleLines.conf && confVal !== undefined) {
      tooltipRows.push({ swatch: 'dashed', color: 'var(--text-muted)', label: `${conference} avg:`, value: metric.format(confVal) })
    }
    if (visibleLines.fbs && fbsVal !== undefined) {
      tooltipRows.push({ swatch: 'dashed', color: 'var(--text-muted)', label: 'FBS avg:', value: metric.format(fbsVal) })
    }
  }

  const legendItems: ChartLegendItem[] = [
    { key: 'team', label: 'Team', swatch: 'solid', color: 'var(--color-run)' },
    { key: 'conf', label: `${conference} avg`, swatch: 'dashed', color: 'var(--text-muted)' },
    { key: 'fbs', label: 'FBS avg', swatch: 'dashed', color: 'var(--text-muted)' },
  ]

  const seasons = chartGeometry?.seasons ?? []

  return (
    <ChartFrame
      ariaLabel={`${metric.label} by season for ${teamName || 'this team'} from ${seasons[0]} to ${seasons[seasons.length - 1]}, compared to ${conference} and FBS averages`}
      empty={!chartGeometry}
      emptyState={{
        icon: ChartLine,
        title: 'No trajectory data for this team',
        description: "Historical data publishes after a team's first FBS season.",
      }}
    >
      {a11y => {
        const { getX, yTicks } = chartGeometry!
        const step = seasons.length > 16 ? 3 : seasons.length > 10 ? 2 : 1
        const xTicks = seasons
          .filter((_, i) => i % step === 0 || i === seasons.length - 1)
          .map(season => ({ x: getX(season), label: season }))

        return (
          <>
            {/* Metric Dropdown */}
            <div className="relative mb-2">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 px-3 py-2 border border-[var(--border)] rounded text-sm text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors"
              >
                {metric.label}
                <CaretDown size={14} weight="bold" className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute top-full left-0 mt-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded shadow-lg z-10 min-w-[200px]">
                  {METRICS.map(m => (
                    <button
                      key={m.key}
                      onClick={() => {
                        setSelectedMetric(m.key)
                        setDropdownOpen(false)
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-surface-alt)] transition-colors ${
                        selectedMetric === m.key ? 'text-[var(--color-run)] font-medium' : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-[var(--text-muted)] mb-3">{metric.definition}</p>

            {/* Chart */}
            <svg
              ref={svgRef}
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="w-full h-auto"
              {...a11y}
              onMouseLeave={() => setHoveredSeason(null)}
            >
              {/* Static scaffold: grid + axis labels */}
              {gridLinesY(yTicks, LAYOUT)}
              {axisLabelsY(yTicks, metric.format, LAYOUT)}
              {axisLabelsX(xTicks, LAYOUT)}

              {/* Rough-drawn chart elements */}
              <g ref={roughGroupRef} data-testid="rough-layer" />

              {/* Interactive hover areas */}
              {seasons.map(season => (
                <rect
                  key={season}
                  x={getX(season) - CHART_WIDTH / seasons.length / 2}
                  y={PADDING.top}
                  width={CHART_WIDTH / seasons.length}
                  height={CHART_HEIGHT}
                  fill="transparent"
                  onMouseEnter={() => setHoveredSeason(season)}
                />
              ))}

              {/* Hover crosshair */}
              {hoveredSeason && (
                <line
                  x1={getX(hoveredSeason)}
                  y1={PADDING.top}
                  x2={getX(hoveredSeason)}
                  y2={PADDING.top + CHART_HEIGHT}
                  stroke="var(--text-muted)"
                  strokeWidth={1}
                  strokeDasharray="4 2"
                  opacity={0.6}
                />
              )}
            </svg>

            <ChartTooltip
              header={hoveredSeason !== null ? String(hoveredSeason) : undefined}
              rows={tooltipRows}
              prompt="Hover a season for details"
              minRows={3}
            />

            <ChartLegend
              items={legendItems}
              interactive={{
                visible: visibleLines,
                onToggle: key => toggleLine(key as LineKey),
              }}
            />
          </>
        )
      }}
    </ChartFrame>
  )
}
