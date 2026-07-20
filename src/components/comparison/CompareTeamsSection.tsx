import { getAllTeams, resolveTeamBySlug, getCompareTeamMetrics } from '@/lib/queries/compare'
import { CompareRouteSync } from './CompareRouteSync'
import type { Team, TeamSeasonEpa, TeamStyleProfile } from '@/lib/types/database'

interface CompareTeamsSectionProps {
  t1?: string
  t2?: string
  season: number
}

interface ResolvedSide {
  team: Team | null
  metrics: TeamSeasonEpa | null
  style: TeamStyleProfile | null
}

async function resolveSide(allTeams: Team[], slug: string | undefined, season: number): Promise<ResolvedSide> {
  const team = resolveTeamBySlug(allTeams, slug)
  if (!team || !team.school) {
    return { team: null, metrics: null, style: null }
  }

  const { metrics, style } = await getCompareTeamMetrics(team.school, season)
  return { team, metrics, style }
}

// Server-fetched core of the /compare route -- resolves the ?t1=&t2= slugs
// to teams and their current-season EPA/style metrics, then hands off to the
// client-side CompareRouteSync (which renders the shared CompareView and
// keeps the URL in sync as the user changes teams).
export async function CompareTeamsSection({ t1, t2, season }: CompareTeamsSectionProps) {
  const allTeams = await getAllTeams()
  const [side1, side2] = await Promise.all([
    resolveSide(allTeams, t1, season),
    resolveSide(allTeams, t2, season)
  ])

  return (
    <CompareRouteSync
      team1={side1.team}
      metrics1={side1.metrics}
      style1={side1.style}
      team2={side2.team}
      metrics2={side2.metrics}
      style2={side2.style}
      allTeams={allTeams}
      season={season}
    />
  )
}
