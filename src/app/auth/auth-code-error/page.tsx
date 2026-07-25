import Link from 'next/link'
import { WarningCircle } from '@phosphor-icons/react/dist/ssr'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'Sign-in link expired | CFB Team 360',
  description: 'The sign-in link was invalid or has expired.',
}

/**
 * Landing page for a failed /auth/callback exchange -- the magic link was
 * missing its code, already used, expired, or a corporate mail scanner
 * prefetched (and burned) it before the human clicked. There is no recovery
 * path other than requesting a fresh link.
 */
export default function AuthCodeErrorPage() {
  return (
    <div className="p-8">
      <div className="max-w-sm mx-auto mt-12">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          Link expired
        </h1>

        <Card className="mt-6">
          <CardContent className="flex flex-col items-center text-center gap-3 py-4">
            <WarningCircle size={40} weight="thin" className="text-[var(--color-negative)]" aria-hidden="true" />
            <p className="text-sm text-[var(--text-primary)]">
              That sign-in link is invalid or has expired.
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              Links are single-use and expire after a short window. Request a new one below.
            </p>
            <Button asChild className="mt-2">
              <Link href="/signin">Request a new link</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
