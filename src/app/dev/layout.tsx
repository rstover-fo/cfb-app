import { notFound } from 'next/navigation'

/**
 * Dev-only route group. Everything under /dev (the chart gallery) renders
 * data-full fixtures with no network access -- useful for visually
 * verifying charts in environments where Supabase is unreachable, but it
 * has no reason to exist in a production build.
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }

  return <>{children}</>
}
