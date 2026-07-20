'use client'

import { RouteErrorFallback } from '@/components/RouteErrorFallback'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function AnalyticsError({ error, reset }: ErrorProps) {
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      title="Couldn't load analytics"
      description="We ran into a problem loading the analytics dashboard. This has been logged and we'll look into it."
    />
  )
}
