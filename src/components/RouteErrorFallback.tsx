'use client'

import { useEffect } from 'react'
import { WarningCircle, ArrowClockwise, House } from '@phosphor-icons/react'
import Link from 'next/link'

interface RouteErrorFallbackProps {
  error: Error & { digest?: string }
  reset: () => void
  /** Route-specific heading, e.g. "Couldn't load this game". Defaults to a generic message. */
  title?: string
  /** Route-specific explanation. Defaults to a generic message. */
  description?: string
}

/**
 * Shared fallback UI for route-level error.tsx boundaries.
 * Keeps every route's error screen visually and behaviorally identical:
 * an icon, a heading, an explanation, an optional error ID, a retry
 * button that calls Next.js's reset(), and a link back home.
 */
export function RouteErrorFallback({
  error,
  reset,
  title = 'Something went wrong',
  description = "We encountered an unexpected error while loading this page. This has been logged and we'll look into it.",
}: RouteErrorFallbackProps) {
  useEffect(() => {
    // Log error to an error reporting service
    console.error('Application error:', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <WarningCircle
          size={64}
          weight="thin"
          className="mx-auto text-[var(--color-negative)] mb-6"
          aria-hidden="true"
        />

        <h1 className="font-headline text-2xl text-[var(--text-primary)] mb-2">
          {title}
        </h1>

        <p className="text-sm text-[var(--text-secondary)] mb-6">
          {description}
        </p>

        {error.digest && (
          <p className="text-xs text-[var(--text-muted)] mb-6 font-mono">
            Error ID: {error.digest}
          </p>
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium
                       text-[var(--text-primary)] bg-[var(--bg-surface-alt)]
                       hover:bg-[var(--border)] rounded transition-colors"
          >
            <ArrowClockwise size={16} weight="thin" aria-hidden="true" />
            Try again
          </button>

          <Link
            href="/"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium
                       text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                       transition-colors"
          >
            <House size={16} weight="thin" aria-hidden="true" />
            Go home
          </Link>
        </div>
      </div>
    </div>
  )
}
