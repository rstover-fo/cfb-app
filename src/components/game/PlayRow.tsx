import type { GamePlay } from '@/lib/types/database'

interface PlayRowProps {
  play: GamePlay
}

function formatDown(down: number): string {
  switch (down) {
    case 1: return '1st'
    case 2: return '2nd'
    case 3: return '3rd'
    case 4: return '4th'
    default: return `${down}th`
  }
}

export function PlayRow({ play }: PlayRowProps) {
  const isScoring = play.scoring
  const isTurnover = play.play_type?.includes('Interception') || play.play_type?.includes('Fumble')
  const isBigPlay = (play.yards_gained ?? 0) >= 15

  let borderClass = 'border-b border-[var(--border)]'
  if (isScoring) {
    borderClass = 'border-b border-[var(--border)] border-l-[3px] border-l-green-600'
  } else if (isTurnover) {
    borderClass = 'border-b border-[var(--border)] border-l-[3px] border-l-red-600'
  }

  const bgClass = isBigPlay ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''

  return (
    <div className={`py-2 px-3 text-sm flex items-center gap-3 flex-wrap ${borderClass} ${bgClass}`}>
      {play.down != null && play.distance != null && (
        <span className="bg-[var(--bg-surface-alt)] px-2 py-0.5 rounded text-xs font-mono whitespace-nowrap">
          {formatDown(play.down)} &amp; {play.distance}
        </span>
      )}

      {play.play_type && (
        <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
          {play.play_type}
        </span>
      )}

      {play.yards_gained != null && (
        <span
          className={`text-xs font-mono font-medium whitespace-nowrap ${
            play.yards_gained > 0
              ? 'text-green-600 dark:text-green-400'
              : play.yards_gained < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-[var(--text-muted)]'
          }`}
        >
          {play.yards_gained > 0 ? '+' : ''}{play.yards_gained} yds
        </span>
      )}

      {play.play_text && (
        <span className="text-[var(--text-primary)] line-clamp-1 md:line-clamp-none flex-1 min-w-0">
          {play.play_text}
        </span>
      )}

      {play.ppa != null && (
        <span
          className={`text-xs font-mono px-1.5 py-0.5 rounded whitespace-nowrap ${
            play.ppa >= 0
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
          }`}
        >
          {play.ppa >= 0 ? '+' : ''}{play.ppa.toFixed(2)}
        </span>
      )}
    </div>
  )
}
