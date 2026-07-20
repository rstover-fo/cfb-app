'use client'

import { RouteErrorFallback } from '@/components/RouteErrorFallback'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GamesError({ error, reset }: ErrorProps) {
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      title="Couldn't load games"
      description="We ran into a problem loading the games list. This has been logged and we'll look into it."
    />
  )
}
