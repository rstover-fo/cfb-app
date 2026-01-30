'use client'

import { useSyncExternalStore } from 'react'
import { Sun, Moon } from '@phosphor-icons/react'

function subscribe(callback: () => void) {
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
  darkQuery.addEventListener('change', callback)
  return () => darkQuery.removeEventListener('change', callback)
}

function getSnapshot() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function getServerSnapshot() {
  return false
}

export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

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
