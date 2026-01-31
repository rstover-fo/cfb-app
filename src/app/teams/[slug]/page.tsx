import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Team, TeamSeasonEpa, TeamStyleProfile, TeamSeasonTrajectory, DrivePattern, DownDistanceSplit, TrajectoryAverages } from '@/lib/types/database'
import { TeamPageClient } from '@/components/team/TeamPageClient'

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

  // Fetch trajectory averages for conference and FBS comparison
  const trajectoryAvgResult = await supabase.rpc('get_trajectory_averages', {
    p_conference: team.conference || 'SEC'
  })
  const trajectoryAverages = trajectoryAvgResult.error ? null : (trajectoryAvgResult.data as TrajectoryAverages[] | null)

  const metrics = metricsResult.data as TeamSeasonEpa | null
  const style = styleResult.data as TeamStyleProfile | null
  const trajectory = trajectoryResult.data as TeamSeasonTrajectory[] | null
  const drives = drivesResult.data as DrivePattern[] | null

  return (
    <TeamPageClient
      team={team}
      currentSeason={currentSeason}
      metrics={metrics}
      style={style}
      trajectory={trajectory}
      trajectoryAverages={trajectoryAverages}
      drives={drives}
      downDistanceSplits={downDistanceSplits}
    />
  )
}
