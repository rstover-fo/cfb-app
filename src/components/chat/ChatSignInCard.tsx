'use client'

import { useState } from 'react'
import { DiscordLogo, ChatCircleDots } from '@phosphor-icons/react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

interface ChatSignInCardProps {
  /** `error` query param from /auth/callback's redirect, if the OAuth flow failed. */
  errorParam?: string
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: 'The sign-in link was incomplete. Please try again.',
  auth_failed: 'Sign-in failed. Please try again.',
}

function messageForErrorParam(errorParam: string): string {
  return ERROR_MESSAGES[errorParam] ?? 'Sign-in failed. Please try again.'
}

/**
 * Signed-out state for /chat. Starts the Discord OAuth flow via the browser
 * Supabase client -- the redirect target is /auth/callback, which exchanges
 * the code for a session and lands back on /chat (see route.ts there).
 */
export function ChatSignInCard({ errorParam }: ChatSignInCardProps = {}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(errorParam ? messageForErrorParam(errorParam) : null)

  async function handleSignIn() {
    setPending(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: { redirectTo: `${window.location.origin}/auth/callback?next=/chat` },
      })
      if (signInError) {
        setError(signInError.message)
        setPending(false)
      }
      // On success the browser navigates away to Discord -- nothing more to do here.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border-[1.5px] border-[var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-soft)] py-16 px-8 text-center max-w-md mx-auto">
      <ChatCircleDots size={40} weight="thin" className="text-[var(--color-run)]" aria-hidden="true" />

      <div className="space-y-1">
        <h2 className="font-headline text-xl text-[var(--text-primary)]">Sign in to chat</h2>
        <p className="text-sm text-[var(--text-muted)] max-w-xs">
          Ask the Savant is available to signed-in users. Sign in with Discord to start a conversation.
        </p>
      </div>

      <Button type="button" onClick={handleSignIn} disabled={pending} className="gap-2">
        <DiscordLogo size={18} weight="fill" />
        {pending ? 'Redirecting…' : 'Sign in with Discord'}
      </Button>

      {error && (
        <p role="alert" className="text-sm text-[var(--color-negative)]">
          {error}
        </p>
      )}
    </div>
  )
}
