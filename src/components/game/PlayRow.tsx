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

  let borderColor = 'transparent'
  if (isScoring) {
    borderColor = 'var(--color-positive)'
  } else if (isTurnover) {
    borderColor = 'var(--color-negative)'
  }

  const bgClass = isBigPlay
    ? 'bg-[color-mix(in_srgb,var(--color-run)_8%,transparent)]'
    : ''

  return (
    <div
      className={`py-2.5 px-3 border-b border-[var(--border)] ${bgClass}`}
      style={{ borderLeftWidth: isScoring || isTurnover ? '3px' : '0px', borderLeftColor: borderColor }}
    >
      {/* Row 1: Play metadata */}
      <div className="flex items-center gap-2 mb-1">
        {play.down != null && play.distance != null && (
          <span className="bg-[var(--bg-surface-alt)] px-2 py-0.5 rounded text-xs font-mono whitespace-nowrap text-[var(--text-primary)]">
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
            className="text-xs font-mono font-semibold whitespace-nowrap"
            style={{
              color: play.yards_gained > 0
                ? 'var(--color-positive)'
                : play.yards_gained < 0
                  ? 'var(--color-negative)'
                  : 'var(--text-muted)'
            }}
          >
            {play.yards_gained > 0 ? '+' : ''}{play.yards_gained} yds
          </span>
        )}

        {play.ppa != null && (
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap ml-auto"
            style={{
              backgroundColor: play.ppa >= 0
                ? 'color-mix(in srgb, var(--color-positive) 12%, transparent)'
                : 'color-mix(in srgb, var(--color-negative) 12%, transparent)',
              color: play.ppa >= 0 ? 'var(--color-positive)' : 'var(--color-negative)',
            }}
          >
            PPA {play.ppa >= 0 ? '+' : ''}{play.ppa.toFixed(2)}
          </span>
        )}
      </div>

      {/* Row 2: Play description */}
      {play.play_text && (
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          {play.play_text}
        </p>
      )}
    </div>
  )
}
