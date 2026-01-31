import { createClient } from '@/lib/supabase/server'
import { TeamList } from '@/components/TeamList'
import { Team } from '@/lib/types/database'

export default async function Home() {
  const supabase = await createClient()

  // Fetch FBS/FCS teams
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('*')
    .in('classification', ['fbs', 'fcs'])
    .order('school')

  // Fetch 2024 metrics for all teams
  const { data: metrics, error: metricsError } = await supabase
    .from('team_epa_season')
    .select('team, epa_per_play, off_epa_rank')
    .eq('season', 2024)

  // Fetch win/loss records
  const { data: records, error: recordsError } = await supabase
    .from('team_season_trajectory')
    .select('team, wins, games')
    .eq('season', 2024)

  if (teamsError) console.error('Error fetching teams:', teamsError)
  if (metricsError) console.error('Error fetching metrics:', metricsError)
  if (recordsError) console.error('Error fetching records:', recordsError)

  // Build metrics lookup map
  const metricsMap = new Map<string, { epa: number; rank: number; wins: number; losses: number }>()

  metrics?.forEach(m => {
    metricsMap.set(m.team, {
      epa: m.epa_per_play,
      rank: m.off_epa_rank,
      wins: 0,
      losses: 0
    })
  })

  records?.forEach(r => {
    const existing = metricsMap.get(r.team)
    if (existing) {
      existing.wins = r.wins ?? 0
      existing.losses = (r.games ?? 0) - (r.wins ?? 0)
    } else {
      metricsMap.set(r.team, {
        epa: 0,
        rank: 0,
        wins: r.wins ?? 0,
        losses: (r.games ?? 0) - (r.wins ?? 0)
      })
    }
  })

  return (
    <div className="p-8">
      {/* Page Header */}
      <header className="mb-8">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          Teams
        </h1>
      </header>

      {/* Team Grid */}
      <TeamList
        teams={(teams as Team[]) || []}
        metricsMap={Object.fromEntries(metricsMap)}
      />
    </div>
  )
}
