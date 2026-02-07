'use client'

import { RecruitingClassHistory, RecruitingROI, Signee, PortalActivity } from '@/lib/types/database'
import { ClassHistoryChart } from './ClassHistoryChart'
import { RecruitingROICard } from './RecruitingROICard'
import { SigneesTable } from './SigneesTable'
import { PortalActivityPanel } from './PortalActivityPanel'

interface RecruitingViewProps {
  classHistory: RecruitingClassHistory[] | null
  roi: RecruitingROI | null
  signees: Signee[] | null
  portalActivity: PortalActivity | null
  teamColor: string | null
  currentSeason: number
}

export function RecruitingView({
  classHistory,
  roi,
  signees,
  portalActivity,
  teamColor,
  currentSeason,
}: RecruitingViewProps) {
  if (!classHistory || classHistory.length === 0) {
    return (
      <p className="text-[var(--text-muted)] py-8 text-center">
        No recruiting data available.
      </p>
    )
  }

  return (
    <div className="space-y-8">
      <ClassHistoryChart
        data={classHistory}
        currentSeason={currentSeason}
        teamColor={teamColor}
      />
      <RecruitingROICard roi={roi} />
      <SigneesTable signees={signees} season={currentSeason} />
      <PortalActivityPanel activity={portalActivity} season={currentSeason} />
    </div>
  )
}
