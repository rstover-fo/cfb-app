import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { getStandings, type Standing } from '@/lib/queries/dashboard'
import { teamNameToSlug } from '@/lib/utils'
import { CURRENT_SEASON } from '@/lib/queries/constants'

function StandingRow({ standing, index }: { standing: Standing; index: number }) {
  return (
    <Link
      href={`/teams/${teamNameToSlug(standing.team)}`}
      className="flex items-center gap-3 py-2 px-1 -mx-1 rounded hover:bg-[var(--bg-surface-alt)] transition-colors"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Rank */}
      <span className="w-6 text-sm font-medium text-[var(--text-muted)] tabular-nums text-right">
        {standing.rank}
      </span>

      {/* Team logo */}
      {standing.logo ? (
        <Image
          src={standing.logo}
          alt={standing.team}
          width={24}
          height={24}
          className="w-6 h-6 object-contain"
        />
      ) : (
        <div
          className="w-6 h-6 rounded-full"
          style={{ backgroundColor: standing.color || 'var(--bg-surface-alt)' }}
        />
      )}

      {/* Team name */}
      <span className="flex-1 text-sm text-[var(--text-primary)] truncate">
        {standing.team}
      </span>

      {/* Record */}
      <span className="text-xs text-[var(--text-secondary)] tabular-nums">
        {standing.wins}-{standing.losses}
      </span>

      {/* Composite score */}
      <span className="w-12 text-xs text-[var(--text-muted)] tabular-nums text-right">
        {standing.compositeScore.toFixed(1)}
      </span>
    </Link>
  )
}

export async function StandingsWidget() {
  const standings = await getStandings(CURRENT_SEASON, 10)

  const hasData = standings.length > 0

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-medium text-[var(--text-muted)]">Composite Rankings</h2>
        <Link
          href="/analytics"
          className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          View All
          <ArrowRight size={12} weight="thin" />
        </Link>
      </div>

      {hasData ? (
        <>
          {/* Column headers */}
          <div className="flex items-center gap-3 px-1 -mx-1 mb-2 text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
            <span className="w-6 text-right">#</span>
            <span className="w-6" />
            <span className="flex-1">Team</span>
            <span>W-L</span>
            <span className="w-12 text-right">Score</span>
          </div>

          <div className="space-y-0.5">
            {standings.map((standing, i) => (
              <StandingRow key={standing.team} standing={standing} index={i} />
            ))}
          </div>
        </>
      ) : (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">
          No standings data available
        </div>
      )}
    </div>
  )
}
