import { createClient } from '@/lib/supabase/server'
import { TeamList } from '@/components/TeamList'
import { Team } from '@/lib/types/database'

export default async function Home() {
  const supabase = await createClient()
  const { data: teams, error } = await supabase
    .schema('ref')
    .from('teams')
    .select('*')
    .not('conference', 'is', null)
    .order('school')

  if (error) {
    return <div className="p-8 text-red-500">Error loading teams: {error.message}</div>
  }

  return (
    <main className="max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-2">CFB Team 360</h1>
      <p className="text-gray-600 mb-8">Select a team to view analytics</p>

      <TeamList teams={teams as Team[]} />
    </main>
  )
}
