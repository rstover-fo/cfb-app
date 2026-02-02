'use client'

import { useState, useMemo } from 'react'
import { Team, TeamSeasonEpa, TeamStyleProfile } from '@/lib/types/database'
import { ScatterPlot } from './ScatterPlot'

interface ScatterPlotClientProps {
  teams: Team[]
  metrics: TeamSeasonEpa[]
  styles: TeamStyleProfile[]
  currentSeason: number
}

type MetricKey = 'epa_vs_success' | 'off_vs_def' | 'run_vs_pass'

const PLOT_OPTIONS: { id: MetricKey; label: string; xLabel: string; yLabel: string; xInvert?: boolean; yInvert?: boolean }[] = [
  { id: 'epa_vs_success', label: 'EPA vs Success Rate', xLabel: 'EPA per Play', yLabel: 'Success Rate' },
  { id: 'off_vs_def', label: 'Offense vs Defense', xLabel: 'Offensive EPA Rank', yLabel: 'Defensive EPA Rank', xInvert: true, yInvert: true },
  { id: 'run_vs_pass', label: 'Run vs Pass EPA', xLabel: 'Rushing EPA', yLabel: 'Passing EPA' },
]

interface DataPoint {
  id: number
  name: string
  x: number
  y: number
  color: string
  logo: string | null
  conference: string | null
}

export function ScatterPlotClient({ teams, metrics, styles, currentSeason }: ScatterPlotClientProps) {
  const [activePlot, setActivePlot] = useState<MetricKey>('epa_vs_success')

  const activeOption = PLOT_OPTIONS.find(p => p.id === activePlot)!

  // Build lookup maps
  const metricsMap = useMemo(() => {
    return new Map(metrics.map(m => [m.team, m]))
  }, [metrics])

  const stylesMap = useMemo(() => {
    return new Map(styles.map(s => [s.team, s]))
  }, [styles])

  // Transform data based on active plot
  const plotData: DataPoint[] = useMemo(() => {
    return teams
      .map(team => {
        const teamMetrics = metricsMap.get(team.school)
        const teamStyle = stylesMap.get(team.school)

        if (!teamMetrics) return null

        let x: number, y: number

        switch (activePlot) {
          case 'epa_vs_success':
            x = teamMetrics.epa_per_play
            y = teamMetrics.success_rate
            break
          case 'off_vs_def':
            x = teamMetrics.off_epa_rank
            y = teamMetrics.def_epa_rank
            break
          case 'run_vs_pass':
            if (!teamStyle) return null
            x = teamStyle.epa_rushing
            y = teamStyle.epa_passing
            break
          default:
            return null
        }

        return {
          id: team.id,
          name: team.school,
          x,
          y,
          color: team.color || '#6B635A',
          logo: team.logo,
          conference: team.conference
        }
      })
      .filter((p): p is DataPoint => p !== null)
  }, [teams, metricsMap, stylesMap, activePlot])

  return (
    <div>
      {/* Plot Type Selector */}
      <div className="flex gap-2 mb-6">
        {PLOT_OPTIONS.map(option => (
          <button
            key={option.id}
            onClick={() => setActivePlot(option.id)}
            className={`px-4 py-2 border-[1.5px] rounded-sm text-sm transition-all ${
              activePlot === option.id
                ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Stats Summary */}
      <div className="flex gap-4 mb-4 text-sm text-[var(--text-muted)]">
        <span>{plotData.length} teams plotted</span>
        <span>·</span>
        <span>{currentSeason} Season</span>
      </div>

      {/* Scatter Plot */}
      <div className="card p-6">
        {plotData.length > 0 ? (
          <ScatterPlot
            data={plotData}
            xLabel={activeOption.xLabel}
            yLabel={activeOption.yLabel}
            xInvert={activeOption.xInvert}
            yInvert={activeOption.yInvert}
          />
        ) : (
          <div className="text-center py-20 text-[var(--text-muted)]">
            No data available for this plot type.
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 text-xs text-[var(--text-muted)]">
        Click any team to view their full analytics dashboard. Teams are colored by their primary color.
      </div>
    </div>
  )
}
