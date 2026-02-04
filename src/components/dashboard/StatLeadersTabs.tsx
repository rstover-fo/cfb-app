'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { StatLeadersData, StatLeader } from '@/lib/queries/dashboard'
import { teamNameToSlug } from '@/lib/utils'

type TabKey = 'epa' | 'havoc' | 'successRate' | 'explosiveness'

const TABS: { key: TabKey; label: string; format: (v: number) => string }[] = [
  { key: 'epa', label: 'EPA', format: (v) => (v > 0 ? '+' : '') + v.toFixed(2) },
  { key: 'havoc', label: 'Havoc', format: (v) => (v * 100).toFixed(1) + '%' },
  { key: 'successRate', label: 'Success', format: (v) => (v * 100).toFixed(1) + '%' },
  { key: 'explosiveness', label: 'Explosive', format: (v) => v.toFixed(2) },
]

function LeaderRow({
  leader,
  rank,
  format,
}: {
  leader: StatLeader
  rank: number
  format: (v: number) => string
}) {
  return (
    <Link
      href={`/teams/${teamNameToSlug(leader.team)}`}
      className="flex items-center gap-3 py-2 px-1 -mx-1 rounded hover:bg-[var(--bg-surface-alt)] transition-colors"
    >
      {/* Rank */}
      <span className="w-5 text-sm font-medium text-[var(--text-muted)] tabular-nums text-right">
        {rank}
      </span>

      {/* Team logo */}
      {leader.logo ? (
        <Image
          src={leader.logo}
          alt={leader.team}
          width={24}
          height={24}
          className="w-6 h-6 object-contain"
        />
      ) : (
        <div
          className="w-6 h-6 rounded-full"
          style={{ backgroundColor: leader.color || 'var(--bg-surface-alt)' }}
        />
      )}

      {/* Team name */}
      <span className="flex-1 text-sm text-[var(--text-primary)] truncate">
        {leader.team}
      </span>

      {/* Value */}
      <span className="text-sm font-medium text-[var(--text-primary)] tabular-nums">
        {format(leader.value)}
      </span>
    </Link>
  )
}

interface StatLeadersTabsProps {
  data: StatLeadersData
}

export function StatLeadersTabs({ data }: StatLeadersTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('epa')

  const currentTab = TABS.find((t) => t.key === activeTab)!
  const leaders = data[activeTab]

  return (
    <>
      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              activeTab === tab.key
                ? 'bg-[var(--bg-surface-alt)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Leaders list */}
      {leaders.length > 0 ? (
        <div className="space-y-0.5">
          {leaders.map((leader, i) => (
            <LeaderRow
              key={leader.team}
              leader={leader}
              rank={i + 1}
              format={currentTab.format}
            />
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">
          No data available
        </div>
      )}
    </>
  )
}
