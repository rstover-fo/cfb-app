import { createClient } from '@/lib/supabase/server'
import type { Team, TeamSeasonEpa, TeamStyleProfile, DefensiveHavoc, TeamTempoMetrics, TeamRecord, TeamSpecialTeamsSos } from '@/lib/types/database'
import { ScatterPlotClient } from '@/components/analytics/ScatterPlotClient'
import { FBS_CONFERENCES } from '@/lib/queries/shared'
import { CURRENT_SEASON } from '@/lib/queries/constants'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const [teamsResult, metricsResult, stylesResult, havocResult, tempoResult, recordsResult, specialTeamsResult] = await Promise.all([
    supabase.from('teams_with_logos').select('*').in('conference', FBS_CONFERENCES as unknown as string[]),
    supabase.from('team_epa_season').select('*').eq('season', CURRENT_SEASON),
    supabase.from('team_style_profile').select('*').eq('season', CURRENT_SEASON),
    supabase.from('defensive_havoc').select('*').eq('season', CURRENT_SEASON),
    supabase.from('team_tempo_metrics').select('*').eq('season', CURRENT_SEASON),
    supabase.from('records').select('team, year, total__wins, total__losses, conference_games__wins, conference_games__losses').eq('year', CURRENT_SEASON).eq('classification', 'fbs'),
    supabase.from('team_special_teams_sos').select('*').eq('season', CURRENT_SEASON)
  ])

  const teams = (teamsResult.data as Team[]) || []
  const metrics = (metricsResult.data as TeamSeasonEpa[]) || []
  const styles = (stylesResult.data as TeamStyleProfile[]) || []
  const havoc = (havocResult.data as DefensiveHavoc[]) || []
  const tempo = (tempoResult.data as TeamTempoMetrics[]) || []
  const records = (recordsResult.data as TeamRecord[]) || []
  const specialTeams = (specialTeamsResult.data as TeamSpecialTeamsSos[]) || []

  return (
    <div className="p-8">
      <header className="mb-8 pb-6 border-b border-[var(--border)]">
        <h1 className="font-headline text-4xl text-[var(--text-primary)] underline-sketch inline-block">
          Team Analytics
        </h1>
        <p className="text-[var(--text-secondary)] mt-2">
          {CURRENT_SEASON} Season · All FBS Teams
        </p>
      </header>

      <ScatterPlotClient
        teams={teams}
        metrics={metrics}
        styles={styles}
        havoc={havoc}
        tempo={tempo}
        records={records}
        specialTeams={specialTeams}
        currentSeason={CURRENT_SEASON}
      />
    </div>
  )
}
