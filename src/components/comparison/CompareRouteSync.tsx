'use client'

import { useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import type { Team, TeamSeasonEpa, TeamStyleProfile } from '@/lib/types/database'
import { teamNameToSlug } from '@/lib/utils'
import { CompareView } from '@/components/team/CompareView'

interface CompareRouteSyncProps {
  team1: Team | null
  metrics1: TeamSeasonEpa | null
  style1: TeamStyleProfile | null
  team2: Team | null
  metrics2: TeamSeasonEpa | null
  style2: TeamStyleProfile | null
  allTeams: Team[]
  season: number
}

// Client-side bridge between CompareView (shared with the team-page Compare
// tab) and the /compare route's URL. Keeps ?t1=&t2= in sync as the user
// changes teams so the comparison stays shareable via a plain link. Router
// hooks live here (not in CompareView) so CompareView stays agnostic of
// routing and works unchanged as the team-page tab.
export function CompareRouteSync({
  team1,
  metrics1,
  style1,
  team2,
  metrics2,
  style2,
  allTeams,
  season
}: CompareRouteSyncProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const handleSelectionChange = useCallback((team1Id: number | null, team2Id: number | null) => {
    const t1School = allTeams.find(t => t.id === team1Id)?.school
    const t2School = allTeams.find(t => t.id === team2Id)?.school

    const params = new URLSearchParams(searchParams.toString())
    if (t1School) {
      params.set('t1', teamNameToSlug(t1School))
    } else {
      params.delete('t1')
    }
    if (t2School) {
      params.set('t2', teamNameToSlug(t2School))
    } else {
      params.delete('t2')
    }

    const query = params.toString()
    const nextUrl = query ? `${pathname}?${query}` : pathname
    const currentUrl = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname
    if (nextUrl === currentUrl) return

    router.replace(nextUrl, { scroll: false })
  }, [allTeams, pathname, router, searchParams])

  return (
    <CompareView
      team={team1}
      metrics={metrics1}
      style={style1}
      compareTeam={team2}
      compareMetrics={metrics2}
      compareStyle={style2}
      allTeams={allTeams}
      currentSeason={season}
      allowTeam1Change
      onSelectionChange={handleSelectionChange}
    />
  )
}
