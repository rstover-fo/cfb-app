import Link from 'next/link'
import { UserCircle } from '@phosphor-icons/react/dist/ssr'

export default function PlayerNotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <UserCircle
          size={64}
          weight="thin"
          className="mx-auto text-[var(--text-muted)] mb-6"
        />

        <h1 className="font-headline text-2xl text-[var(--text-primary)] mb-2">
          Player Not Found
        </h1>

        <p className="text-sm text-[var(--text-secondary)] mb-6">
          We couldn&apos;t find a player with that ID. They may have been removed or the link may be incorrect.
        </p>

        <Link
          href="/players"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium
                     text-[var(--text-primary)] bg-[var(--bg-surface-alt)]
                     hover:bg-[var(--border)] rounded transition-colors"
        >
          Browse all players
        </Link>
      </div>
    </div>
  )
}
