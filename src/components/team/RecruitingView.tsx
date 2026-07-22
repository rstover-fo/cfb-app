'use client'

import { RecruitingClassHistory, RecruitingROI, Signee, PortalActivity } from '@/lib/types/database'
import type { ReturningProduction, TransferPortalImpact } from '@/lib/queries/roster-context'
import { ClassHistoryChart } from './ClassHistoryChart'
import { RecruitingROICard } from './RecruitingROICard'
import { ReturningProductionCard } from './ReturningProductionCard'
import { SigneesTable } from './SigneesTable'
import { PortalActivityPanel } from './PortalActivityPanel'

interface RecruitingViewProps {
  classHistory: RecruitingClassHistory[] | null
  roi: RecruitingROI | null
  signees: Signee[] | null
  portalActivity: PortalActivity | null
  returningProduction: ReturningProduction | null
  transferPortalImpact: TransferPortalImpact | null
  teamColor: string | null
  currentSeason: number
}

export function RecruitingView({
  classHistory,
  roi,
  signees,
  portalActivity,
  returningProduction,
  transferPortalImpact,
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
      <ReturningProductionCard production={returningProduction} />
      <RecruitingROICard roi={roi} />
      <SigneesTable signees={signees} season={currentSeason} />
      <PortalActivityPanel activity={portalActivity} impact={transferPortalImpact} season={currentSeason} />
    </div>
  )
}
