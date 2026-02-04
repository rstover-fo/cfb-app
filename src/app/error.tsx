'use client'

import { useEffect } from 'react'
import { WarningCircle, ArrowClockwise, House } from '@phosphor-icons/react'
import Link from 'next/link'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function Error({ error, reset }: ErrorProps) {
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
        />

        <h1 className="font-headline text-2xl text-[var(--text-primary)] mb-2">
          Something went wrong
        </h1>

        <p className="text-sm text-[var(--text-secondary)] mb-6">
          We encountered an unexpected error while loading this page. This has been logged and we&apos;ll look into it.
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
            <ArrowClockwise size={16} weight="thin" />
            Try again
          </button>

          <Link
            href="/"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium
                       text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                       transition-colors"
          >
            <House size={16} weight="thin" />
            Go home
          </Link>
        </div>
      </div>
    </div>
  )
}
