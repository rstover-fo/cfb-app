import Link from 'next/link'
import { teamNameToSlug } from '@/lib/utils'
import { PercentileBars } from './PercentileBars'
import type { PlayerComparisonRow } from '@/lib/queries/players'

interface PlayerCompareViewProps {
  player1: PlayerComparisonRow
  player2: PlayerComparisonRow
}

// One side of the identity header row. `align` mirrors the layout so each
// player's header reads toward the same center axis the bars grow from.
function IdentityHeader({
  player,
  accentVar,
  align,
}: {
  player: PlayerComparisonRow
  accentVar: string
  align: 'left' | 'right'
}) {
  const alignClass = align === 'right' ? 'text-right items-end' : 'text-left items-start'

  return (
    <div className={`flex flex-col gap-1 ${alignClass}`}>
      <Link
        href={`/players/${player.player_id}`}
        className="font-headline text-xl text-[var(--text-primary)] hover:underline"
        style={{ textDecorationColor: `var(${accentVar})` }}
      >
        {player.name}
      </Link>
      <div className="flex items-center gap-2 flex-wrap">
        {player.position && (
          <span className="inline-block px-2 py-0.5 text-xs rounded bg-[var(--bg-surface-alt)] text-[var(--text-secondary)] border border-[var(--border)]">
            {player.position}
          </span>
        )}
        <Link
          href={`/teams/${teamNameToSlug(player.team)}`}
          className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline transition-colors"
        >
          {player.team}
        </Link>
      </div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] tabular-nums">
        {player.season} · {player.position_group ?? 'Position group n/a'}
      </p>
    </div>
  )
}

/**
 * Side-by-side player comparison: mirrored identity headers over the
 * PercentileBars chart. Percentiles are relative to each player's own
 * position group in his own season, so a cross-group or cross-season
 * pairing stays meaningful in percentile space -- the caption below the
 * chart says which frame each side is measured in.
 */
export function PlayerCompareView({ player1, player2 }: PlayerCompareViewProps) {
  const sameGroup =
    player1.position_group != null && player1.position_group === player2.position_group
  const sameSeason = player1.season === player2.season

  const frameCaption = sameGroup && sameSeason
    ? `Bars show percentile rank among FBS ${player1.position_group}s, ${player1.season} season.`
    : `Bars show each player's percentile rank within his own position group and season (${player1.position_group ?? '—'} ${player1.season} vs ${player2.position_group ?? '—'} ${player2.season}).`

  return (
    <div className="card p-6">
      <div className="grid grid-cols-2 gap-4 mb-6 pb-4 border-b border-[var(--border)]">
        <IdentityHeader player={player1} accentVar="--color-run" align="left" />
        <IdentityHeader player={player2} accentVar="--color-pass" align="right" />
      </div>

      <PercentileBars player1={player1} player2={player2} />

      <p className="mt-4 text-xs text-[var(--text-muted)] tabular-nums text-center">
        {frameCaption}
      </p>
    </div>
  )
}
