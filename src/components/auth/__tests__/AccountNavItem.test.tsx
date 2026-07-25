import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccountNavItem } from '../AccountNavItem'

describe('AccountNavItem', () => {
  it('renders a "Sign in" link to /signin when signed out', () => {
    render(<AccountNavItem user={null} />)

    const link = screen.getByRole('link', { name: 'Sign in' })
    expect(link).toHaveAttribute('href', '/signin')
  })

  it('renders a link to /account showing the email when signed in', () => {
    render(<AccountNavItem user={{ id: 'user-1', email: 'rob@example.com' }} />)

    const link = screen.getByRole('link', { name: 'rob@example.com' })
    expect(link).toHaveAttribute('href', '/account')
  })

  it('applies the collapsed (md:hidden) label treatment when collapsed', () => {
    render(<AccountNavItem user={{ id: 'user-1', email: 'rob@example.com' }} collapsed />)

    const label = screen.getByText('rob@example.com')
    expect(label.className).toMatch(/md:hidden/)
  })

  it('falls back to "Account" when the signed-in user has no email', () => {
    render(<AccountNavItem user={{ id: 'user-1', email: null }} />)

    expect(screen.getByRole('link', { name: 'Account' })).toBeInTheDocument()
  })
})
