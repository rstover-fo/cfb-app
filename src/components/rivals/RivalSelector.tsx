'use client'

import { useRouter } from 'next/navigation'
import { ArrowsLeftRight } from '@phosphor-icons/react'
import { selectClassName, selectStyle } from '@/lib/utils'

interface RivalSelectorProps {
  teams: string[]
  teamA: string
  teamB: string
}

// Two-team selector that drives the ?t1=&t2= URL params for a shareable matchup.
export function RivalSelector({ teams, teamA, teamB }: RivalSelectorProps) {
  const router = useRouter()

  const navigate = (t1: string, t2: string) => {
    const params = new URLSearchParams()
    if (t1) params.set('t1', t1)
    if (t2) params.set('t2', t2)
    router.push(`/rivals?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        aria-label="First team"
        value={teamA}
        onChange={e => navigate(e.target.value, teamB)}
        className={`${selectClassName} min-w-[180px]`}
        style={selectStyle}
      >
        <option value="">Select team…</option>
        {teams.map(t => (
          <option key={t} value={t} disabled={t === teamB}>
            {t}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => navigate(teamB, teamA)}
        disabled={!teamA || !teamB}
        aria-label="Swap teams"
        className="p-2 rounded-sm border-[1.5px] border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ArrowsLeftRight size={18} weight="bold" />
      </button>

      <select
        aria-label="Second team"
        value={teamB}
        onChange={e => navigate(teamA, e.target.value)}
        className={`${selectClassName} min-w-[180px]`}
        style={selectStyle}
      >
        <option value="">Select team…</option>
        {teams.map(t => (
          <option key={t} value={t} disabled={t === teamA}>
            {t}
          </option>
        ))}
      </select>
    </div>
  )
}
