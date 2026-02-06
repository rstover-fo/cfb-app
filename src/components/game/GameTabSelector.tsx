'use client'

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
  return (
    <nav className="flex gap-1.5 mb-4" role="tablist" aria-label={ariaLabel}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
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
    </nav>
  )
}
