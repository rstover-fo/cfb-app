'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Re-export types so client components never import server-only modules
// (@/lib/auth/session, @/lib/queries/entitlements, @/lib/supabase/server).
export type { SessionUser } from '@/lib/auth/session'
export type { Entitlement, EntitlementProduct, ViewerAccess } from '@/lib/queries/entitlements'

export interface MagicLinkState {
  status: 'idle' | 'sent' | 'error'
  message?: string
}

// Deliberately permissive -- this only screens out obviously-malformed input
// before calling Supabase. It is not an account-existence check.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * useActionState-shaped: (prevState, formData) => nextState.
 *
 * CRITICAL: always returns 'sent' for a syntactically valid address, whether
 * or not an account exists for it. signInWithOtp's response never reveals
 * account existence either way, but a naive implementation that branched on
 * "user not found" vs "email sent" would recreate that oracle client-side.
 * 'error' is reserved for a malformed address or an actual send failure
 * (network/rate-limit/config), never for "no such account."
 */
export async function requestMagicLink(
  prevState: MagicLinkState,
  formData: FormData
): Promise<MagicLinkState> {
  const email = String(formData.get('email') ?? '').trim()
  const next = String(formData.get('next') ?? '') || '/account'

  if (!EMAIL_PATTERN.test(email)) {
    return { status: 'error', message: 'Enter a valid email address.' }
  }

  // Guarded rather than interpolated blind: an unset NEXT_PUBLIC_SITE_URL would
  // mail every user a link to "undefined/auth/callback" while the form still
  // showed "check your email". Silent total auth failure behind a success
  // state is the worst possible shape for this bug, so fail loudly instead.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl) {
    console.error('[auth] NEXT_PUBLIC_SITE_URL is not set -- refusing to send an unusable magic link')
    return { status: 'error', message: 'Sign-in is misconfigured. Please try again later.' }
  }

  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
        shouldCreateUser: true,
      },
    })

    if (error) {
      console.error('[auth] requestMagicLink send failed:', error.message)
      return { status: 'error', message: 'Could not send the link. Try again in a moment.' }
    }

    return { status: 'sent' }
  } catch (err) {
    console.error('[auth] requestMagicLink threw:', err)
    return { status: 'error', message: 'Could not send the link. Try again in a moment.' }
  }
}

/** Clears the session and redirects home. Invoked as <form action={signOut}>. */
export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}
