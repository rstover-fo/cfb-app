import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Team, TeamSeasonEpa, TeamStyleProfile, TeamSeasonTrajectory, DrivePattern, DownDistanceSplit } from '@/lib/types/database'
import { MetricsCards } from '@/components/team/MetricsCards'
import { StyleProfile } from '@/components/team/StyleProfile'
import { DrivePatterns } from '@/components/visualizations/DrivePatterns'
import { TrajectoryChart } from '@/components/team/TrajectoryChart'
import { TeamTabs, TabId } from '@/components/team/TeamTabs'
import { SituationalView } from '@/components/team/SituationalView'

interface TeamPageProps {
  params: Promise<{ slug: string }>
}

async function getTeamBySlug(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never, slug: string): Promise<Team | null> {
  const { data: teams } = await supabase.from('teams').select('*')

  return teams?.find((team: Team) => {
    const teamSlug = team.school.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    return teamSlug === slug
  }) || null
}

export default async function TeamPage({ params }: TeamPageProps) {
  const { slug } = await params
  const supabase = await createClient()

  const team = await getTeamBySlug(supabase, slug)

  if (!team) {
    notFound()
  }

  const currentSeason = 2024

  const [metricsResult, styleResult, trajectoryResult, drivesResult] = await Promise.all([
    supabase
      .from('team_epa_season')
      .select('*')
      .eq('team', team.school)
      .eq('season', currentSeason)
      .single(),
    supabase
      .from('team_style_profile')
      .select('*')
      .eq('team', team.school)
      .eq('season', currentSeason)
      .single(),
    supabase
      .from('team_season_trajectory')
      .select('*')
      .eq('team', team.school)
      .order('season', { ascending: true }),
    supabase.rpc('get_drive_patterns', {
      p_team: team.school,
      p_season: currentSeason
    })
  ])

  // Fetch down/distance splits separately with error handling (RPC may not exist in all environments)
  const downDistanceResult = await supabase.rpc('get_down_distance_splits', {
    p_team: team.school,
    p_season: currentSeason
  })
  const downDistanceSplits = downDistanceResult.error ? null : (downDistanceResult.data as DownDistanceSplit[] | null)

  const metrics = metricsResult.data as TeamSeasonEpa | null
  const style = styleResult.data as TeamStyleProfile | null
  const trajectory = trajectoryResult.data as TeamSeasonTrajectory[] | null
  const drives = drivesResult.data as DrivePattern[] | null

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

      {/* Tabbed Content */}
      <TeamTabs>
        {(activeTab: TabId) => (
          <>
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
                    <TrajectoryChart trajectory={trajectory} />
                  ) : (
                    <p className="text-[var(--text-muted)]">No trajectory data available</p>
                  )}
                </section>
              </>
            )}

            {activeTab === 'situational' && (
              <SituationalView downDistanceData={downDistanceSplits} />
            )}

            {(activeTab === 'schedule' || activeTab === 'roster' || activeTab === 'compare') && (
              <div className="text-center py-12">
                <p className="text-[var(--text-muted)]">Coming soon.</p>
              </div>
            )}
          </>
        )}
      </TeamTabs>
    </div>
  )
}
