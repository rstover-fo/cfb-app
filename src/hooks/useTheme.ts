'use client'

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react'

type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'cfb-theme'

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  return (localStorage.getItem(STORAGE_KEY) as Theme) || 'system'
}

// Subscribe to system theme changes
function subscribeToSystemTheme(callback: () => void) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', callback)
  return () => mediaQuery.removeEventListener('change', callback)
}

export function useTheme() {
  // Use lazy initialization to avoid setState in effect
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system'
    return getStoredTheme()
  })

  // Use useSyncExternalStore for system theme to avoid setState in effect
  const systemTheme = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemTheme,
    () => 'light' as ResolvedTheme
  )

  // Derive resolvedTheme instead of storing it
  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme

  // Apply theme to document (side effect only, no setState)
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', theme)
    }
  }, [theme])

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem(STORAGE_KEY, newTheme)
  }, [])

  return { theme, setTheme, resolvedTheme }
}
