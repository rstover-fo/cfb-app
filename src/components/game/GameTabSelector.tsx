'use client'

import { useCallback } from 'react'

interface TabConfig {
  id: string
  label: string
}

interface GameTabSelectorProps {
  tabs: TabConfig[]
  activeTab: string
  onTabChange: (tabId: string) => void
  ariaLabel: string
}

export function GameTabSelector({ tabs, activeTab, onTabChange, ariaLabel }: GameTabSelectorProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const currentIndex = tabs.findIndex(t => t.id === activeTab)
      let nextIndex = -1

      if (e.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % tabs.length
      } else if (e.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
      }

      if (nextIndex >= 0) {
        e.preventDefault()
        onTabChange(tabs[nextIndex].id)
        // Focus the newly active tab button
        const container = e.currentTarget.parentElement
        const buttons = container?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
        buttons?.[nextIndex]?.focus()
      }
    },
    [tabs, activeTab, onTabChange],
  )

  return (
    <div className="flex gap-1.5 mb-4" role="tablist" aria-label={ariaLabel}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={handleKeyDown}
            className={`px-3 py-1.5 border-[1.5px] rounded-sm text-sm transition-all ${
              isActive
                ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
