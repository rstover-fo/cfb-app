'use client'

import { useState } from 'react'
import { GameTabSelector } from './GameTabSelector'
import { DriveBarChart } from './DriveBarChart'
import { DriveFieldOverlay } from './DriveFieldOverlay'
import { DriveTimeline } from './DriveTimeline'
import { TabsContent } from '@/components/ui/tabs'
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
      <GameTabSelector
        tabs={DRIVE_CHART_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        ariaLabel="Drive chart view"
      >
        <TabsContent value="bar-chart">
          <DriveBarChart drives={drives} game={game} />
        </TabsContent>
        <TabsContent value="field">
          <DriveFieldOverlay drives={drives} game={game} />
        </TabsContent>
        <TabsContent value="timeline">
          <DriveTimeline drives={drives} game={game} />
        </TabsContent>
      </GameTabSelector>
    </section>
  )
}
