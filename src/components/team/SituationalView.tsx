'use client'

import { useState } from 'react'
import { DownDistanceSplit } from '@/lib/types/database'
import { DownDistanceHeatmap } from '@/components/visualizations/DownDistanceHeatmap'
import { KeySituationsCards } from './KeySituationsCards'

type SubTab = 'down-distance' | 'red-zone' | 'field-position' | 'home-away' | 'vs-conference'

interface SubTabConfig {
  id: SubTab
  label: string
  enabled: boolean
}

const SUB_TABS: SubTabConfig[] = [
  { id: 'down-distance', label: 'Down & Distance', enabled: true },
  { id: 'red-zone', label: 'Red Zone', enabled: false },
  { id: 'field-position', label: 'Field Position', enabled: false },
  { id: 'home-away', label: 'Home vs Away', enabled: false },
  { id: 'vs-conference', label: 'vs Conference', enabled: false },
]

interface SituationalViewProps {
  downDistanceData: DownDistanceSplit[] | null
}

export function SituationalView({ downDistanceData }: SituationalViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('down-distance')

  return (
    <div>
      {/* Sub-navigation */}
      <nav className="flex gap-2 mb-6 border-b border-[var(--border)] pb-4">
        {SUB_TABS.map(tab => {
          const isActive = activeSubTab === tab.id
          const isDisabled = !tab.enabled

          return (
            <button
              key={tab.id}
              disabled={isDisabled}
              onClick={() => tab.enabled && setActiveSubTab(tab.id)}
              className={`px-3 py-1.5 text-sm transition-all ${
                isActive
                  ? 'text-[var(--text-primary)] border-b-2 border-[var(--color-run)] -mb-[17px] pb-[15px]'
                  : isDisabled
                  ? 'text-[var(--text-muted)] opacity-50 cursor-not-allowed'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
              {isDisabled && <span className="ml-1 text-xs">(soon)</span>}
            </button>
          )
        })}
      </nav>

      {/* Content */}
      {activeSubTab === 'down-distance' && (
        <div>
          {downDistanceData && downDistanceData.length > 0 ? (
            <>
              {/* Heatmaps */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <DownDistanceHeatmap
                  data={downDistanceData}
                  side="offense"
                  title="Offense"
                />
                <DownDistanceHeatmap
                  data={downDistanceData}
                  side="defense"
                  title="Defense"
                />
              </div>

              {/* Key Situations */}
              <KeySituationsCards data={downDistanceData} />
            </>
          ) : (
            <p className="text-[var(--text-muted)] text-center py-8">
              Down & distance data not available for this team.
            </p>
          )}
        </div>
      )}

      {activeSubTab !== 'down-distance' && (
        <p className="text-[var(--text-muted)] text-center py-8">
          Coming soon.
        </p>
      )}
    </div>
  )
}
