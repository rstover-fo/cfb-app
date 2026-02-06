'use client'

import { useState } from 'react'
import { GameTabSelector } from './GameTabSelector'
import { DriveBarChart } from './DriveBarChart'
import { DriveFieldOverlay } from './DriveFieldOverlay'
import { DriveTimeline } from './DriveTimeline'
import type { GameDrive } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'

const DRIVE_CHART_TABS = [
  { id: 'bar-chart', label: 'Bar Chart' },
  { id: 'field', label: 'Field View' },
  { id: 'timeline', label: 'Timeline' },
]

interface DriveChartProps {
  drives: GameDrive[]
  game: GameWithTeams
}

export function DriveChart({ drives, game }: DriveChartProps) {
  const [activeTab, setActiveTab] = useState('bar-chart')

  return (
    <section>
      <h3 className="font-headline text-lg mb-3 text-[var(--text-primary)]">
        Drive Chart
      </h3>
      <GameTabSelector
        tabs={DRIVE_CHART_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        ariaLabel="Drive chart view"
      />
      <div role="tabpanel" id={`tabpanel-${activeTab}`}>
        {activeTab === 'bar-chart' && (
          <DriveBarChart drives={drives} game={game} />
        )}
        {activeTab === 'field' && (
          <DriveFieldOverlay drives={drives} game={game} />
        )}
        {activeTab === 'timeline' && (
          <DriveTimeline drives={drives} game={game} />
        )}
      </div>
    </section>
  )
}
