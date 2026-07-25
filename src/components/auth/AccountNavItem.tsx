'use client'

import Link from 'next/link'
import { SignIn, UserCircle } from '@phosphor-icons/react'
import type { SessionUser } from '@/app/account/actions'

interface AccountNavItemProps {
  user?: SessionUser | null
  /** Sidebar's collapsed state -- hides the label span at md+ widths,
   *  matching every other nav row in Sidebar.tsx. */
  collapsed?: boolean
}

/**
 * Sidebar's account affordance. Receives `user` as a prop -- it never
 * fetches; Sidebar (and this component) must not import
 * @/lib/auth/session, @/lib/queries/entitlements, or @/lib/supabase/server.
 */
export function AccountNavItem({ user, collapsed = false }: AccountNavItemProps) {
  const rowClasses = `flex items-center gap-3 px-3 py-2 rounded text-[var(--text-muted)] hover:bg-[var(--bg-surface-alt)] hover:text-[var(--text-primary)] transition-colors ${
    collapsed ? 'md:justify-center' : ''
  }`
  const labelClasses = `text-sm truncate ${collapsed ? 'md:hidden' : ''}`

  if (!user) {
    return (
      <Link href="/signin" className={rowClasses}>
        <SignIn size={20} weight="thin" />
        <span className={labelClasses}>Sign in</span>
      </Link>
    )
  }

  return (
    <Link href="/account" className={rowClasses}>
      <UserCircle size={20} weight="thin" />
      <span className={labelClasses}>{user.email ?? 'Account'}</span>
    </Link>
  )
}
