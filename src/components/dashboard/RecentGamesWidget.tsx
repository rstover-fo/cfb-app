import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { getRecentGames, type RecentGame } from '@/lib/queries/dashboard'
import { teamNameToSlug } from '@/lib/utils'

const CURRENT_SEASON = 2025

function GameRow({ game, index }: { game: RecentGame; index: number }) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div
      className="flex items-center gap-3 py-2 px-1 -mx-1 rounded"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Away team */}
      <Link
        href={`/teams/${teamNameToSlug(game.awayTeam)}`}
        className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity"
      >
        {game.awayLogo ? (
          <Image
            src={game.awayLogo}
            alt={game.awayTeam}
            width={20}
            height={20}
            className="w-5 h-5 object-contain flex-shrink-0"
          />
        ) : (
          <div
            className="w-5 h-5 rounded-full flex-shrink-0"
            style={{ backgroundColor: game.awayColor || 'var(--bg-surface-alt)' }}
          />
        )}
        <span
          className={`text-sm truncate ${
            game.winner === 'away'
              ? 'font-medium text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)]'
          }`}
        >
          {game.awayTeam}
        </span>
      </Link>

      {/* Score */}
      <div className="flex items-center gap-1 text-sm tabular-nums">
        <span
          className={
            game.winner === 'away'
              ? 'font-medium text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)]'
          }
        >
          {game.awayPoints}
        </span>
        <span className="text-[var(--text-muted)]">-</span>
        <span
          className={
            game.winner === 'home'
              ? 'font-medium text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)]'
          }
        >
          {game.homePoints}
        </span>
      </div>

      {/* Home team */}
      <Link
        href={`/teams/${teamNameToSlug(game.homeTeam)}`}
        className="flex items-center gap-2 flex-1 min-w-0 justify-end hover:opacity-80 transition-opacity"
      >
        <span
          className={`text-sm truncate ${
            game.winner === 'home'
              ? 'font-medium text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)]'
          }`}
        >
          {game.homeTeam}
        </span>
        {game.homeLogo ? (
          <Image
            src={game.homeLogo}
            alt={game.homeTeam}
            width={20}
            height={20}
            className="w-5 h-5 object-contain flex-shrink-0"
          />
        ) : (
          <div
            className="w-5 h-5 rounded-full flex-shrink-0"
            style={{ backgroundColor: game.homeColor || 'var(--bg-surface-alt)' }}
          />
        )}
      </Link>

      {/* Date and conference badge */}
      <div className="flex items-center gap-2 ml-2">
        {game.conferenceGame && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-surface-alt)] text-[var(--text-muted)] uppercase tracking-wider">
            Conf
          </span>
        )}
        <span className="text-xs text-[var(--text-muted)] w-14 text-right">
          {formatDate(game.date)}
        </span>
      </div>
    </div>
  )
}

export async function RecentGamesWidget() {
  const games = await getRecentGames(CURRENT_SEASON, 5)

  const hasData = games.length > 0

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-medium text-[var(--text-muted)]">Recent Games</h2>
        <span
          className="flex items-center gap-1 text-xs text-[var(--text-muted)] cursor-not-allowed opacity-50"
          title="Coming soon"
        >
          View All
          <ArrowRight size={12} weight="thin" />
        </span>
      </div>

      {hasData ? (
        <div className="space-y-1">
          {games.map((game, i) => (
            <GameRow key={game.id} game={game} index={i} />
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">
          No recent games available
        </div>
      )}
    </div>
  )
}
