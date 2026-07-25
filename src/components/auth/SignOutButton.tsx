'use client'

import { SignOut } from '@phosphor-icons/react'
import { signOut } from '@/app/account/actions'
import { Button } from '@/components/ui/button'

/**
 * Plain <form action={signOut}> -- works without JS, needs no onClick
 * handler. signOut() clears the session and redirects to '/'.
 */
export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="outline">
        <SignOut size={18} weight="thin" aria-hidden="true" />
        Sign out
      </Button>
    </form>
  )
}
