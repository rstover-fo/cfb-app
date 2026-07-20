'use client'

import { RouteErrorFallback } from '@/components/RouteErrorFallback'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function RivalsError({ error, reset }: ErrorProps) {
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      title="Couldn't load this matchup"
      description="We ran into a problem loading head-to-head history. This has been logged and we'll look into it."
    />
  )
}
