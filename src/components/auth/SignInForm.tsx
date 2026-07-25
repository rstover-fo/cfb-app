'use client'

import { useActionState } from 'react'
import { EnvelopeSimple, CheckCircle } from '@phosphor-icons/react'
import { requestMagicLink, type MagicLinkState } from '@/app/account/actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface SignInFormProps {
  /** Where to land after a successful sign-in; passed through as a hidden
   *  field so the server action can forward it to Supabase's emailRedirectTo. */
  next?: string
}

const initialState: MagicLinkState = { status: 'idle' }

export function SignInForm({ next }: SignInFormProps) {
  const [state, formAction, isPending] = useActionState(requestMagicLink, initialState)

  if (state.status === 'sent') {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 text-center py-8 border border-[var(--border)] rounded-lg bg-[var(--bg-surface-alt)]"
      >
        <CheckCircle size={32} weight="thin" className="text-[var(--color-positive)]" aria-hidden="true" />
        <p className="text-sm font-medium text-[var(--text-primary)]">Check your email</p>
        <p className="text-sm text-[var(--text-muted)] max-w-xs">
          We sent a sign-in link. Click it to finish signing in -- the link expires soon and works only once.
        </p>
      </div>
    )
  }

  return (
    // noValidate: the server action re-validates the address and returns a
    // friendly inline error either way -- native browser validation would
    // silently block submission instead of round-tripping through that path.
    <form action={formAction} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <EnvelopeSimple
            size={18}
            weight="thin"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
            aria-hidden="true"
          />
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="pl-9"
          />
        </div>
      </div>

      {state.status === 'error' && (
        <p role="alert" className="text-sm text-[var(--color-negative)]">
          {state.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? 'Sending...' : 'Send magic link'}
      </Button>
    </form>
  )
}
