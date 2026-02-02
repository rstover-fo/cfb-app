import { createClient } from '@/lib/supabase/server'
import type { Team, TeamSeasonEpa, TeamStyleProfile, DefensiveHavoc } from '@/lib/types/database'
import { ScatterPlotClient } from '@/components/analytics/ScatterPlotClient'

// FBS conferences only (excludes FCS, D2, etc. which often have placeholder logos)
const FBS_CONFERENCES = [
  'ACC',
  'American Athletic',
  'Big 12',
  'Big Ten',
  'Conference USA',
  'FBS Independents',
  'Mid-American',
  'Mountain West',
  'Pac-12',
  'SEC',
  'Sun Belt'
]

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const currentSeason = 2025

  const [teamsResult, metricsResult, stylesResult, havocResult] = await Promise.all([
    supabase.from('teams_with_logos').select('*').in('conference', FBS_CONFERENCES),
    supabase.from('team_epa_season').select('*').eq('season', currentSeason),
    supabase.from('team_style_profile').select('*').eq('season', currentSeason),
    supabase.from('defensive_havoc').select('*').eq('season', currentSeason)
  ])

  const teams = (teamsResult.data as Team[]) || []
  const metrics = (metricsResult.data as TeamSeasonEpa[]) || []
  const styles = (stylesResult.data as TeamStyleProfile[]) || []
  const havoc = (havocResult.data as DefensiveHavoc[]) || []

  return (
    <div className="p-8">
      <header className="mb-8 pb-6 border-b border-[var(--border)]">
        <h1 className="font-headline text-4xl text-[var(--text-primary)] underline-sketch inline-block">
          Team Analytics
        </h1>
        <p className="text-[var(--text-secondary)] mt-2">
          {currentSeason} Season · All FBS Teams
        </p>
      </header>

      <ScatterPlotClient
        teams={teams}
        metrics={metrics}
        styles={styles}
        havoc={havoc}
        currentSeason={currentSeason}
      />
    </div>
  )
}
