import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChatSignInCard } from '../ChatSignInCard'

const signInWithOAuthMock = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signInWithOAuth: signInWithOAuthMock },
  }),
}))

describe('ChatSignInCard', () => {
  beforeEach(() => {
    signInWithOAuthMock.mockReset()
  })

  it('renders the sign-in prompt and button', () => {
    render(<ChatSignInCard />)
    expect(screen.getByText('Sign in to chat')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sign in with Discord/ })).toBeInTheDocument()
  })

  it('starts the Discord OAuth flow with a same-origin callback redirect', async () => {
    signInWithOAuthMock.mockResolvedValue({ error: null })
    render(<ChatSignInCard />)

    fireEvent.click(screen.getByRole('button', { name: /Sign in with Discord/ }))

    await waitFor(() => expect(signInWithOAuthMock).toHaveBeenCalled())
    expect(signInWithOAuthMock).toHaveBeenCalledWith({
      provider: 'discord',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/chat` },
    })
  })

  it('shows an inline error when sign-in fails', async () => {
    signInWithOAuthMock.mockResolvedValue({ error: { message: 'OAuth misconfigured' } })
    render(<ChatSignInCard />)

    fireEvent.click(screen.getByRole('button', { name: /Sign in with Discord/ }))

    expect(await screen.findByText('OAuth misconfigured')).toBeInTheDocument()
  })

  it('maps a known error query param to a friendly message', () => {
    render(<ChatSignInCard errorParam="missing_code" />)
    expect(screen.getByText(/incomplete/)).toBeInTheDocument()
  })

  it('falls back to a generic message for an unrecognized error param', () => {
    render(<ChatSignInCard errorParam="something_weird" />)
    expect(screen.getByText('Sign-in failed. Please try again.')).toBeInTheDocument()
  })
})
