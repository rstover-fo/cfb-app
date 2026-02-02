import { createClient } from '@/lib/supabase/server'
import { Team, TeamSeasonEpa, TeamStyleProfile } from '@/lib/types/database'
import { ScatterPlotClient } from '@/components/analytics/ScatterPlotClient'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const currentSeason = 2025

  const [teamsResult, metricsResult, stylesResult] = await Promise.all([
    supabase.from('teams_with_logos').select('*'),
    supabase.from('team_epa_season').select('*').eq('season', currentSeason),
    supabase.from('team_style_profile').select('*').eq('season', currentSeason)
  ])

  const teams = (teamsResult.data as Team[]) || []
  const metrics = (metricsResult.data as TeamSeasonEpa[]) || []
  const styles = (stylesResult.data as TeamStyleProfile[]) || []

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
        currentSeason={currentSeason}
      />
    </div>
  )
}
