'use client'

import { useMemo, useState } from 'react'
import type { Team } from '@/lib/types/database'
import { selectClassName, selectStyle } from '@/lib/utils'
import { TeamSearch } from '@/components/TeamSearch'

interface TeamPickerProps {
  label: string
  teams: Team[]
  value: number | null
  onChange: (id: number | null) => void
  /** Team id to hide from the option list (e.g. whichever team is on the other side of the comparison). */
  excludeId?: number | null
  placeholder?: string
}

// Reuses the app's existing TeamSearch input to filter a <select> of teams.
// Used by both the team-page Compare tab and the standalone /compare route
// (via CompareView) so team selection looks and behaves the same everywhere.
export function TeamPicker({ label, teams, value, onChange, excludeId, placeholder = 'Select a team...' }: TeamPickerProps) {
  const [query, setQuery] = useState('')

  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    return teams
      .filter(t => t.id !== excludeId)
      .filter(t => !q || (t.school ?? '').toLowerCase().includes(q) || (t.conference ?? '').toLowerCase().includes(q))
      .sort((a, b) => (a.school ?? '').localeCompare(b.school ?? ''))
  }, [teams, excludeId, query])

  const labelId = `team-picker-${label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div className="flex flex-col gap-1.5 min-w-[220px]">
      <span className="sr-only" id={labelId}>{label}</span>
      <TeamSearch value={query} onChange={setQuery} />
      <select
        aria-labelledby={labelId}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className={selectClassName}
        style={selectStyle}
      >
        <option value="">{placeholder}</option>
        {options.map(t => (
          <option key={t.id} value={t.id ?? ''}>{t.school}</option>
        ))}
      </select>
    </div>
  )
}
