'use client'

import { Sun, Moon, Desktop } from '@phosphor-icons/react'
import { useTheme } from '@/hooks/useTheme'

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()

  const cycleTheme = () => {
    const nextTheme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'
    setTheme(nextTheme)
  }

  const icon = theme === 'system'
    ? <Desktop size={20} weight="thin" />
    : resolvedTheme === 'dark'
    ? <Moon size={20} weight="thin" />
    : <Sun size={20} weight="thin" />

  const label = theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'

  return (
    <button
      onClick={cycleTheme}
      className="flex items-center gap-3 w-full px-3 py-2 rounded text-[var(--text-muted)] hover:bg-[var(--bg-surface-alt)] transition-colors"
      aria-label={`Current theme: ${label}. Click to change.`}
    >
      {icon}
      <span className="text-sm">{label}</span>
    </button>
  )
}
