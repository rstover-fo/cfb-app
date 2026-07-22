'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TEAM_THEME_COOKIE, TEAM_THEME_COOKIE_MAX_AGE } from '@/lib/theme/team-theme'

interface TeamThemeToggleProps {
  /** The theme key to apply, e.g. 'ou'. Generic — not OU-specific. */
  themeKey: string
  /** Label shown on the toggle, e.g. "Sooner Mode". */
  label: string
  /** Whether this theme is the one currently active (from the server-read cookie). */
  active: boolean
}

/**
 * Opt-in preference toggle for a team theme overlay. Sets/clears a cookie so
 * the preference survives reloads and can be read SSR-safely in the root
 * layout (see src/app/layout.tsx), and flips the `data-team-theme` attribute
 * immediately for instant feedback without waiting on a server round trip.
 */
export function TeamThemeToggle({ themeKey, label, active: initialActive }: TeamThemeToggleProps) {
  const router = useRouter()
  const [active, setActive] = useState(initialActive)

  const toggle = useCallback(() => {
    const next = !active
    setActive(next)

    if (next) {
      document.cookie = `${TEAM_THEME_COOKIE}=${themeKey}; path=/; max-age=${TEAM_THEME_COOKIE_MAX_AGE}; samesite=lax`
      document.documentElement.setAttribute('data-team-theme', themeKey)
    } else {
      document.cookie = `${TEAM_THEME_COOKIE}=; path=/; max-age=0; samesite=lax`
      document.documentElement.removeAttribute('data-team-theme')
    }

    // Re-render server components (including the root layout) so the
    // SSR-read cookie stays in sync with this client-side change.
    router.refresh()
  }, [active, themeKey, router])

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border-[1.5px] text-xs font-medium uppercase tracking-wide transition-colors ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]'
          : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
      }`}
    >
      {label}
    </button>
  )
}
