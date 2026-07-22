'use client'

import { useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ChartBar } from '@phosphor-icons/react'
import type { CoachRecord, CoachSortKey } from '@/lib/queries/coaches'
import { teamNameToSlug, formatPercent } from '@/lib/utils'
import { EmptyState } from '@/components/EmptyState'
import { CoachHistoryDialog, type SelectedCoach } from '@/components/coaches/CoachHistoryDialog'

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

type CoachScope = 'active' | 'all'

const SCOPE_TABS: { key: CoachScope; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'all', label: 'All-time' },
]

interface CoachesClientProps {
  byWinPct: CoachRecord[]
  byAtsWinPct: CoachRecord[]
  activeByWinPct: CoachRecord[]
  activeByAtsWinPct: CoachRecord[]
}

// All four sort x scope lists are fetched server-side (page.tsx); the toggles
// just swap which already-sorted array is displayed -- no client refetch.
export function CoachesClient({ byWinPct, byAtsWinPct, activeByWinPct, activeByAtsWinPct }: CoachesClientProps) {
  const [sortBy, setSortBy] = useState<CoachSortKey>('win_pct')
  const [selectedCoach, setSelectedCoach] = useState<SelectedCoach | null>(null)
  const [scope, setScope] = useState<CoachScope>('active')
  const coaches = scope === 'active'
    ? (sortBy === 'win_pct' ? activeByWinPct : activeByAtsWinPct)
    : (sortBy === 'win_pct' ? byWinPct : byAtsWinPct)

  // api.coaching_history has no coach-id column -- first_name/last_name is
  // the only join key it shares with api.coach_records (see getCoachingHistory
  // in src/lib/queries/coaches.ts). A row missing either isn't clickable.
  function openHistory(coach: CoachRecord) {
    if (!coach.first_name || !coach.last_name) return
    setSelectedCoach({ firstName: coach.first_name, lastName: coach.last_name, displayName: coach.coach_name })
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, coach: CoachRecord) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openHistory(coach)
    }
  }

  return (
    <div>
      {/* Sort tabs + active/all-time scope toggle */}
      <div className="flex items-end justify-between gap-2 mb-0 flex-wrap">
        <div className="flex items-end gap-0">
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
        <div className="flex items-center gap-1 pb-1" role="group" aria-label="Coach scope">
          {SCOPE_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setScope(key)}
              aria-pressed={scope === key}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                scope === key
                  ? 'border-[var(--color-run)] text-[var(--text-primary)] bg-[var(--bg-surface)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
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
                  const clickable = Boolean(coach.first_name && coach.last_name)
                  return (
                    <tr
                      key={`${coach.coach_name}-${coach.team}`}
                      // NOTE: deliberately no role="button" override here --
                      // that would replace the <tr>'s implicit "row" role and
                      // break every getAllByRole('row') query in this file's
                      // and the page's tests. tabIndex + onKeyDown alone still
                      // make the row keyboard-focusable and activatable.
                      className={`border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-surface-alt)] ${clickable ? 'cursor-pointer' : ''}`}
                      onClick={clickable ? () => openHistory(coach) : undefined}
                      onKeyDown={clickable ? event => handleRowKeyDown(event, coach) : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      aria-label={clickable ? `View ${coach.coach_name}'s coaching history` : undefined}
                    >
                      <td className="py-2 px-2 tabular-nums text-[var(--text-muted)]">{idx + 1}</td>
                      <td className="py-2 px-2 text-[var(--text-primary)]">{coach.coach_name}</td>
                      <td className="py-2 px-2">
                        <Link
                          href={`/teams/${teamNameToSlug(coach.team)}`}
                          onClick={event => event.stopPropagation()}
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

      <CoachHistoryDialog
        coach={selectedCoach}
        onOpenChange={open => {
          if (!open) setSelectedCoach(null)
        }}
      />
    </div>
  )
}
