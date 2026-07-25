import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AccountPage from './page'

const requireUser = vi.fn()
const getActiveEntitlements = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  requireUser: (...args: unknown[]) => requireUser(...args),
}))

vi.mock('@/lib/queries/entitlements', () => ({
  getActiveEntitlements: (...args: unknown[]) => getActiveEntitlements(...args),
}))

describe('Account page', () => {
  it('shows the Free plan when the user has no active entitlements', async () => {
    requireUser.mockResolvedValue({ id: 'user-1', email: 'rob@example.com' })
    getActiveEntitlements.mockResolvedValue([])

    const jsx = await AccountPage()
    render(jsx)

    expect(screen.getByText('rob@example.com')).toBeInTheDocument()
    expect(screen.getByText('Free plan')).toBeInTheDocument()
    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sign out/ })).toBeInTheDocument()
  })

  it('shows the Season Pass as active for a pass holder', async () => {
    requireUser.mockResolvedValue({ id: 'user-2', email: 'passholder@example.com' })
    getActiveEntitlements.mockResolvedValue([
      {
        product: 'season_pass_2026',
        source: 'stripe',
        granted_at: '2026-07-01T00:00:00.000Z',
        expires_at: null,
        stripe_customer_id: 'cus_123',
      },
    ])

    const jsx = await AccountPage()
    render(jsx)

    expect(screen.getByText('passholder@example.com')).toBeInTheDocument()
    expect(screen.getByText('Season Pass')).toBeInTheDocument()
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
    expect(screen.getByText('MCP Add-on')).toBeInTheDocument()
    expect(screen.getByText('Not active')).toBeInTheDocument()
  })
})
