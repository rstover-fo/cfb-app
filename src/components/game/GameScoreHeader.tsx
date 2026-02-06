import Image from 'next/image'
import Link from 'next/link'
import type { GameWithTeams } from '@/lib/queries/games'
import { teamNameToSlug } from '@/lib/utils'

interface GameScoreHeaderProps {
  game: GameWithTeams
}

export function GameScoreHeader({ game }: GameScoreHeaderProps) {
  const awayWon = game.away_points > game.home_points
  const homeWon = game.home_points > game.away_points

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        {/* Away Team */}
        <Link
          href={`/teams/${teamNameToSlug(game.away_team)}`}
          className="flex flex-col items-center gap-1 sm:gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity"
        >
          {game.awayLogo ? (
            <Image
              src={game.awayLogo}
              alt={game.away_team}
              width={64}
              height={64}
              className="w-10 h-10 sm:w-16 sm:h-16 object-contain"
            />
          ) : (
            <div
              className="w-10 h-10 sm:w-16 sm:h-16 rounded-full"
              style={{ backgroundColor: game.awayColor || 'var(--bg-surface-alt)' }}
            />
          )}
          <span className={`text-xs sm:text-lg font-semibold text-center truncate max-w-full ${awayWon ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
            {game.away_team}
          </span>
        </Link>

        {/* Score */}
        <div className="flex items-center gap-2 sm:gap-4 px-2 sm:px-8 shrink-0">
          <span
            className={`text-2xl sm:text-4xl font-bold tabular-nums ${
              awayWon ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
            }`}
          >
            {game.away_points}
          </span>
          <div className="flex flex-col items-center">
            <span className="text-[var(--text-muted)]">-</span>
            <span className="text-[10px] sm:text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">
              {game.completed ? 'Final' : 'Scheduled'}
            </span>
          </div>
          <span
            className={`text-2xl sm:text-4xl font-bold tabular-nums ${
              homeWon ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
            }`}
          >
            {game.home_points}
          </span>
        </div>

        {/* Home Team */}
        <Link
          href={`/teams/${teamNameToSlug(game.home_team)}`}
          className="flex flex-col items-center gap-1 sm:gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity"
        >
          {game.homeLogo ? (
            <Image
              src={game.homeLogo}
              alt={game.home_team}
              width={64}
              height={64}
              className="w-10 h-10 sm:w-16 sm:h-16 object-contain"
            />
          ) : (
            <div
              className="w-10 h-10 sm:w-16 sm:h-16 rounded-full"
              style={{ backgroundColor: game.homeColor || 'var(--bg-surface-alt)' }}
            />
          )}
          <span className={`text-xs sm:text-lg font-semibold text-center truncate max-w-full ${homeWon ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
            {game.home_team}
          </span>
        </Link>
      </div>

      {/* Conference game badge */}
      {game.conference_game && (
        <div className="mt-3 sm:mt-4 text-center">
          <span className="text-xs px-2 py-1 rounded bg-[var(--bg-surface-alt)] text-[var(--text-muted)] uppercase tracking-wider">
            Conference Game
          </span>
        </div>
      )}
    </div>
  )
}
