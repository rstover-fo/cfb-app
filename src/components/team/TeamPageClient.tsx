'use client'

import { useState } from 'react'
import { Team, TeamSeasonEpa, TeamStyleProfile, TeamSeasonTrajectory, DrivePattern, DownDistanceSplit, TrajectoryAverages, RedZoneSplit, FieldPositionSplit, HomeAwaySplit, ConferenceSplit, RosterPlayer, PlayerSeasonStat, ScheduleGame } from '@/lib/types/database'
import { MetricsCards } from '@/components/team/MetricsCards'
import { StyleProfile } from '@/components/team/StyleProfile'
import { DrivePatterns } from '@/components/visualizations/DrivePatterns'
import { TrajectoryChart } from '@/components/team/TrajectoryChart'
import { SituationalView } from '@/components/team/SituationalView'
import { RosterView } from './RosterView'
import { ScheduleView } from './ScheduleView'
import { CompareView } from './CompareView'

type TabId = 'overview' | 'situational' | 'schedule' | 'roster' | 'compare'

interface Tab {
  id: TabId
  label: string
  enabled: boolean
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Overview', enabled: true },
  { id: 'situational', label: 'Situational', enabled: true },
  { id: 'schedule', label: 'Schedule', enabled: true },
  { id: 'roster', label: 'Roster', enabled: true },
  { id: 'compare', label: 'Compare', enabled: true },
]

interface TeamPageClientProps {
  team: Team
  currentSeason: number
  metrics: TeamSeasonEpa | null
  style: TeamStyleProfile | null
  trajectory: TeamSeasonTrajectory[] | null
  trajectoryAverages: TrajectoryAverages[] | null
  drives: DrivePattern[] | null
  downDistanceSplits: DownDistanceSplit[] | null
  redZoneSplits: RedZoneSplit[] | null
  fieldPositionSplits: FieldPositionSplit[] | null
  homeAwaySplits: HomeAwaySplit[] | null
  conferenceSplits: ConferenceSplit[] | null
  roster: RosterPlayer[] | null
  playerStats: PlayerSeasonStat[] | null
  schedule: ScheduleGame[] | null
  allTeams: Team[]
}

export function TeamPageClient({
  team,
  currentSeason,
  metrics,
  style,
  trajectory,
  trajectoryAverages,
  drives,
  downDistanceSplits,
  redZoneSplits,
  fieldPositionSplits,
  homeAwaySplits,
  conferenceSplits,
  roster,
  playerStats,
  schedule,
  allTeams
}: TeamPageClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  return (
    <div className="p-8">
      {/* Page Header */}
      <header className="flex items-center gap-6 mb-8 pb-6 border-b border-[var(--border)]">
        {team.logo ? (
          <img
            src={team.logo}
            alt={`${team.school} logo`}
            className="w-20 h-20 object-contain"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-[var(--bg-surface-alt)] flex items-center justify-center">
            <span className="font-headline text-2xl text-[var(--text-muted)]">
              {team.school.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </span>
          </div>
        )}
        <div>
          <h1 className="font-headline text-4xl text-[var(--text-primary)] underline-sketch inline-block">
            {team.school}
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            {team.conference || 'Independent'} · {currentSeason} Season
          </p>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="flex gap-2 mb-6" role="tablist" aria-label="Team page sections">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          const isDisabled = !tab.enabled

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              disabled={isDisabled}
              onClick={() => tab.enabled && setActiveTab(tab.id)}
              className={`px-4 py-2 border-[1.5px] rounded-sm text-sm transition-all ${
                isActive
                  ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                  : isDisabled
                  ? 'border-[var(--border)] text-[var(--text-muted)] opacity-50 cursor-not-allowed'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
              }`}
            >
              {tab.label}
              {isDisabled && <span className="ml-1 text-xs">(soon)</span>}
            </button>
          )
        })}
      </nav>

      {/* Tab Content */}
      <div id={`tabpanel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
        {activeTab === 'overview' && (
          <>
            {/* Drive Patterns */}
            <section className="mb-10">
              <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Drive Patterns</h2>
              {drives && drives.length > 0 ? (
                <DrivePatterns drives={drives} teamName={team.school} />
              ) : (
                <p className="text-[var(--text-muted)]">No drive data available</p>
              )}
            </section>

            {/* Performance Metrics */}
            <section className="mb-10">
              <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Performance Metrics</h2>
              {metrics ? (
                <MetricsCards metrics={metrics} />
              ) : (
                <p className="text-[var(--text-muted)]">No metrics available for this season</p>
              )}
            </section>

            {/* Style Profile */}
            <section className="mb-10">
              <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Style Profile</h2>
              {style ? (
                <StyleProfile style={style} />
              ) : (
                <p className="text-[var(--text-muted)]">No style data available</p>
              )}
            </section>

            {/* Historical Trajectory */}
            <section className="mb-10">
              <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Historical Trajectory</h2>
              {trajectory && trajectory.length > 0 ? (
                <TrajectoryChart
                  trajectory={trajectory}
                  averages={trajectoryAverages}
                  conference={team.conference || 'FBS'}
                />
              ) : (
                <p className="text-[var(--text-muted)]">No trajectory data available</p>
              )}
            </section>
          </>
        )}

        {activeTab === 'situational' && (
          <SituationalView
            downDistanceData={downDistanceSplits}
            redZoneData={redZoneSplits}
            fieldPositionData={fieldPositionSplits}
            homeAwayData={homeAwaySplits}
            conferenceData={conferenceSplits}
            conference={team.conference || 'FBS'}
          />
        )}

        {activeTab === 'roster' && (
          <RosterView roster={roster} stats={playerStats} />
        )}

        {activeTab === 'schedule' && (
          <ScheduleView schedule={schedule} teamColor={team.color} />
        )}

        {activeTab === 'compare' && (
          <CompareView
            team={team}
            metrics={metrics}
            style={style}
            allTeams={allTeams}
            currentSeason={currentSeason}
          />
        )}
      </div>
    </div>
  )
}
