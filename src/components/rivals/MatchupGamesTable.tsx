import Image from 'next/image'
import Link from 'next/link'
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
    return (
      <p className="text-sm text-[var(--text-muted)] py-6 text-center">
        No completed games on record between these teams.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border)]">
            <th className="py-2 pr-4 font-medium">Season</th>
            <th className="py-2 pr-4 font-medium">Score</th>
            <th className="py-2 pr-4 font-medium">Site</th>
            <th className="py-2 pr-2 font-medium text-right">Result</th>
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
                  <div className="flex items-center gap-2">
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
                <td className="py-3 pr-4 text-[var(--text-muted)] whitespace-nowrap">{site}</td>
                <td className="py-3 pr-2 text-right">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-sm border text-xs font-semibold ${badge.className}`}
                    title={`${teamAMeta.name} ${game.result === 'W' ? 'won' : game.result === 'L' ? 'lost' : 'tied'}`}
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
