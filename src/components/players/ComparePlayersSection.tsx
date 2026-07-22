import { UsersThree } from '@phosphor-icons/react/dist/ssr'
import { getPlayerComparison } from '@/lib/queries/players'
import { PlayerComparePicker, type SelectedComparePlayer } from './PlayerComparePicker'
import { PlayerCompareView } from './PlayerCompareView'
import type { PlayerComparisonRow } from '@/lib/queries/players'

interface ComparePlayersSectionProps {
  p1?: string
  p2?: string
}

function toSelected(row: PlayerComparisonRow | null): SelectedComparePlayer | null {
  if (!row) return null
  return {
    player_id: row.player_id,
    name: row.name,
    team: row.team,
    position: row.position,
    season: row.season,
  }
}

// Server-fetched core of the /players/compare route -- resolves the
// ?p1=&p2= player ids to their api.player_comparison rows (each at the
// player's latest available season), renders the two picker slots, and
// hands both rows to PlayerCompareView once the pairing is complete.
export async function ComparePlayersSection({ p1, p2 }: ComparePlayersSectionProps) {
  const [row1, row2] = await Promise.all([
    p1 ? getPlayerComparison(p1) : Promise.resolve(null),
    p2 ? getPlayerComparison(p2) : Promise.resolve(null),
  ])

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <PlayerComparePicker
          slot="p1"
          label="Player 1"
          selected={toSelected(row1)}
          missing={Boolean(p1) && !row1}
        />
        <PlayerComparePicker
          slot="p2"
          label="Player 2"
          selected={toSelected(row2)}
          missing={Boolean(p2) && !row2}
        />
      </div>

      {row1 && row2 ? (
        <PlayerCompareView player1={row1} player2={row2} />
      ) : (
        // Inline empty state (icon components aren't RSC-serializable, so a
        // server component can't pass one to EmptyState -- see DESIGN.md).
        <div
          role="status"
          aria-live="polite"
          className="card flex flex-col items-center justify-center text-center gap-3 py-10 px-4"
        >
          <UsersThree size={40} weight="thin" className="text-[var(--text-muted)]" aria-hidden="true" />
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {row1 || row2
              ? 'One more to go — pick a second player to compare.'
              : 'Pick two players to compare — search each slot above.'}
          </p>
        </div>
      )}
    </div>
  )
}
