'use client'

import { useState, useEffect } from 'react'
import { Sun, Moon } from '@phosphor-icons/react'

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    // Check system preference on mount
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
    setIsDark(darkQuery.matches)
  }, [])

  // For now, just show current state - full theme switching would need more work
  return (
    <button
      className="flex items-center gap-3 w-full px-3 py-2 rounded text-[var(--text-muted)] hover:bg-[var(--bg-surface-alt)] transition-colors"
      aria-label={isDark ? 'Dark mode active' : 'Light mode active'}
    >
      {isDark ? (
        <Moon size={20} weight="thin" />
      ) : (
        <Sun size={20} weight="thin" />
      )}
      <span className="text-sm">{isDark ? 'Dark' : 'Light'}</span>
    </button>
  )
}
