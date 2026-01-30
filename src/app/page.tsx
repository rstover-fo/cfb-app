import { createClient } from '@/lib/supabase/server'
import { TeamCard } from '@/components/TeamCard'
import { Team } from '@/lib/types/database'

export default async function Home() {
  const supabase = await createClient()
  const { data: teams, error } = await supabase
    .from('teams')
    .select('*')
    .not('conference', 'is', null)
    .order('school')

  if (error) {
    return <div className="p-8 text-red-500">Error loading teams: {error.message}</div>
  }

  // Group by conference
  const byConference = (teams as Team[]).reduce((acc, team) => {
    const conf = team.conference || 'Independent'
    if (!acc[conf]) acc[conf] = []
    acc[conf].push(team)
    return acc
  }, {} as Record<string, Team[]>)

  return (
    <main className="max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-2">CFB Team 360</h1>
      <p className="text-gray-600 mb-8">Select a team to view analytics</p>

      {Object.entries(byConference).sort().map(([conference, confTeams]) => (
        <section key={conference} className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">{conference}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {confTeams.map(team => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}
