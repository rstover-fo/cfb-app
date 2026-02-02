'use client'

import { ScheduleGame } from '@/lib/types/database'

interface ScheduleViewProps {
  schedule: ScheduleGame[] | null
  teamColor: string | null
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function GameRow({ game, teamColor }: { game: ScheduleGame; teamColor: string | null }) {
  const resultColor = game.result === 'W'
    ? 'var(--color-positive)'
    : game.result === 'L'
    ? 'var(--color-negative)'
    : 'var(--text-muted)'

  return (
    <div className="flex items-center gap-4 py-4 border-b border-[var(--border)] last:border-b-0">
      {/* Week */}
      <div className="w-12 text-center">
        <span className="text-sm text-[var(--text-muted)]">Wk {game.week}</span>
      </div>

      {/* Date */}
      <div className="w-16 text-sm text-[var(--text-secondary)]">
        {formatDate(game.start_date)}
      </div>

      {/* Opponent */}
      <div className="flex-1 flex items-center gap-3">
        {game.opponent_logo ? (
          <img
            src={game.opponent_logo}
            alt={game.opponent}
            className="w-8 h-8 object-contain"
          />
        ) : (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs text-white font-medium"
            style={{ backgroundColor: teamColor || 'var(--text-muted)' }}
          >
            {game.opponent.slice(0, 2)}
          </div>
        )}
        <div>
          <span className="text-sm text-[var(--text-muted)] mr-1">
            {game.is_home ? 'vs' : '@'}
          </span>
          <span className="text-[var(--text-primary)] font-medium">
            {game.opponent}
          </span>
          {game.conference_game && (
            <span className="ml-2 text-xs text-[var(--text-muted)]">*</span>
          )}
        </div>
      </div>

      {/* Score */}
      <div className="w-24 text-right">
        {game.completed ? (
          <div className="flex items-center justify-end gap-2">
            <span
              className="font-medium text-lg"
              style={{ color: resultColor }}
            >
              {game.result}
            </span>
            <span className="text-[var(--text-secondary)]">
              {game.team_score}-{game.opponent_score}
            </span>
          </div>
        ) : (
          <span className="text-sm text-[var(--text-muted)]">TBD</span>
        )}
      </div>
    </div>
  )
}

export function ScheduleView({ schedule, teamColor }: ScheduleViewProps) {
  if (!schedule || schedule.length === 0) {
    return (
      <p className="text-[var(--text-muted)] text-center py-8">
        Schedule data not available for this team.
      </p>
    )
  }

  const wins = schedule.filter(g => g.result === 'W').length
  const losses = schedule.filter(g => g.result === 'L').length
  const confWins = schedule.filter(g => g.conference_game && g.result === 'W').length
  const confLosses = schedule.filter(g => g.conference_game && g.result === 'L').length

  return (
    <div>
      {/* Record Summary */}
      <div className="flex gap-6 mb-6">
        <div>
          <span className="text-2xl font-headline text-[var(--text-primary)]">
            {wins}-{losses}
          </span>
          <span className="text-sm text-[var(--text-muted)] ml-2">Overall</span>
        </div>
        <div>
          <span className="text-2xl font-headline text-[var(--text-primary)]">
            {confWins}-{confLosses}
          </span>
          <span className="text-sm text-[var(--text-muted)] ml-2">Conference</span>
        </div>
      </div>

      {/* Games List */}
      <div className="card p-4">
        {schedule.map(game => (
          <GameRow key={game.id} game={game} teamColor={teamColor} />
        ))}
      </div>

      <p className="text-xs text-[var(--text-muted)] mt-4">
        * Conference game
      </p>
    </div>
  )
}
