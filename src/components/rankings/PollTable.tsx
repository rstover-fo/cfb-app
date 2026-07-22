'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Trophy } from '@phosphor-icons/react'
import { teamNameToSlug } from '@/lib/utils'
import { EmptyState } from '@/components/EmptyState'
import type { EnrichedPollRanking } from '@/lib/types/database'

interface PollTableProps {
  rankings: EnrichedPollRanking[]
  poll: string
}

function MovementBadge({ movement }: { movement: number | null }) {
  if (movement === null) {
    return (
      <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded text-[var(--color-positive)] bg-[var(--color-positive)]/10" aria-label="New to rankings">
        NEW
      </span>
    )
  }
  if (movement > 0) {
    return <span className="text-xs tabular-nums" style={{ color: 'var(--color-positive)' }} aria-label={`Up ${movement}`}>&#9650;{movement}</span>
  }
  if (movement < 0) {
    return <span className="text-xs tabular-nums" style={{ color: 'var(--color-negative)' }} aria-label={`Down ${Math.abs(movement)}`}>&#9660;{Math.abs(movement)}</span>
  }
  return <span className="text-xs text-[var(--text-muted)]" aria-label="No change">&mdash;</span>
}

export function PollTable({ rankings, poll }: PollTableProps) {
  const router = useRouter()

  if (rankings.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="No rankings for this week"
        description={`${poll} hasn't published a ranking for the selected week yet. Try a different week or poll.`}
      />
    )
  }

  return (
    // overflow-x-auto: wide poll weeks scroll inside this wrapper on narrow
    // viewports, never the page (DESIGN.md "Responsive rows").
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label={`${poll} rankings`}>
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            <th className="text-right pr-3 py-2 font-normal w-8">#</th>
            <th className="py-2 font-normal w-12" />
            <th className="text-left py-2 font-normal">Team</th>
            <th className="text-left py-2 font-normal hidden sm:table-cell">Conference</th>
            <th className="text-right py-2 font-normal pr-3">Record</th>
            <th className="text-right py-2 font-normal">Points</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((ranking) => (
            <tr
              key={`${ranking.school}-${ranking.rank}`}
              className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-surface-alt)] focus-within:bg-[var(--bg-surface-alt)] cursor-pointer transition-colors"
              tabIndex={0}
              role="link"
              aria-label={`${ranking.school}, ranked ${ranking.rank}`}
              onClick={() => router.push(`/teams/${teamNameToSlug(ranking.school)}`)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/teams/${teamNameToSlug(ranking.school)}`) } }}
            >
              <td className="text-right pr-3 py-2.5 tabular-nums text-[var(--text-muted)]">
                {ranking.rank}
              </td>
              <td className="py-2.5 w-12">
                <MovementBadge movement={ranking.movement} />
              </td>
              <td className="py-2.5">
                <div className="flex items-center gap-2">
                  {ranking.logo ? (
                    <Image
                      src={ranking.logo}
                      alt={ranking.school}
                      width={24}
                      height={24}
                      className="w-6 h-6 object-contain"
                      unoptimized
                    />
                  ) : (
                    <div
                      className="w-6 h-6 rounded-full"
                      style={{ backgroundColor: ranking.color || 'var(--bg-surface-alt)' }}
                    />
                  )}
                  <span className="text-[var(--text-primary)]">{ranking.school}</span>
                </div>
              </td>
              <td className="py-2.5 text-[var(--text-muted)] hidden sm:table-cell">
                {ranking.conference}
              </td>
              <td className="text-right py-2.5 pr-3 tabular-nums">
                {ranking.wins}-{ranking.losses}
              </td>
              <td className="text-right py-2.5 tabular-nums">
                {ranking.points}
                {ranking.rank === 1 && ranking.first_place_votes > 0 && (
                  <span className="text-[var(--text-muted)] ml-1">
                    ({ranking.first_place_votes})
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
