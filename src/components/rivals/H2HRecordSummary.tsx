import Image from 'next/image'
import type { MatchupSummary } from '@/lib/queries/matchups'

interface TeamMeta {
  name: string
  logo: string | null
  color: string | null
}

interface H2HRecordSummaryProps {
  summary: MatchupSummary
  teamAMeta: TeamMeta
  teamBMeta: TeamMeta
}

function TeamCrest({ meta, size = 48 }: { meta: TeamMeta; size?: number }) {
  if (meta.logo) {
    return (
      <Image
        src={meta.logo}
        alt={meta.name}
        width={size}
        height={size}
        className="object-contain flex-shrink-0"
        style={{ width: size, height: size }}
        unoptimized
      />
    )
  }
  return (
    <div
      className="rounded-full flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: meta.color || 'var(--bg-surface-alt)' }}
      aria-hidden="true"
    />
  )
}

// All-time head-to-head record, series leader, current streak, and first/last
// meeting — oriented to teamA (the first team the caller selected).
export function H2HRecordSummary({ summary, teamAMeta, teamBMeta }: H2HRecordSummaryProps) {
  const { teamAWins, teamBWins, ties, totalGames, firstMeeting, lastMeeting, streak } = summary

  const leader =
    teamAWins > teamBWins ? teamAMeta.name : teamBWins > teamAWins ? teamBMeta.name : null
  const winPct = totalGames > 0 ? (teamAWins / totalGames) * 100 : 0

  return (
    <section className="card p-6" aria-label="Head-to-head record">
      {/* Team headers */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <TeamCrest meta={teamAMeta} />
          <span className="font-headline text-lg text-[var(--text-primary)] truncate">
            {teamAMeta.name}
          </span>
        </div>
        <span className="text-sm text-[var(--text-muted)] uppercase tracking-widest">vs</span>
        <div className="flex items-center gap-3 min-w-0 justify-end">
          <span className="font-headline text-lg text-[var(--text-primary)] truncate text-right">
            {teamBMeta.name}
          </span>
          <TeamCrest meta={teamBMeta} />
        </div>
      </div>

      {/* Record */}
      <div className="mt-6 flex items-end justify-center gap-6">
        <div className="text-center">
          <div
            className="font-headline text-5xl tabular-nums leading-none"
            style={{ color: teamAMeta.color || 'var(--color-run)' }}
          >
            {teamAWins}
          </div>
          <p className="mt-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">Wins</p>
        </div>
        <div className="font-headline text-2xl text-[var(--text-muted)] pb-3">–</div>
        <div className="text-center">
          <div
            className="font-headline text-5xl tabular-nums leading-none"
            style={{ color: teamBMeta.color || 'var(--color-pass)' }}
          >
            {teamBWins}
          </div>
          <p className="mt-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">Wins</p>
        </div>
        {ties > 0 && (
          <>
            <div className="font-headline text-2xl text-[var(--text-muted)] pb-3">–</div>
            <div className="text-center">
              <div className="font-headline text-5xl tabular-nums leading-none text-[var(--text-secondary)]">
                {ties}
              </div>
              <p className="mt-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">Ties</p>
            </div>
          </>
        )}
      </div>

      {/* Series summary line */}
      <p className="mt-5 text-center text-sm text-[var(--text-secondary)]">
        {totalGames} {totalGames === 1 ? 'meeting' : 'meetings'} all-time
        {leader ? (
          <>
            {' · '}
            <span className="text-[var(--text-primary)] font-medium">{leader}</span> leads the series
          </>
        ) : (
          <> · series tied</>
        )}
        {' · '}
        {winPct.toFixed(0)}% for {teamAMeta.name}
      </p>

      {/* Streak + meetings */}
      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-[var(--border)] pt-4 text-center">
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Streak</p>
          <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
            {streak ? `${streak.team} W${streak.count}` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">First</p>
          <p className="mt-1 text-sm font-medium text-[var(--text-primary)] tabular-nums">
            {firstMeeting ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Latest</p>
          <p className="mt-1 text-sm font-medium text-[var(--text-primary)] tabular-nums">
            {lastMeeting ?? '—'}
          </p>
        </div>
      </div>
    </section>
  )
}
