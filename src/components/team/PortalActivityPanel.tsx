'use client'

import { useState } from 'react'
import { Star } from '@phosphor-icons/react'
import { PortalActivity, TransferRecord } from '@/lib/types/database'
import { formatPercent } from '@/lib/utils'
import type { TransferPortalImpact } from '@/lib/queries/roster-context'

interface PortalActivityPanelProps {
  activity: PortalActivity | null
  /** League-wide portal-impact percentiles from api.transfer_portal_impact
   *  -- additive context alongside the RPC-sourced activity list above, not
   *  a replacement for it. Renders its own section only when present. */
  impact: TransferPortalImpact | null
  season: number
}

// "62nd percentile" caption, or null when the view hasn't scored this stat
// for the team/season (e.g. too few FBS teams with portal data yet).
function pctlCaption(pctl: number | null): string | null {
  if (pctl == null) return null
  const pct = Math.round(pctl * 100)
  const suffix = pct % 10 === 1 && pct % 100 !== 11
    ? 'st'
    : pct % 10 === 2 && pct % 100 !== 12
      ? 'nd'
      : pct % 10 === 3 && pct % 100 !== 13
        ? 'rd'
        : 'th'
  return `${pct}${suffix} percentile`
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}`
}

type PortalTab = 'incoming' | 'outgoing'

function TransferRow({ t, showOrigin }: { t: TransferRecord; showOrigin: boolean }) {
  const school = showOrigin ? t.origin : t.destination
  const date = t.transfer_date
    ? new Date(t.transfer_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <tr className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-surface-alt)] transition-colors">
      <th scope="row" className="py-2.5 px-2 text-left font-medium text-[var(--text-primary)]">
        {t.first_name} {t.last_name}
      </th>
      <td className="py-2.5 px-2 text-center">
        <span className="px-2 py-0.5 text-xs rounded bg-[var(--bg-surface-alt)] text-[var(--text-secondary)]">
          {t.position}
        </span>
      </td>
      <td className="py-2.5 px-2 text-center">
        {t.stars !== null ? (
          <span className="inline-flex gap-0.5" aria-label={`${t.stars} star${t.stars === 1 ? '' : 's'}`}>
            {Array.from({ length: t.stars }, (_, j) => (
              <Star key={j} size={12} weight="fill" className="text-[var(--color-run)]" aria-hidden="true" />
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

export function PortalActivityPanel({ activity, impact, season }: PortalActivityPanelProps) {
  const [tab, setTab] = useState<PortalTab>('incoming')

  // League-context row: net transfers, portal dependency, and win delta vs.
  // the rest of FBS, each with its percentile as a muted caption. Additive
  // to (never gated on) the RPC-sourced activity list -- renders whenever
  // the portal-impact view has a row, even if the activity list is empty.
  const leagueContext = impact && (
    <div className="mb-4">
      <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">
        FBS Percentile Context
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard
          label="Net Transfers"
          value={impact.net_transfers !== null ? signed(impact.net_transfers) : '--'}
          color={impact.net_transfers !== null
            ? (impact.net_transfers >= 0 ? 'var(--color-positive)' : 'var(--color-negative)')
            : undefined}
          caption={pctlCaption(impact.net_transfers_pctl)}
        />
        <SummaryCard
          label="Portal Dependency"
          value={impact.portal_dependency !== null ? formatPercent(impact.portal_dependency) : '--'}
          caption={pctlCaption(impact.portal_dependency_pctl)}
        />
        <SummaryCard
          label="Win Δ"
          value={impact.win_delta !== null ? signed(impact.win_delta) : '--'}
          color={impact.win_delta !== null
            ? (impact.win_delta >= 0 ? 'var(--color-positive)' : 'var(--color-negative)')
            : undefined}
          caption={pctlCaption(impact.win_delta_pctl)}
        />
      </div>
    </div>
  )

  if (!activity) {
    return (
      <section>
        <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Transfer Portal</h2>
        {leagueContext}
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

      {leagueContext}

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
              <table className="w-full text-sm" aria-label={`${tab === 'incoming' ? 'Incoming' : 'Outgoing'} transfer portal activity for ${season}`}>
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th scope="col" className="py-2 px-2 text-left text-xs text-[var(--text-muted)] uppercase tracking-wide">Name</th>
                    <th scope="col" className="py-2 px-2 text-center text-xs text-[var(--text-muted)] uppercase tracking-wide">Pos</th>
                    <th scope="col" className="py-2 px-2 text-center text-xs text-[var(--text-muted)] uppercase tracking-wide">Stars</th>
                    <th scope="col" className="py-2 px-2 text-left text-xs text-[var(--text-muted)] uppercase tracking-wide hidden md:table-cell">
                      {showOrigin ? 'From' : 'To'}
                    </th>
                    <th scope="col" className="py-2 px-2 text-right text-xs text-[var(--text-muted)] uppercase tracking-wide hidden md:table-cell">Date</th>
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

function SummaryCard({ label, value, color, caption }: { label: string; value: string; color?: string; caption?: string | null }) {
  return (
    <div className="border border-[var(--border)] rounded-sm bg-[var(--bg-surface)] p-3 text-center">
      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide">{label}</div>
      <div
        className="text-xl font-headline mt-1"
        style={{ color: color || 'var(--text-primary)' }}
      >
        {value}
      </div>
      {caption && (
        <div className="text-[10px] text-[var(--text-muted)] mt-1 tabular-nums">{caption}</div>
      )}
    </div>
  )
}
