import { createClient } from '@/lib/supabase/server'
import { TeamList } from '@/components/TeamList'
import { Team } from '@/lib/types/database'

export default async function Home() {
  const supabase = await createClient()

  const { data: teams, error } = await supabase
    .from('teams')
    .select('*')
    .order('school')

  if (error) {
    console.error('Error fetching teams:', error)
  }

  return (
    <div className="p-8">
      {/* Page Header */}
      <header className="mb-8">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          Teams
        </h1>
      </header>

      {/* Team Grid */}
      <TeamList teams={(teams as Team[]) || []} />
    </div>
  )
}
