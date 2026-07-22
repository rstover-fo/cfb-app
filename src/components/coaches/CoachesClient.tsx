'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ChartBar } from '@phosphor-icons/react'
import type { CoachRecord, CoachSortKey } from '@/lib/queries/coaches'
import { teamNameToSlug, formatPercent } from '@/lib/utils'
import { EmptyState } from '@/components/EmptyState'

const SORT_TABS: { key: CoachSortKey; label: string }[] = [
  { key: 'win_pct', label: 'SU Win%' },
  { key: 'ats_win_pct', label: 'ATS Win%' },
]

function formatRecord(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`
}

function formatSeasons(first: number, last: number): string {
  return first === last ? String(first) : `${first}–${last}`
}

interface CoachesClientProps {
  byWinPct: CoachRecord[]
  byAtsWinPct: CoachRecord[]
}

// Both orderings are fetched server-side (page.tsx); the toggle just swaps
// which already-sorted array is displayed -- no client refetch needed.
export function CoachesClient({ byWinPct, byAtsWinPct }: CoachesClientProps) {
  const [sortBy, setSortBy] = useState<CoachSortKey>('win_pct')
  const coaches = sortBy === 'win_pct' ? byWinPct : byAtsWinPct

  return (
    <div>
      {/* Sort tabs */}
      <div className="flex items-end gap-0 mb-0">
        {SORT_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            className={`px-4 py-2 text-sm rounded-t border-b-2 transition-colors ${
              sortBy === key
                ? 'border-[var(--color-run)] text-[var(--text-primary)] bg-[var(--bg-surface)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card p-4">
        {coaches.length === 0 ? (
          <EmptyState
            icon={ChartBar}
            title="No coach data available"
            description="Coach records will appear here once the season is loaded."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm" aria-label={`Coaches ranked by ${sortBy === 'win_pct' ? 'SU' : 'ATS'} win percentage`}>
              <caption className="sr-only">
                Coach career records, ranked by {sortBy === 'win_pct' ? 'straight-up' : 'against-the-spread'} win percentage
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] text-left py-2 px-2 w-10">#</th>
                  <th scope="col" className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] text-left py-2 px-2">Coach</th>
                  <th scope="col" className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] text-left py-2 px-2">Team</th>
                  <th scope="col" className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] text-right py-2 px-2">Seasons</th>
                  <th scope="col" className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] text-right py-2 px-2">G</th>
                  <th scope="col" className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] text-right py-2 px-2">W-L</th>
                  <th scope="col" className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] text-right py-2 px-2">Win%</th>
                  <th scope="col" className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] text-right py-2 px-2">ATS W-L-P</th>
                  <th scope="col" className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] text-right py-2 px-2">ATS Win%</th>
                </tr>
              </thead>
              <tbody>
                {coaches.map((coach, idx) => {
                  const partialAts = coach.seasons_with_ats_data < coach.seasons_count
                  return (
                    <tr
                      key={`${coach.coach_name}-${coach.team}`}
                      className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-surface-alt)]"
                    >
                      <td className="py-2 px-2 tabular-nums text-[var(--text-muted)]">{idx + 1}</td>
                      <td className="py-2 px-2 text-[var(--text-primary)]">{coach.coach_name}</td>
                      <td className="py-2 px-2">
                        <Link
                          href={`/teams/${teamNameToSlug(coach.team)}`}
                          className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline"
                        >
                          {coach.logo && (
                            <Image
                              src={coach.logo}
                              alt=""
                              width={16}
                              height={16}
                              className="object-contain flex-shrink-0"
                              unoptimized
                            />
                          )}
                          {coach.team}
                        </Link>
                      </td>
                      <td className="py-2 px-2 tabular-nums text-right text-[var(--text-muted)]">
                        {formatSeasons(coach.first_season, coach.last_season)}
                      </td>
                      <td className="py-2 px-2 tabular-nums text-right">{coach.games}</td>
                      <td className="py-2 px-2 tabular-nums text-right">
                        {formatRecord(coach.wins, coach.losses, coach.ties)}
                      </td>
                      <td className="py-2 px-2 tabular-nums text-right">{formatPercent(coach.win_pct)}</td>
                      <td className="py-2 px-2 tabular-nums text-right">
                        {coach.ats_games > 0
                          ? `${coach.ats_wins}-${coach.ats_losses}-${coach.ats_pushes}`
                          : '—'}
                        {partialAts && (
                          <span className="ml-1 text-[var(--text-muted)]" title="ATS data only covers part of this coach's tenure">*</span>
                        )}
                      </td>
                      <td className="py-2 px-2 tabular-nums text-right">
                        {coach.ats_win_pct != null ? formatPercent(coach.ats_win_pct) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {coaches.some(c => c.seasons_with_ats_data < c.seasons_count) && (
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                * ATS data is only available for part of this coach&apos;s tenure at that school.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
