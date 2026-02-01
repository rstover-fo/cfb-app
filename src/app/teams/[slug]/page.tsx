import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Team, TeamSeasonEpa, TeamStyleProfile, TeamSeasonTrajectory, DrivePattern, DownDistanceSplit, TrajectoryAverages, RedZoneSplit, FieldPositionSplit, HomeAwaySplit, ConferenceSplit, RosterPlayer, PlayerSeasonStat } from '@/lib/types/database'
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

  // Fetch red zone splits
  const redZoneResult = await supabase.rpc('get_red_zone_splits', {
    p_team: team.school,
    p_season: currentSeason
  })
  const redZoneSplits = redZoneResult.error ? null : (redZoneResult.data as RedZoneSplit[] | null)

  // Fetch field position splits
  const fieldPosResult = await supabase.rpc('get_field_position_splits', {
    p_team: team.school,
    p_season: currentSeason
  })
  const fieldPositionSplits = fieldPosResult.error ? null : (fieldPosResult.data as FieldPositionSplit[] | null)

  // Fetch home/away splits
  const homeAwayResult = await supabase.rpc('get_home_away_splits', {
    p_team: team.school,
    p_season: currentSeason
  })
  const homeAwaySplits = homeAwayResult.error ? null : (homeAwayResult.data as HomeAwaySplit[] | null)

  // Fetch conference splits
  const confSplitResult = await supabase.rpc('get_conference_splits', {
    p_team: team.school,
    p_season: currentSeason
  })
  const conferenceSplits = confSplitResult.error ? null : (confSplitResult.data as ConferenceSplit[] | null)

  // Fetch trajectory averages for conference and FBS comparison
  const trajectoryAvgResult = await supabase.rpc('get_trajectory_averages', {
    p_conference: team.conference || 'SEC'
  })
  const trajectoryAverages = trajectoryAvgResult.error ? null : (trajectoryAvgResult.data as TrajectoryAverages[] | null)

  // Fetch roster
  const rosterResult = await supabase
    .from('roster')
    .select('id, first_name, last_name, jersey, position, height, weight, home_city, home_state, year')
    .eq('team', team.school)
    .eq('year', currentSeason)
    .order('last_name')

  const roster = rosterResult.error ? null : (rosterResult.data as RosterPlayer[] | null)

  // Fetch player stats (pivoted)
  const playerStatsResult = await supabase.rpc('get_player_season_stats_pivoted', {
    p_team: team.school,
    p_season: currentSeason
  })
  const playerStats = playerStatsResult.error ? null : (playerStatsResult.data as PlayerSeasonStat[] | null)

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
      redZoneSplits={redZoneSplits}
      fieldPositionSplits={fieldPositionSplits}
      homeAwaySplits={homeAwaySplits}
      conferenceSplits={conferenceSplits}
      roster={roster}
      playerStats={playerStats}
    />
  )
}
