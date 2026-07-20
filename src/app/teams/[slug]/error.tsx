'use client'

import { RouteErrorFallback } from '@/components/RouteErrorFallback'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function TeamDetailError({ error, reset }: ErrorProps) {
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      title="Couldn't load this team"
      description="We ran into a problem loading this team's page. This has been logged and we'll look into it."
    />
  )
}
