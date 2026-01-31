'use client'

import { useState, useRef, useMemo } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { TeamSeasonTrajectory, TrajectoryAverages } from '@/lib/types/database'

interface TrajectoryChartProps {
  trajectory: TeamSeasonTrajectory[]
  averages: TrajectoryAverages[] | null
  conference: string
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
    getConfValue: () => null, // No average for delta
    getFbsValue: () => null,
    format: v => (v >= 0 ? '+' : '') + v.toFixed(3),
  },
]

// Generate smooth curve path using cubic bezier
function generateSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
  }

  let path = `M ${points[0].x} ${points[0].y}`

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]

    const tension = 0.3
    const cp1x = p1.x + (p2.x - p0.x) * tension
    const cp1y = p1.y + (p2.y - p0.y) * tension
    const cp2x = p2.x - (p3.x - p1.x) * tension
    const cp2y = p2.y - (p3.y - p1.y) * tension

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }

  return path
}

export function TrajectoryChart({ trajectory, averages, conference }: TrajectoryChartProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('wins')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [hoveredSeason, setHoveredSeason] = useState<number | null>(null)
  const [visibleLines, setVisibleLines] = useState({ team: true, conf: true, fbs: true })
  const chartRef = useRef<SVGSVGElement>(null)

  const metric = METRICS.find(m => m.key === selectedMetric)!

  // Process team data
  const teamData = useMemo(() => {
    return trajectory
      .map(t => ({ season: t.season, value: metric.getValue(t) }))
      .filter((d): d is { season: number; value: number } => d.value !== null)
      .sort((a, b) => a.season - b.season)
  }, [trajectory, metric])

  // Process conference averages
  const confData = useMemo(() => {
    if (!averages) return []
    return averages
      .map(a => ({ season: a.season, value: metric.getConfValue(a) }))
      .filter((d): d is { season: number; value: number } => d.value !== null)
      .sort((a, b) => a.season - b.season)
  }, [averages, metric])

  // Process FBS averages
  const fbsData = useMemo(() => {
    if (!averages) return []
    return averages
      .map(a => ({ season: a.season, value: metric.getFbsValue(a) }))
      .filter((d): d is { season: number; value: number } => d.value !== null)
      .sort((a, b) => a.season - b.season)
  }, [averages, metric])

  if (teamData.length === 0) {
    return (
      <div className="card p-6">
        <p className="text-[var(--text-muted)] text-center py-8">
          Historical data not available for this team.
        </p>
      </div>
    )
  }

  // Chart dimensions
  const padding = { top: 30, right: 30, bottom: 50, left: 60 }
  const width = 700
  const height = 350
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  // Calculate value range across all visible datasets
  const allValues = [
    ...(visibleLines.team ? teamData.map(d => d.value) : []),
    ...(visibleLines.conf ? confData.map(d => d.value) : []),
    ...(visibleLines.fbs ? fbsData.map(d => d.value) : []),
  ]
  const minVal = Math.min(...allValues)
  const maxVal = Math.max(...allValues)
  const valueRange = maxVal - minVal || 1
  const valuePadding = valueRange * 0.1

  // Scale functions
  const seasons = teamData.map(d => d.season)
  const getX = (season: number) => {
    const idx = seasons.indexOf(season)
    return padding.left + (idx / (seasons.length - 1 || 1)) * chartWidth
  }
  const getY = (val: number) => {
    const normalized = (val - (minVal - valuePadding)) / (valueRange + valuePadding * 2)
    return metric.invert
      ? padding.top + normalized * chartHeight
      : padding.top + (1 - normalized) * chartHeight
  }

  // Generate paths
  const teamPoints = teamData.map(d => ({ x: getX(d.season), y: getY(d.value) }))
  const confPoints = confData.filter(d => seasons.includes(d.season)).map(d => ({ x: getX(d.season), y: getY(d.value) }))
  const fbsPoints = fbsData.filter(d => seasons.includes(d.season)).map(d => ({ x: getX(d.season), y: getY(d.value) }))

  const teamPath = generateSmoothPath(teamPoints)
  const confPath = generateSmoothPath(confPoints)
  const fbsPath = generateSmoothPath(fbsPoints)

  // Gradient area path (team line to bottom)
  const gradientPath = teamPath
    ? `${teamPath} L ${teamPoints[teamPoints.length - 1]?.x} ${padding.top + chartHeight} L ${teamPoints[0]?.x} ${padding.top + chartHeight} Z`
    : ''

  // Y-axis tick values
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const val = metric.invert
      ? minVal - valuePadding + pct * (valueRange + valuePadding * 2)
      : maxVal + valuePadding - pct * (valueRange + valuePadding * 2)
    return { pct, val }
  })

  // Get values for hovered season
  const getHoverData = (season: number) => {
    const teamVal = teamData.find(d => d.season === season)?.value
    const confVal = confData.find(d => d.season === season)?.value
    const fbsVal = fbsData.find(d => d.season === season)?.value
    return { teamVal, confVal, fbsVal }
  }

  const toggleLine = (line: 'team' | 'conf' | 'fbs') => {
    setVisibleLines(prev => ({ ...prev, [line]: !prev[line] }))
  }

  return (
    <div className="card p-6">
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

      {/* Metric Definition */}
      <p className="text-xs text-[var(--text-muted)] mb-4">{metric.definition}</p>

      {/* Chart */}
      <svg
        ref={chartRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        onMouseLeave={() => setHoveredSeason(null)}
      >
        <defs>
          {/* Gradient for team line fill */}
          <linearGradient id="teamGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-run)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--color-run)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {yTicks.map(({ pct }) => (
          <line
            key={pct}
            x1={padding.left}
            y1={padding.top + pct * chartHeight}
            x2={width - padding.right}
            y2={padding.top + pct * chartHeight}
            stroke="var(--border)"
            strokeWidth={1}
            opacity={0.4}
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map(({ pct, val }) => (
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
        ))}

        {/* X-axis labels (seasons) */}
        {seasons.map((season) => (
          <text
            key={season}
            x={getX(season)}
            y={height - 15}
            textAnchor="middle"
            className="fill-[var(--text-muted)] text-xs"
          >
            {season}
          </text>
        ))}

        {/* Gradient fill under team line */}
        {visibleLines.team && gradientPath && (
          <path
            d={gradientPath}
            fill="url(#teamGradient)"
          />
        )}

        {/* FBS average line (dotted, lightest) */}
        {visibleLines.fbs && fbsPath && (
          <path
            d={fbsPath}
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            opacity={0.5}
          />
        )}

        {/* Conference average line (dashed) */}
        {visibleLines.conf && confPath && (
          <path
            d={confPath}
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth={2}
            strokeDasharray="6 4"
            opacity={0.7}
          />
        )}

        {/* Team line (solid, primary) */}
        {visibleLines.team && teamPath && (
          <path
            d={teamPath}
            fill="none"
            stroke="var(--color-run)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Interactive hover areas */}
        {seasons.map((season) => (
          <rect
            key={season}
            x={getX(season) - chartWidth / seasons.length / 2}
            y={padding.top}
            width={chartWidth / seasons.length}
            height={chartHeight}
            fill="transparent"
            onMouseEnter={() => setHoveredSeason(season)}
          />
        ))}

        {/* Hover crosshair */}
        {hoveredSeason && (
          <line
            x1={getX(hoveredSeason)}
            y1={padding.top}
            x2={getX(hoveredSeason)}
            y2={padding.top + chartHeight}
            stroke="var(--text-muted)"
            strokeWidth={1}
            strokeDasharray="4 2"
            opacity={0.6}
          />
        )}

        {/* Data points - Team */}
        {visibleLines.team && teamData.map((d) => (
          <circle
            key={`team-${d.season}`}
            cx={getX(d.season)}
            cy={getY(d.value)}
            r={hoveredSeason === d.season ? 7 : 5}
            fill={hoveredSeason === d.season ? 'var(--color-run)' : 'var(--bg-surface)'}
            stroke="var(--color-run)"
            strokeWidth={2}
            className="transition-all duration-150"
          />
        ))}

        {/* Data points - Conference */}
        {visibleLines.conf && confData.filter(d => seasons.includes(d.season)).map((d) => (
          <circle
            key={`conf-${d.season}`}
            cx={getX(d.season)}
            cy={getY(d.value)}
            r={hoveredSeason === d.season ? 5 : 3}
            fill={hoveredSeason === d.season ? 'var(--text-muted)' : 'var(--bg-surface)'}
            stroke="var(--text-muted)"
            strokeWidth={1.5}
            opacity={0.7}
            className="transition-all duration-150"
          />
        ))}

        {/* Data points - FBS */}
        {visibleLines.fbs && fbsData.filter(d => seasons.includes(d.season)).map((d) => (
          <circle
            key={`fbs-${d.season}`}
            cx={getX(d.season)}
            cy={getY(d.value)}
            r={hoveredSeason === d.season ? 4 : 2.5}
            fill={hoveredSeason === d.season ? 'var(--text-muted)' : 'var(--bg-surface)'}
            stroke="var(--text-muted)"
            strokeWidth={1}
            opacity={0.5}
            className="transition-all duration-150"
          />
        ))}
      </svg>

      {/* Tooltip */}
      {hoveredSeason && (
        <div className="mt-2 p-3 bg-[var(--bg-surface-alt)] border border-[var(--border)] rounded text-sm">
          <p className="font-headline text-base text-[var(--text-primary)] mb-2">{hoveredSeason}</p>
          {(() => {
            const { teamVal, confVal, fbsVal } = getHoverData(hoveredSeason)
            return (
              <div className="space-y-1">
                {visibleLines.team && teamVal !== undefined && (
                  <p className="flex items-center gap-2">
                    <span className="w-3 h-0.5 bg-[var(--color-run)]" />
                    <span className="text-[var(--text-secondary)]">Team:</span>
                    <span className="text-[var(--text-primary)] font-medium">{metric.format(teamVal)}</span>
                  </p>
                )}
                {visibleLines.conf && confVal !== undefined && (
                  <p className="flex items-center gap-2">
                    <span className="w-3 h-0.5 bg-[var(--text-muted)] opacity-70" style={{ backgroundImage: 'repeating-linear-gradient(90deg, var(--text-muted) 0, var(--text-muted) 4px, transparent 4px, transparent 6px)' }} />
                    <span className="text-[var(--text-secondary)]">{conference} avg:</span>
                    <span className="text-[var(--text-primary)]">{metric.format(confVal)}</span>
                  </p>
                )}
                {visibleLines.fbs && fbsVal !== undefined && (
                  <p className="flex items-center gap-2">
                    <span className="w-3 h-0.5 opacity-50" style={{ backgroundImage: 'repeating-linear-gradient(90deg, var(--text-muted) 0, var(--text-muted) 2px, transparent 2px, transparent 4px)' }} />
                    <span className="text-[var(--text-secondary)]">FBS avg:</span>
                    <span className="text-[var(--text-primary)]">{metric.format(fbsVal)}</span>
                  </p>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 pt-3 border-t border-[var(--border)]">
        <button
          onClick={() => toggleLine('team')}
          className={`flex items-center gap-2 text-xs transition-opacity ${visibleLines.team ? '' : 'opacity-40'}`}
        >
          <span className="w-4 h-0.5 bg-[var(--color-run)]" />
          <span className="text-[var(--text-secondary)]">Team</span>
        </button>
        <button
          onClick={() => toggleLine('conf')}
          className={`flex items-center gap-2 text-xs transition-opacity ${visibleLines.conf ? '' : 'opacity-40'}`}
        >
          <span className="w-4 h-0.5 bg-[var(--text-muted)]" style={{ backgroundImage: 'repeating-linear-gradient(90deg, var(--text-muted) 0, var(--text-muted) 4px, transparent 4px, transparent 6px)' }} />
          <span className="text-[var(--text-secondary)]">{conference} avg</span>
        </button>
        <button
          onClick={() => toggleLine('fbs')}
          className={`flex items-center gap-2 text-xs transition-opacity ${visibleLines.fbs ? '' : 'opacity-40'}`}
        >
          <span className="w-4 h-0.5 opacity-50" style={{ backgroundImage: 'repeating-linear-gradient(90deg, var(--text-muted) 0, var(--text-muted) 2px, transparent 2px, transparent 4px)' }} />
          <span className="text-[var(--text-secondary)]">FBS avg</span>
        </button>
      </div>
    </div>
  )
}
