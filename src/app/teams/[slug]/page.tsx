import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Team, TeamSeasonEpa, TeamStyleProfile, TeamSeasonTrajectory, DrivePattern, DownDistanceSplit, TrajectoryAverages, RedZoneSplit, FieldPositionSplit, HomeAwaySplit, ConferenceSplit, RosterPlayer, PlayerSeasonStat, Game, ScheduleGame, RecruitingClassHistory, RecruitingROI, Signee, PortalActivity } from '@/lib/types/database'
import { TeamPageClient } from '@/components/team/TeamPageClient'
import { CURRENT_SEASON } from '@/lib/queries/constants'

interface TeamPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ season?: string }>
}

async function getTeamBySlug(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never, slug: string): Promise<Team | null> {
  const { data: teams } = await supabase.from('teams_with_logos').select('*')

  return teams?.find((team: Team) => {
    const teamSlug = (team.school ?? '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    return teamSlug === slug
  }) || null
}

export default async function TeamPage({ params, searchParams }: TeamPageProps) {
  const { slug } = await params
  const { season: seasonParam } = await searchParams
  const supabase = await createClient()

  const team = await getTeamBySlug(supabase, slug)

  if (!team) {
    notFound()
  }

  // Get available seasons for the selector
  const { data: seasonsData } = await supabase.rpc('get_available_seasons')
  const seasons = (seasonsData as number[]) ?? [CURRENT_SEASON]
  const currentSeason = seasonParam ? parseInt(seasonParam, 10) : Math.max(...seasons)

  const [metricsResult, styleResult, trajectoryResult, drivesResult, defenseDrivesResult] = await Promise.all([
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
      p_season: currentSeason,
    }),
    supabase.rpc('get_drive_patterns', {
      p_team: team.school,
      p_season: currentSeason,
      p_side: 'defense',
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

  // Fetch roster (via public view)
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

  // Fetch schedule
  const scheduleResult = await supabase
    .from('games')
    .select('*')
    .or(`home_team.eq.${team.school},away_team.eq.${team.school}`)
    .eq('season', currentSeason)
    .order('week')

  // Fetch recruiting data (4 RPCs in parallel)
  const [classHistoryResult, roiResult, signeesResult, portalResult] = await Promise.all([
    supabase.rpc('get_recruiting_class_history', { p_team: team.school }),
    supabase.rpc('get_recruiting_roi', { p_team: team.school, p_season: currentSeason }),
    supabase.rpc('get_team_signees', { p_team: team.school, p_year: currentSeason }),
    supabase.rpc('get_team_portal_activity', { p_team: team.school, p_season: currentSeason }),
  ])
  const classHistory = classHistoryResult.error ? null : (classHistoryResult.data as RecruitingClassHistory[] | null)
  const roi = roiResult.error ? null : ((roiResult.data as RecruitingROI[] | null)?.[0] ?? null)
  const signees = signeesResult.error ? null : (signeesResult.data as Signee[] | null)
  const portalActivity = portalResult.error ? null : (portalResult.data as PortalActivity | null)

  // Fetch all teams (for schedule logos and Compare tab)
  const { data: allTeamsData } = await supabase.from('teams_with_logos').select('*')
  const allTeams = (allTeamsData as Team[]) || []
  const teamLogos = new Map(allTeams.filter(t => t.school).map(t => [t.school!, t.logo]))

  // Transform to ScheduleGame format
  let schedule: ScheduleGame[] | null = null
  if (!scheduleResult.error && scheduleResult.data) {
    schedule = (scheduleResult.data as Game[]).map(game => {
      const isHome = game.home_team === team.school
      const opponent = isHome ? (game.away_team ?? '') : (game.home_team ?? '')
      const teamScore = isHome ? game.home_points : game.away_points
      const opponentScore = isHome ? game.away_points : game.home_points
      let result: 'W' | 'L' | null = null
      if (game.completed && teamScore !== null && opponentScore !== null) {
        result = teamScore > opponentScore ? 'W' : 'L'
      }
      return {
        ...game,
        opponent,
        opponent_logo: (opponent ? teamLogos.get(opponent) : null) ?? null,
        is_home: isHome,
        team_score: teamScore,
        opponent_score: opponentScore,
        result
      }
    })
  }

  const metrics = metricsResult.data as TeamSeasonEpa | null
  const style = styleResult.data as TeamStyleProfile | null
  const trajectory = trajectoryResult.data as TeamSeasonTrajectory[] | null
  const offenseDrives = drivesResult.data as DrivePattern[] | null
  const defenseDrives = defenseDrivesResult.data as DrivePattern[] | null

  return (
    <TeamPageClient
      team={team}
      currentSeason={currentSeason}
      availableSeasons={seasons}
      metrics={metrics}
      style={style}
      trajectory={trajectory}
      trajectoryAverages={trajectoryAverages}
      offenseDrives={offenseDrives}
      defenseDrives={defenseDrives}
      downDistanceSplits={downDistanceSplits}
      redZoneSplits={redZoneSplits}
      fieldPositionSplits={fieldPositionSplits}
      homeAwaySplits={homeAwaySplits}
      conferenceSplits={conferenceSplits}
      roster={roster}
      playerStats={playerStats}
      schedule={schedule}
      allTeams={allTeams}
      classHistory={classHistory}
      roi={roi}
      signees={signees}
      portalActivity={portalActivity}
    />
  )
}
