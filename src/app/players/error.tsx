'use client'

import { RouteErrorFallback } from '@/components/RouteErrorFallback'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function PlayersError({ error, reset }: ErrorProps) {
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      title="Couldn't load players"
      description="We ran into a problem loading player leaderboards. This has been logged and we'll look into it."
    />
  )
}
