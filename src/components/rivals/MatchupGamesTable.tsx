import Image from 'next/image'
import Link from 'next/link'
import { ListBullets } from '@phosphor-icons/react/dist/ssr'
import type { MatchupGame } from '@/lib/queries/matchups'

interface TeamMeta {
  name: string
  logo: string | null
  color: string | null
}

interface MatchupGamesTableProps {
  games: MatchupGame[]
  teamAMeta: TeamMeta
  teamBMeta: TeamMeta
}

const RESULT_STYLE: Record<'W' | 'L' | 'T', { label: string; className: string }> = {
  W: { label: 'W', className: 'text-[var(--color-positive)] border-[var(--color-positive)]' },
  L: { label: 'L', className: 'text-[var(--color-negative)] border-[var(--color-negative)]' },
  T: { label: 'T', className: 'text-[var(--text-muted)] border-[var(--border)]' },
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Full game-by-game history, most recent first. The winning side's score is
// emphasized; each game links to its detail page. Result badge reads from
// teamA's perspective (icon + letter, not color alone).
export function MatchupGamesTable({ games, teamAMeta, teamBMeta }: MatchupGamesTableProps) {
  if (games.length === 0) {
    // Inline empty state: EmptyState is a client component, and passing an icon
    // function across the server->client boundary is not RSC-serializable.
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center" role="status">
        <ListBullets size={40} weight="thin" className="text-[var(--text-muted)]" aria-hidden="true" />
        <p className="text-sm font-medium text-[var(--text-primary)]">No completed games on record</p>
        <p className="text-sm text-[var(--text-muted)]">
          {teamAMeta.name} and {teamBMeta.name} have no recorded meetings.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      {/* min-w keeps columns from crushing into each other on phones -- once
          the viewport is narrower than this, overflow-x-auto kicks in and the
          table scrolls horizontally instead of wrapping/colliding. */}
      <table
        className="w-full min-w-[480px] text-sm"
        aria-label={`All meetings between ${teamAMeta.name} and ${teamBMeta.name}`}
      >
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border)]">
            <th scope="col" className="py-2 pr-4 font-medium">Season</th>
            <th scope="col" className="py-2 pr-4 font-medium">Score</th>
            <th scope="col" className="py-2 pr-4 font-medium">Site</th>
            <th scope="col" className="py-2 pr-2 font-medium text-right">Result</th>
          </tr>
        </thead>
        <tbody>
          {games.map(game => {
            const aWon = game.winner === teamAMeta.name
            const bWon = game.winner === teamBMeta.name
            const badge = RESULT_STYLE[game.result]
            const site = game.neutralSite
              ? 'Neutral'
              : game.teamAHome
                ? `${teamAMeta.name} home`
                : `${teamBMeta.name} home`

            return (
              <tr
                key={game.gameId}
                className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-surface-alt)] transition-colors"
              >
                <td className="py-3 pr-4 tabular-nums text-[var(--text-secondary)]">
                  <Link
                    href={`/games/${game.gameId}`}
                    className="hover:text-[var(--text-primary)] hover:underline"
                  >
                    {game.season}
                  </Link>
                  <div className="text-xs text-[var(--text-muted)]">{formatDate(game.startDate)}</div>
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2 min-w-0">
                    {teamAMeta.logo && (
                      <Image
                        src={teamAMeta.logo}
                        alt=""
                        width={18}
                        height={18}
                        className="object-contain flex-shrink-0"
                        unoptimized
                      />
                    )}
                    <span
                      className={`tabular-nums ${aWon ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
                    >
                      {game.teamAScore}
                    </span>
                    <span className="text-[var(--text-muted)]">–</span>
                    <span
                      className={`tabular-nums ${bWon ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
                    >
                      {game.teamBScore}
                    </span>
                    {teamBMeta.logo && (
                      <Image
                        src={teamBMeta.logo}
                        alt=""
                        width={18}
                        height={18}
                        className="object-contain flex-shrink-0"
                        unoptimized
                      />
                    )}
                  </div>
                </td>
                <td className="py-3 pr-4 text-[var(--text-muted)] whitespace-nowrap">
                  {site}
                  {game.venue && (
                    <div className="text-xs text-[var(--text-muted)]">{game.venue}</div>
                  )}
                </td>
                <td className="py-3 pr-2 text-right">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-sm border text-xs font-semibold ${badge.className}`}
                    title={`${teamAMeta.name} ${game.result === 'W' ? 'won' : game.result === 'L' ? 'lost' : 'tied'}`}
                    aria-label={`${teamAMeta.name} ${game.result === 'W' ? 'won' : game.result === 'L' ? 'lost' : 'tied'}`}
                  >
                    {badge.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
