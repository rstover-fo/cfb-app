'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface TabConfig {
  id: string
  label: string
}

interface GameTabSelectorProps {
  tabs: TabConfig[]
  activeTab: string
  onTabChange: (tabId: string) => void
  ariaLabel: string
  /** Tab panels -- pass `<TabsContent value={tab.id}>` children from
   *  '@/components/ui/tabs' so Radix pairs each panel to its trigger. */
  children: ReactNode
}

export function GameTabSelector({ tabs, activeTab, onTabChange, ariaLabel, children }: GameTabSelectorProps) {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="gap-0">
      {/* Scrollable tab row (DESIGN.md "Responsive rows"): three chart tabs
          can exceed a mobile viewport -- scroll, don't clip. py-1.5 keeps the
          active accent bar and focus ring inside the scroll box. */}
      <TabsList
        aria-label={ariaLabel}
        className="mb-4 w-full justify-start overflow-x-auto scrollbar-hide py-1.5"
      >
        {tabs.map(tab => (
          <TabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  )
}
