'use client'

import { useState, useMemo } from 'react'
import { Team, TeamSeasonEpa, TeamStyleProfile, DefensiveHavoc, TeamTempoMetrics, TeamRecord, TeamSpecialTeamsSos } from '@/lib/types/database'
import { ScatterPlot } from './ScatterPlot'
import { RankedTable } from './RankedTable'
import { RadarChart } from './RadarChart'
import { OffenseRadar } from './OffenseRadar'
import { DefenseRadar } from './DefenseRadar'

type RadarViewMode = 'combined' | 'offense' | 'defense'

interface ScatterPlotClientProps {
  teams: Team[]
  metrics: TeamSeasonEpa[]
  styles: TeamStyleProfile[]
  havoc: DefensiveHavoc[]
  tempo: TeamTempoMetrics[]
  records: TeamRecord[]
  specialTeams: TeamSpecialTeamsSos[]
  currentSeason: number
}

// Composite ranking weight configuration (must sum to 1.0)
const RANKING_WEIGHTS = {
  offense: 0.40,
  defense: 0.40,
  specialTeams: 0.20
} as const

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
  compositeScore?: number
}

export function ScatterPlotClient({ teams, metrics, styles, havoc, tempo, records, specialTeams, currentSeason }: ScatterPlotClientProps) {
  const [viewMode, setViewMode] = useState<'scatter' | 'rankings'>('scatter')
  const [activePlot, setActivePlot] = useState<MetricKey>('epa_vs_success')
  const [selectedConference, setSelectedConference] = useState<string | null>(null)
  const [showLogos, setShowLogos] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTeamForRadar, setSelectedTeamForRadar] = useState<string | null>(null)
  const [radarViewMode, setRadarViewMode] = useState<RadarViewMode>('combined')

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

  const recordsMap = useMemo(() => {
    return new Map(records.map(r => [r.team, r]))
  }, [records])

  const specialTeamsMap = useMemo(() => {
    return new Map(specialTeams.map(st => [st.team, st]))
  }, [specialTeams])

  // Calculate FBS-only ranks (recalculated within filtered team set)
  const fbsRanks = useMemo(() => {
    // Build list of teams with their EPA values
    const teamsWithEpa = teams
      .filter(team => team.school != null)
      .map(team => {
        const school = team.school!
        const m = metricsMap.get(school)
        const h = havocMap.get(school)
        const st = specialTeamsMap.get(school)
        if (!m) return null
        return {
          team: school,
          offEpa: m.epa_per_play ?? 0,
          defEpa: h?.opp_epa_per_play ?? 999, // Use defensive havoc for true defensive EPA
          stEfficiency: st?.fpi_st_efficiency ?? 50, // Default to median if missing
          sosRank: st?.sos_rank ?? 0 // 0 means no data
        }
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)

    // Sort by offensive EPA (higher = better = lower rank)
    const byOffense = [...teamsWithEpa].sort((a, b) => (b.offEpa ?? 0) - (a.offEpa ?? 0))
    const offRankMap = new Map(byOffense.map((t, i) => [t.team, i + 1]))

    // Sort by defensive EPA (lower = better = lower rank)
    const byDefense = [...teamsWithEpa].sort((a, b) => a.defEpa - b.defEpa)
    const defRankMap = new Map(byDefense.map((t, i) => [t.team, i + 1]))

    // Sort by ST efficiency (higher = better = lower rank)
    const bySpecialTeams = [...teamsWithEpa].sort((a, b) => b.stEfficiency - a.stEfficiency)
    const stRankMap = new Map(bySpecialTeams.map((t, i) => [t.team, i + 1]))

    // Store SOS rank directly (already a rank, not a value to rank)
    const sosRankMap = new Map(teamsWithEpa.map(t => [t.team, t.sosRank]))

    const maxRank = teamsWithEpa.length

    return { offRankMap, defRankMap, stRankMap, sosRankMap, maxRank }
  }, [teams, metricsMap, havocMap, specialTeamsMap])

  // Transform data based on active plot
  const plotData = useMemo(() => {
    return teams
      .filter(team => team.school != null)
      .filter(team => !selectedConference || team.conference === selectedConference)
      .map(team => {
        const school = team.school!
        const teamMetrics = metricsMap.get(school)
        const teamStyle = stylesMap.get(school)

        if (!teamMetrics) return null

        let x: number, y: number

        switch (activePlot) {
          case 'epa_vs_success':
            x = teamMetrics.epa_per_play ?? 0
            y = teamMetrics.success_rate ?? 0
            break
          case 'off_vs_def':
            // Use FBS-only recalculated ranks
            x = fbsRanks.offRankMap.get(school) ?? fbsRanks.maxRank
            y = fbsRanks.defRankMap.get(school) ?? fbsRanks.maxRank
            break
          case 'run_vs_pass':
            if (!teamStyle) return null
            x = teamStyle.epa_rushing ?? 0
            y = teamStyle.epa_passing ?? 0
            break
          case 'def_run_vs_pass':
            if (!teamStyle) return null
            x = teamStyle.def_epa_vs_run ?? 0
            y = teamStyle.def_epa_vs_pass ?? 0
            break
          case 'consistency_vs_explosiveness':
            x = teamMetrics.success_rate ?? 0
            y = teamMetrics.explosiveness ?? 0
            break
          case 'havoc_vs_bend':
            const teamHavoc = havocMap.get(school)
            if (!teamHavoc) return null
            x = teamHavoc.havoc_rate ?? 0
            y = teamHavoc.opp_epa_per_play ?? 0
            break
          case 'tempo_vs_efficiency':
            const teamTempo = tempoMap.get(school)
            if (!teamTempo) return null
            x = teamTempo.plays_per_game ?? 0
            y = teamTempo.epa_per_play ?? 0
            break
          default:
            return null
        }

        return {
          id: team.id ?? 0,
          name: school,
          x,
          y,
          color: team.color || '#6B635A',
          logo: team.logo,
          conference: team.conference
        }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
  }, [teams, metricsMap, stylesMap, havocMap, tempoMap, activePlot, selectedConference, fbsRanks])

  // Find highlighted team based on search
  const highlightedTeamId = useMemo(() => {
    if (!searchQuery.trim()) return null
    const query = searchQuery.toLowerCase()
    const match = plotData.find(p => (p.name ?? '').toLowerCase().includes(query))
    return match?.id ?? null
  }, [searchQuery, plotData])

  // Compute composite rankings using FBS-only ranks
  const rankedTeams = useMemo(() => {
    const { offRankMap, defRankMap, stRankMap, sosRankMap, maxRank } = fbsRanks

    return teams
      .filter(team => team.school != null)
      .map(team => {
        const school = team.school!
        const m = metricsMap.get(school)
        if (!m) return null

        const offRank = offRankMap.get(school) ?? maxRank
        const defRank = defRankMap.get(school) ?? maxRank
        const stRank = stRankMap.get(school) ?? maxRank
        const sosRank = sosRankMap.get(school) ?? 0

        // Convert FBS-only ranks to percentiles (rank 1 → 100%, rank N → 0%)
        const offPct = ((maxRank - offRank + 1) / maxRank) * 100
        const defPct = ((maxRank - defRank + 1) / maxRank) * 100
        const stPct = ((maxRank - stRank + 1) / maxRank) * 100

        // Weighted composite: 40% Off + 40% Def + 20% ST
        const composite = (
          offPct * RANKING_WEIGHTS.offense +
          defPct * RANKING_WEIGHTS.defense +
          stPct * RANKING_WEIGHTS.specialTeams
        )

        // Get win-loss record
        const record = recordsMap.get(school)
        const wins = record?.total__wins ?? null
        const losses = record?.total__losses ?? null
        const confWins = record?.conference_games__wins ?? null
        const confLosses = record?.conference_games__losses ?? null

        return {
          rank: 0, // Will be assigned after sorting
          team: school,
          logo: team.logo,
          color: team.color || '#6B635A',
          compositeScore: composite,
          offenseScore: offPct,
          defenseScore: defPct,
          specialTeamsScore: stPct,
          offRank,
          defRank,
          stRank,
          sosRank,
          conference: team.conference,
          wins,
          losses,
          confWins,
          confLosses
        }
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .map((t, i) => ({ ...t, rank: i + 1 }))
  }, [teams, metricsMap, fbsRanks, recordsMap])

  // Compute radar chart metrics for selected team using FBS-only ranks
  const radarMetrics = useMemo(() => {
    if (!selectedTeamForRadar) return null
    const team = teams.find(t => t.school === selectedTeamForRadar)
    const m = metricsMap.get(selectedTeamForRadar)
    const s = stylesMap.get(selectedTeamForRadar)
    const h = havocMap.get(selectedTeamForRadar)

    if (!team || !m) return null

    const { offRankMap, defRankMap, stRankMap, maxRank } = fbsRanks
    const offRank = offRankMap.get(selectedTeamForRadar) ?? maxRank
    const defRank = defRankMap.get(selectedTeamForRadar) ?? maxRank
    const stRank = stRankMap.get(selectedTeamForRadar) ?? maxRank

    return {
      teamName: team.school ?? '',
      teamColor: team.color || '#6B635A',
      metrics: [
        { label: 'Off EPA', value: ((maxRank - offRank + 1) / maxRank) * 100 },
        { label: 'Def EPA', value: ((maxRank - defRank + 1) / maxRank) * 100 },
        { label: 'Spec Teams', value: ((maxRank - stRank + 1) / maxRank) * 100 },
        { label: 'Success', value: (m.success_rate ?? 0) * 100 },
        { label: 'Explosive', value: Math.min((m.explosiveness ?? 0) * 200, 100) },
        { label: 'Havoc', value: h ? (h.havoc_rate ?? 0) * 500 : 50 },
        { label: 'Tempo', value: s ? Math.min(s.plays_per_game ?? 0, 100) : 50 }
      ]
    }
  }, [selectedTeamForRadar, teams, metricsMap, stylesMap, havocMap, fbsRanks])

  // Compute offense radar data for all teams
  const allOffenseData = useMemo(() => {
    return teams
      .map(team => {
        const m = metricsMap.get(team.school)
        const s = stylesMap.get(team.school)
        if (!m || !s) return null
        return {
          team: team.school!,
          metrics: {
            rushEpa: s.epa_rushing ?? 0,
            passEpa: s.epa_passing ?? 0,
            successRate: m.success_rate ?? 0,
            explosiveness: m.explosiveness ?? 0
          }
        }
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)
  }, [teams, metricsMap, stylesMap])

  // Compute defense radar data for all teams
  const allDefenseData = useMemo(() => {
    return teams
      .map(team => {
        const h = havocMap.get(team.school)
        if (!h) return null
        return {
          team: team.school!,
          metrics: {
            epaAllowed: h.opp_epa_per_play ?? 0,
            havocRate: h.havoc_rate ?? 0,
            stuffRate: h.stuff_rate ?? 0,
            sacks: h.sacks ?? 0,
            interceptions: h.interceptions ?? 0,
            tfls: h.tfls ?? 0
          }
        }
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)
  }, [teams, havocMap])

  // Get selected team's offense/defense data
  const selectedOffenseData = useMemo(() => {
    if (!selectedTeamForRadar) return null
    return allOffenseData.find(t => t.team === selectedTeamForRadar) ?? null
  }, [selectedTeamForRadar, allOffenseData])

  const selectedDefenseData = useMemo(() => {
    if (!selectedTeamForRadar) return null
    return allDefenseData.find(t => t.team === selectedTeamForRadar) ?? null
  }, [selectedTeamForRadar, allDefenseData])

  // Get team color for selected team
  const selectedTeamColor = useMemo(() => {
    if (!selectedTeamForRadar) return '#6B635A'
    const team = teams.find(t => t.school === selectedTeamForRadar)
    return team?.color || '#6B635A'
  }, [selectedTeamForRadar, teams])

  return (
    <div>
      {/* View Mode Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setViewMode('scatter')}
          className={`px-4 py-2 border-[1.5px] rounded-sm text-sm transition-all ${
            viewMode === 'scatter'
              ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
              : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
          }`}
        >
          Scatter Plots
        </button>
        <button
          onClick={() => setViewMode('rankings')}
          className={`px-4 py-2 border-[1.5px] rounded-sm text-sm transition-all ${
            viewMode === 'rankings'
              ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
              : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
          }`}
        >
          Rankings
        </button>
      </div>

      {viewMode === 'scatter' && (
        <>
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
        </>
      )}

      {viewMode === 'rankings' && (
        <div className="flex gap-8">
          <div className="flex-1 card p-6">
            <RankedTable
              data={rankedTeams}
              title={`${currentSeason} Composite Rankings`}
              onTeamClick={setSelectedTeamForRadar}
            />
          </div>
          {selectedTeamForRadar && (
            <div className="w-80 card p-6">
              {/* Radar View Toggle */}
              <div className="flex gap-1 mb-4">
                {(['combined', 'offense', 'defense'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setRadarViewMode(mode)}
                    className={`flex-1 px-2 py-1.5 border rounded-sm text-xs transition-all ${
                      radarViewMode === mode
                        ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-secondary)]'
                    }`}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>

              {/* Radar Chart based on selected mode */}
              <div className="transition-opacity duration-200">
                {radarViewMode === 'combined' && radarMetrics && (
                  <RadarChart
                    metrics={radarMetrics.metrics}
                    teamName={radarMetrics.teamName}
                    teamColor={radarMetrics.teamColor}
                  />
                )}
                {radarViewMode === 'offense' && selectedOffenseData && (
                  <OffenseRadar
                    teamData={selectedOffenseData}
                    allTeamsData={allOffenseData}
                    teamColor={selectedTeamColor}
                    size={280}
                  />
                )}
                {radarViewMode === 'defense' && selectedDefenseData && (
                  <DefenseRadar
                    teamData={selectedDefenseData}
                    allTeamsData={allDefenseData}
                    teamColor={selectedTeamColor}
                    size={280}
                  />
                )}
                {/* Fallback when data is missing */}
                {radarViewMode === 'offense' && !selectedOffenseData && (
                  <div className="text-center py-10 text-[var(--text-muted)] text-sm">
                    Offense data unavailable for this team.
                  </div>
                )}
                {radarViewMode === 'defense' && !selectedDefenseData && (
                  <div className="text-center py-10 text-[var(--text-muted)] text-sm">
                    Defense data unavailable for this team.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
