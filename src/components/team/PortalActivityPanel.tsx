'use client'

import { useState } from 'react'
import { Star } from '@phosphor-icons/react'
import { PortalActivity, TransferRecord } from '@/lib/types/database'

interface PortalActivityPanelProps {
  activity: PortalActivity | null
  season: number
}

type PortalTab = 'incoming' | 'outgoing'

function TransferRow({ t, showOrigin }: { t: TransferRecord; showOrigin: boolean }) {
  const school = showOrigin ? t.origin : t.destination
  const date = t.transfer_date
    ? new Date(t.transfer_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <tr className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-surface-alt)] transition-colors">
      <td className="py-2.5 px-2 text-[var(--text-primary)] font-medium">
        {t.first_name} {t.last_name}
      </td>
      <td className="py-2.5 px-2 text-center">
        <span className="px-2 py-0.5 text-xs rounded bg-[var(--bg-surface-alt)] text-[var(--text-secondary)]">
          {t.position}
        </span>
      </td>
      <td className="py-2.5 px-2 text-center">
        {t.stars !== null ? (
          <span className="inline-flex gap-0.5">
            {Array.from({ length: t.stars }, (_, j) => (
              <Star key={j} size={12} weight="fill" className="text-[var(--color-run)]" />
            ))}
          </span>
        ) : (
          <span className="text-[var(--text-muted)]">--</span>
        )}
      </td>
      <td className="py-2.5 px-2 text-[var(--text-secondary)] hidden md:table-cell">
        {school || '--'}
      </td>
      <td className="py-2.5 px-2 text-[var(--text-muted)] text-right hidden md:table-cell">
        {date || '--'}
      </td>
    </tr>
  )
}

export function PortalActivityPanel({ activity, season }: PortalActivityPanelProps) {
  const [tab, setTab] = useState<PortalTab>('incoming')

  if (!activity) {
    return (
      <section>
        <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Transfer Portal</h2>
        <p className="text-[var(--text-muted)] text-sm">
          Transfer portal data available from 2021 onward.
        </p>
      </section>
    )
  }

  const { summary } = activity
  const transfers = tab === 'incoming' ? activity.transfers_in : activity.transfers_out
  const showOrigin = tab === 'incoming'

  const noActivity = activity.transfers_in.length === 0 && activity.transfers_out.length === 0

  return (
    <section>
      <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Transfer Portal</h2>

      {noActivity && !summary ? (
        <p className="text-[var(--text-muted)] text-sm">
          No transfer portal activity for {season}.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Summary stats */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <SummaryCard label="Transfers In" value={String(summary.transfers_in)} />
              <SummaryCard label="Transfers Out" value={String(summary.transfers_out)} />
              <SummaryCard
                label="Net"
                value={(summary.net_transfers >= 0 ? '+' : '') + summary.net_transfers}
                color={summary.net_transfers >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'}
              />
              <SummaryCard
                label="Avg Stars In"
                value={summary.avg_incoming_stars !== null ? Number(summary.avg_incoming_stars).toFixed(1) : '--'}
              />
              <SummaryCard
                label="Win Delta"
                value={
                  summary.win_delta !== null
                    ? (summary.win_delta >= 0 ? '+' : '') + summary.win_delta
                    : '--'
                }
                color={
                  summary.win_delta !== null
                    ? summary.win_delta >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'
                    : undefined
                }
              />
            </div>
          )}

          {/* Incoming / Outgoing toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setTab('incoming')}
              className={`px-3 py-1.5 text-sm border-[1.5px] rounded-sm transition-all ${
                tab === 'incoming'
                  ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
              }`}
            >
              Incoming ({activity.transfers_in.length})
            </button>
            <button
              onClick={() => setTab('outgoing')}
              className={`px-3 py-1.5 text-sm border-[1.5px] rounded-sm transition-all ${
                tab === 'outgoing'
                  ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
              }`}
            >
              Outgoing ({activity.transfers_out.length})
            </button>
          </div>

          {/* Transfer table */}
          {transfers.length > 0 ? (
            <div className="border border-[var(--border)] rounded-sm bg-[var(--bg-surface)] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="py-2 px-2 text-left text-xs text-[var(--text-muted)] uppercase tracking-wide">Name</th>
                    <th className="py-2 px-2 text-center text-xs text-[var(--text-muted)] uppercase tracking-wide">Pos</th>
                    <th className="py-2 px-2 text-center text-xs text-[var(--text-muted)] uppercase tracking-wide">Stars</th>
                    <th className="py-2 px-2 text-left text-xs text-[var(--text-muted)] uppercase tracking-wide hidden md:table-cell">
                      {showOrigin ? 'From' : 'To'}
                    </th>
                    <th className="py-2 px-2 text-right text-xs text-[var(--text-muted)] uppercase tracking-wide hidden md:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((t, i) => (
                    <TransferRow key={`${t.first_name}-${t.last_name}-${i}`} t={t} showOrigin={showOrigin} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[var(--text-muted)] text-sm">
              No {tab === 'incoming' ? 'incoming' : 'outgoing'} transfers for {season}.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="border border-[var(--border)] rounded-sm bg-[var(--bg-surface)] p-3 text-center">
      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide">{label}</div>
      <div
        className="text-xl font-headline mt-1"
        style={{ color: color || 'var(--text-primary)' }}
      >
        {value}
      </div>
    </div>
  )
}
