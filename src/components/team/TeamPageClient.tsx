'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Sword } from '@phosphor-icons/react'
import { Team, TeamSeasonEpa, TeamStyleProfile, TeamSeasonTrajectory, DrivePattern, DownDistanceSplit, TrajectoryAverages, RedZoneSplit, FieldPositionSplit, HomeAwaySplit, ConferenceSplit, RosterPlayer, PlayerSeasonStat, ScheduleGame, RecruitingClassHistory, RecruitingROI, Signee, PortalActivity } from '@/lib/types/database'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { MetricsCards } from '@/components/team/MetricsCards'
import { PlaycallingProfile } from '@/components/team/PlaycallingProfile'
import { AdjustedEpaChart } from '@/components/team/AdjustedEpaChart'
import { StyleProfile } from '@/components/team/StyleProfile'
import { DrivePatterns } from '@/components/visualizations/DrivePatterns'
import { TrajectoryChart } from '@/components/team/TrajectoryChart'
import { EloCard } from '@/components/team/EloCard'
import { EloHistoryChart } from '@/components/team/EloHistoryChart'
import { AtsCard } from '@/components/team/AtsCard'
import { SituationalView } from '@/components/team/SituationalView'
import { SeasonSelector } from '@/components/SeasonSelector'
import { TeamThemeToggle } from '@/components/team/TeamThemeToggle'
import { RosterView } from './RosterView'
import { ScheduleView } from './ScheduleView'
import { CompareView } from './CompareView'
import { RecruitingView } from './RecruitingView'
import type { TeamThemeConfig } from '@/lib/theme/team-theme'
import type { TeamElo, TeamEloGamePoint, TeamAts } from '@/lib/queries/predictions'
import type { PlaycallingProfile as PlaycallingProfileData, TeamWeekFeature } from '@/lib/queries/playcalling'
import type { ReturningProduction, TransferPortalImpact } from '@/lib/queries/roster-context'

type TabId = 'overview' | 'situational' | 'playcalling' | 'schedule' | 'roster' | 'compare' | 'recruiting'

interface Tab {
  id: TabId
  label: string
  enabled: boolean
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Overview', enabled: true },
  { id: 'situational', label: 'Situational', enabled: true },
  { id: 'playcalling', label: 'Playcalling', enabled: true },
  { id: 'schedule', label: 'Schedule', enabled: true },
  { id: 'roster', label: 'Roster', enabled: true },
  { id: 'compare', label: 'Compare', enabled: true },
  { id: 'recruiting', label: 'Recruiting', enabled: true },
]

interface TeamPageClientProps {
  team: Team
  currentSeason: number
  availableSeasons: number[]
  metrics: TeamSeasonEpa | null
  style: TeamStyleProfile | null
  trajectory: TeamSeasonTrajectory[] | null
  trajectoryAverages: TrajectoryAverages[] | null
  offenseDrives: DrivePattern[] | null
  defenseDrives: DrivePattern[] | null
  downDistanceSplits: DownDistanceSplit[] | null
  redZoneSplits: RedZoneSplit[] | null
  fieldPositionSplits: FieldPositionSplit[] | null
  homeAwaySplits: HomeAwaySplit[] | null
  conferenceSplits: ConferenceSplit[] | null
  roster: RosterPlayer[] | null
  playerStats: PlayerSeasonStat[] | null
  schedule: ScheduleGame[] | null
  allTeams: Team[]
  classHistory: RecruitingClassHistory[] | null
  roi: RecruitingROI | null
  signees: Signee[] | null
  portalActivity: PortalActivity | null
  returningProduction: ReturningProduction | null
  transferPortalImpact: TransferPortalImpact | null
  /** Theme this team offers (e.g. OU "Sooner Mode"), or null if it has none. */
  teamTheme: TeamThemeConfig | null
  /** The theme key currently active site-wide, per the visitor's cookie. */
  activeThemeKey: string | null
  teamElo: TeamElo | null
  teamEloHistory: TeamEloGamePoint[]
  teamAts: TeamAts | null
  playcallingProfile: PlaycallingProfileData | null
  teamWeekFeatures: TeamWeekFeature[]
}

export function TeamPageClient({
  team,
  currentSeason,
  availableSeasons,
  metrics,
  style,
  trajectory,
  trajectoryAverages,
  offenseDrives,
  defenseDrives,
  downDistanceSplits,
  redZoneSplits,
  fieldPositionSplits,
  homeAwaySplits,
  conferenceSplits,
  roster,
  playerStats,
  schedule,
  allTeams,
  classHistory,
  roi,
  signees,
  portalActivity,
  returningProduction,
  transferPortalImpact,
  teamTheme,
  activeThemeKey,
  teamElo,
  teamEloHistory,
  teamAts,
  playcallingProfile,
  teamWeekFeatures
}: TeamPageClientProps) {
  // True only when this team's own theme is the one currently active.
  const isThemeActive = teamTheme !== null && activeThemeKey === teamTheme.key

  return (
    <div className="p-8">
      {/* Page Header */}
      <header
        className={`flex flex-wrap items-center gap-6 mb-8 pb-6 border-b transition-colors ${
          isThemeActive ? 'border-[var(--accent)]' : 'border-[var(--border)]'
        }`}
        // Scope the headline underline to the team's accent color only while
        // its theme is active — a subtle, page-local accent treatment that
        // doesn't touch the shared --color-run token used elsewhere.
        style={isThemeActive ? ({ '--color-run': 'var(--accent)' } as React.CSSProperties) : undefined}
      >
        {team.logo ? (
          <Image
            src={team.logo}
            alt={`${team.school} logo`}
            width={80}
            height={80}
            className="w-20 h-20 object-contain"
            unoptimized
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-[var(--bg-surface-alt)] flex items-center justify-center">
            <span className="font-headline text-2xl text-[var(--text-muted)]">
              {(team.school ?? '').split(' ').map(w => w[0]).join('').slice(0, 2)}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-[200px]">
          <h1 className="font-headline text-4xl text-[var(--text-primary)] underline-sketch inline-block">
            {team.school}
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            {team.conference || 'Independent'} · {currentSeason} Season
          </p>
          {teamTheme && (
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <TeamThemeToggle themeKey={teamTheme.key} label={teamTheme.label} active={isThemeActive} />
              {isThemeActive && (
                <Link
                  href="/rivals?t1=Oklahoma&t2=Texas"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
                >
                  <Sword size={14} weight="bold" aria-hidden="true" />
                  Red River Rivalry
                </Link>
              )}
            </div>
          )}
        </div>
        <SeasonSelector seasons={availableSeasons} currentSeason={currentSeason} />
      </header>

      <Tabs defaultValue="overview" className="gap-0">
        {/* py-1.5 reserves room inside the scroll container for the active
            tab's accent bar (after:bottom-[-5px]) and the 3px focus ring --
            overflow-x-auto forces overflow-y to auto too, which would
            otherwise clip both (see DESIGN.md, Tabs). */}
        <TabsList aria-label="Team page sections" className="mb-6 w-full justify-start overflow-x-auto scrollbar-hide py-1.5">
          {TABS.map(tab => (
            <TabsTrigger key={tab.id} value={tab.id} disabled={!tab.enabled}>
              {tab.label}
              {!tab.enabled && <span className="ml-1 text-xs">(soon)</span>}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          {/* Drive Patterns */}
          <section className="mb-10">
            <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Drive Patterns</h2>
            {offenseDrives && offenseDrives.length > 0 ? (
              <DrivePatterns
                offenseDrives={offenseDrives}
                defenseDrives={defenseDrives ?? []}
                teamName={team.school ?? ''}
              />
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

          {/* Elo Rating */}
          {(teamElo || teamEloHistory.length > 0) && (
            <section className="mb-10">
              <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Elo Rating</h2>
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_1fr] gap-4 items-start">
                <EloCard elo={teamElo} history={teamEloHistory} />
                <EloHistoryChart history={teamEloHistory} teamName={team.school ?? ''} />
              </div>
            </section>
          )}

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
                teamName={team.school ?? ''}
              />
            ) : (
              <p className="text-[var(--text-muted)]">No trajectory data available</p>
            )}
          </section>

          {/* Opponent-Adjusted Offense — gated so no stray heading renders
              when the feature build hasn't produced either EPA series yet. */}
          {teamWeekFeatures.some(w => w.adj_epa_off !== null || w.off_epa_per_play !== null) && (
            <section className="mb-10">
              <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Opponent-Adjusted Offense</h2>
              <AdjustedEpaChart features={teamWeekFeatures} teamName={team.school ?? ''} />
            </section>
          )}
        </TabsContent>

        <TabsContent value="situational">
          <SituationalView
            downDistanceData={downDistanceSplits}
            redZoneData={redZoneSplits}
            fieldPositionData={fieldPositionSplits}
            homeAwayData={homeAwaySplits}
            conferenceData={conferenceSplits}
            conference={team.conference || 'FBS'}
          />
        </TabsContent>

        <TabsContent value="playcalling">
          <PlaycallingProfile profile={playcallingProfile} />
        </TabsContent>

        <TabsContent value="schedule">
          <div className="mb-6">
            <AtsCard ats={teamAts} />
          </div>
          <ScheduleView schedule={schedule} teamColor={team.color} />
        </TabsContent>

        <TabsContent value="roster">
          <RosterView roster={roster} stats={playerStats} />
        </TabsContent>

        <TabsContent value="compare">
          <CompareView
            team={team}
            metrics={metrics}
            style={style}
            allTeams={allTeams}
            currentSeason={currentSeason}
          />
        </TabsContent>

        <TabsContent value="recruiting">
          <RecruitingView
            classHistory={classHistory}
            roi={roi}
            signees={signees}
            portalActivity={portalActivity}
            returningProduction={returningProduction}
            transferPortalImpact={transferPortalImpact}
            teamColor={team.color}
            currentSeason={currentSeason}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
