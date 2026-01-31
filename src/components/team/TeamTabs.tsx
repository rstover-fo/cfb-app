'use client'

import { useState, ReactNode } from 'react'

export type TabId = 'overview' | 'situational' | 'schedule' | 'roster' | 'compare'

interface Tab {
  id: TabId
  label: string
  enabled: boolean
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Overview', enabled: true },
  { id: 'situational', label: 'Situational', enabled: true },
  { id: 'schedule', label: 'Schedule', enabled: false },
  { id: 'roster', label: 'Roster', enabled: false },
  { id: 'compare', label: 'Compare', enabled: false },
]

interface TeamTabsProps {
  children: (activeTab: TabId) => ReactNode
}

export function TeamTabs({ children }: TeamTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  return (
    <div>
      {/* Tab Navigation */}
      <nav className="flex gap-2 mb-6" role="tablist" aria-label="Team page sections">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          const isDisabled = !tab.enabled

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              disabled={isDisabled}
              onClick={() => tab.enabled && setActiveTab(tab.id)}
              className={`px-4 py-2 border-[1.5px] rounded-sm text-sm transition-all ${
                isActive
                  ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                  : isDisabled
                  ? 'border-[var(--border)] text-[var(--text-muted)] opacity-50 cursor-not-allowed'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
              }`}
            >
              {tab.label}
              {isDisabled && <span className="ml-1 text-xs">(soon)</span>}
            </button>
          )
        })}
      </nav>

      {/* Tab Content */}
      <div
        id={`tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
      >
        {children(activeTab)}
      </div>
    </div>
  )
}
