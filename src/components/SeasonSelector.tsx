'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

interface SeasonSelectorProps {
  seasons: number[]
  currentSeason: number
}

export function SeasonSelector({ seasons, currentSeason }: SeasonSelectorProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newSeason = e.target.value
    const params = new URLSearchParams(searchParams.toString())
    params.set('season', newSeason)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <select
      value={currentSeason}
      onChange={handleChange}
      className="px-3 py-1.5 border-[1.5px] border-[var(--border)] rounded-sm text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] cursor-pointer hover:border-[var(--text-muted)] transition-colors"
      aria-label="Select season"
    >
      {seasons.map(season => (
        <option key={season} value={season}>
          {season} Season
        </option>
      ))}
    </select>
  )
}
