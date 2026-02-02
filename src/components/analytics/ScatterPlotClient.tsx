'use client'

import { useState, useMemo } from 'react'
import { Team, TeamSeasonEpa, TeamStyleProfile, DefensiveHavoc, TeamTempoMetrics } from '@/lib/types/database'
import { ScatterPlot } from './ScatterPlot'

interface ScatterPlotClientProps {
  teams: Team[]
  metrics: TeamSeasonEpa[]
  styles: TeamStyleProfile[]
  havoc: DefensiveHavoc[]
  tempo: TeamTempoMetrics[]
  currentSeason: number
}

type MetricKey =
  | 'epa_vs_success'
  | 'off_vs_def'
  | 'run_vs_pass'
  | 'def_run_vs_pass'
  | 'consistency_vs_explosiveness'
  | 'havoc_vs_bend'
  | 'tempo_vs_efficiency'

interface QuadrantLabels {
  topLeft: string
  topRight: string
  bottomLeft: string
  bottomRight: string
}

interface PlotOption {
  id: MetricKey
  label: string
  xLabel: string
  yLabel: string
  xInvert?: boolean
  yInvert?: boolean
  quadrantLabels: QuadrantLabels
}

const PLOT_OPTIONS: PlotOption[] = [
  {
    id: 'epa_vs_success',
    label: 'EPA vs Success Rate',
    xLabel: 'EPA per Play',
    yLabel: 'Success Rate',
    quadrantLabels: {
      topLeft: 'Efficient but Explosive',
      topRight: 'Elite',
      bottomLeft: 'Struggling',
      bottomRight: 'Boom or Bust'
    }
  },
  {
    id: 'off_vs_def',
    label: 'Offense vs Defense',
    xLabel: 'Offensive EPA Rank',
    yLabel: 'Defensive EPA Rank',
    xInvert: true,
    yInvert: true,
    quadrantLabels: {
      topLeft: 'Defensive Team',
      topRight: 'Contenders',
      bottomLeft: 'Rebuilding',
      bottomRight: 'Offensive Team'
    }
  },
  {
    id: 'run_vs_pass',
    label: 'Run vs Pass EPA',
    xLabel: 'Rushing EPA',
    yLabel: 'Passing EPA',
    quadrantLabels: {
      topLeft: 'Pass Heavy',
      topRight: 'Balanced & Effective',
      bottomLeft: 'Struggling',
      bottomRight: 'Run Heavy'
    }
  },
  {
    id: 'def_run_vs_pass',
    label: 'Defensive Identity',
    xLabel: 'EPA Allowed vs Run',
    yLabel: 'EPA Allowed vs Pass',
    xInvert: true,
    yInvert: true,
    quadrantLabels: {
      topLeft: 'Pass Rush Focused',
      topRight: 'Lockdown',
      bottomLeft: 'Vulnerable',
      bottomRight: 'Run Stuffers'
    }
  },
  {
    id: 'consistency_vs_explosiveness',
    label: 'Consistency vs Explosiveness',
    xLabel: 'Success Rate',
    yLabel: 'Explosiveness',
    quadrantLabels: {
      topLeft: 'Boom or Bust',
      topRight: 'Elite',
      bottomLeft: 'Struggling',
      bottomRight: 'Methodical'
    }
  },
  {
    id: 'havoc_vs_bend',
    label: 'Havoc vs Bend-Dont-Break',
    xLabel: 'Havoc Rate',
    yLabel: 'EPA Allowed per Play',
    yInvert: true,
    quadrantLabels: {
      topLeft: 'Passive but Stingy',
      topRight: 'Disruptive & Stingy',
      bottomLeft: 'Vulnerable',
      bottomRight: 'Disruptive but Leaky'
    }
  },
  {
    id: 'tempo_vs_efficiency',
    label: 'Tempo vs Efficiency',
    xLabel: 'Plays per Game',
    yLabel: 'EPA per Play',
    quadrantLabels: {
      topLeft: 'Slow & Efficient',
      topRight: 'Fast & Effective',
      bottomLeft: 'Slow & Inefficient',
      bottomRight: 'Fast & Sloppy'
    }
  },
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

export function ScatterPlotClient({ teams, metrics, styles, havoc, tempo, currentSeason }: ScatterPlotClientProps) {
  const [activePlot, setActivePlot] = useState<MetricKey>('epa_vs_success')
  const [selectedConference, setSelectedConference] = useState<string | null>(null)
  const [showLogos, setShowLogos] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const activeOption = PLOT_OPTIONS.find(p => p.id === activePlot)!

  // Get unique conferences
  const conferences = useMemo(() => {
    const confSet = new Set(teams.map(t => t.conference).filter(Boolean))
    return Array.from(confSet).sort() as string[]
  }, [teams])

  // Build lookup maps
  const metricsMap = useMemo(() => {
    return new Map(metrics.map(m => [m.team, m]))
  }, [metrics])

  const stylesMap = useMemo(() => {
    return new Map(styles.map(s => [s.team, s]))
  }, [styles])

  const havocMap = useMemo(() => {
    return new Map(havoc.map(h => [h.team, h]))
  }, [havoc])

  const tempoMap = useMemo(() => {
    return new Map(tempo.map(t => [t.team, t]))
  }, [tempo])

  // Transform data based on active plot
  const plotData: DataPoint[] = useMemo(() => {
    return teams
      .filter(team => !selectedConference || team.conference === selectedConference)
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
          case 'def_run_vs_pass':
            if (!teamStyle) return null
            x = teamStyle.def_epa_vs_run
            y = teamStyle.def_epa_vs_pass
            break
          case 'consistency_vs_explosiveness':
            x = teamMetrics.success_rate
            y = teamMetrics.explosiveness
            break
          case 'havoc_vs_bend':
            const teamHavoc = havocMap.get(team.school)
            if (!teamHavoc) return null
            x = teamHavoc.havoc_rate
            y = teamHavoc.opp_epa_per_play
            break
          case 'tempo_vs_efficiency':
            const teamTempo = tempoMap.get(team.school)
            if (!teamTempo) return null
            x = teamTempo.plays_per_game
            y = teamTempo.epa_per_play
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
  }, [teams, metricsMap, stylesMap, havocMap, tempoMap, activePlot, selectedConference])

  // Find highlighted team based on search
  const highlightedTeamId = useMemo(() => {
    if (!searchQuery.trim()) return null
    const query = searchQuery.toLowerCase()
    const match = plotData.find(p => p.name.toLowerCase().includes(query))
    return match?.id ?? null
  }, [searchQuery, plotData])

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

      {/* Conference Filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setSelectedConference(null)}
          className={`px-3 py-1.5 border rounded-sm text-xs transition-all ${
            selectedConference === null
              ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
              : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-secondary)]'
          }`}
        >
          All Conferences
        </button>
        {conferences.map(conf => (
          <button
            key={conf}
            onClick={() => setSelectedConference(conf)}
            className={`px-3 py-1.5 border rounded-sm text-xs transition-all ${
              selectedConference === conf
                ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-secondary)]'
            }`}
          >
            {conf}
          </button>
        ))}
      </div>

      {/* Stats Summary, Search & Logo Toggle */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="flex gap-4 text-sm text-[var(--text-muted)]">
          <span>{plotData.length} teams plotted</span>
          <span>·</span>
          <span>{currentSeason} Season</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find team..."
              className="w-40 px-3 py-1.5 border border-[var(--border)] rounded-sm text-xs bg-[var(--bg-base)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--color-run)]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs"
              >
                ×
              </button>
            )}
          </div>
          <button
            onClick={() => setShowLogos(!showLogos)}
            className={`px-3 py-1.5 border rounded-sm text-xs transition-all ${
              showLogos
                ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-secondary)]'
            }`}
          >
            {showLogos ? 'Logos' : 'Colors'}
          </button>
        </div>
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
            quadrantLabels={activeOption.quadrantLabels}
            showLogos={showLogos}
            highlightedTeamId={highlightedTeamId}
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
