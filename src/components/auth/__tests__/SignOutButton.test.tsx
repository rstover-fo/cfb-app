import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SignOutButton } from '../SignOutButton'

vi.mock('@/app/account/actions', () => ({
  signOut: vi.fn(),
}))

describe('SignOutButton', () => {
  it('renders a submit button inside a form wired to the signOut action', () => {
    render(<SignOutButton />)

    const button = screen.getByRole('button', { name: /Sign out/ })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('type', 'submit')
    expect(button.closest('form')).toBeInTheDocument()
  })
})
