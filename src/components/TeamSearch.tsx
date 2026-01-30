'use client'

import { MagnifyingGlass } from '@phosphor-icons/react'

interface TeamSearchProps {
  value: string
  onChange: (value: string) => void
}

export function TeamSearch({ value, onChange }: TeamSearchProps) {
  return (
    <div className="relative max-w-md">
      <MagnifyingGlass
        size={20}
        weight="thin"
        className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
      />
      <input
        type="text"
        placeholder="Search teams or conferences..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-10 pr-4 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-run)] focus:border-transparent"
      />
    </div>
  )
}
