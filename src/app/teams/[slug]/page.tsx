import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Team, TeamSeasonEpa, TeamStyleProfile, TeamSeasonTrajectory, DrivePattern } from '@/lib/types/database'
import { MetricsCards } from '@/components/team/MetricsCards'

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

  // Fetch all data in parallel
  const [metricsResult, styleResult, trajectoryResult, drivesResult] = await Promise.all([
    supabase
      .from('team_season_epa')
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

  const metrics = metricsResult.data as TeamSeasonEpa | null
  const style = styleResult.data as TeamStyleProfile | null
  const trajectory = trajectoryResult.data as TeamSeasonTrajectory[] | null
  const drives = drivesResult.data as DrivePattern[] | null

  return (
    <main className="max-w-6xl mx-auto p-8">
      {/* Header */}
      <header className="flex items-center gap-4 mb-8">
        {team.logo && (
          <img
            src={team.logo}
            alt={`${team.school} logo`}
            className="w-16 h-16 object-contain"
          />
        )}
        <div>
          <h1 className="text-3xl font-bold">{team.school}</h1>
          <p className="text-gray-600">{team.conference || 'Independent'} • {currentSeason} Season</p>
        </div>
      </header>

      {/* Placeholder sections */}
      <section className="mb-8 p-6 border rounded-lg bg-gray-50">
        <h2 className="text-xl font-semibold mb-4">Drive Patterns</h2>
        <p className="text-gray-500">Visualization coming next...</p>
        <pre className="mt-4 text-xs bg-white p-4 rounded overflow-auto max-h-40">
          {JSON.stringify(drives?.slice(0, 5), null, 2)}
        </pre>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Performance Metrics</h2>
        {metrics ? (
          <MetricsCards metrics={metrics} />
        ) : (
          <p className="text-gray-500">No metrics available for this season</p>
        )}
      </section>

      <section className="mb-8 p-6 border rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Style Profile</h2>
        {style ? (
          <pre className="text-sm">{JSON.stringify(style, null, 2)}</pre>
        ) : (
          <p className="text-gray-500">No style data available</p>
        )}
      </section>

      <section className="mb-8 p-6 border rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Historical Trajectory</h2>
        {trajectory ? (
          <pre className="text-sm max-h-60 overflow-auto">{JSON.stringify(trajectory, null, 2)}</pre>
        ) : (
          <p className="text-gray-500">No trajectory data available</p>
        )}
      </section>
    </main>
  )
}
