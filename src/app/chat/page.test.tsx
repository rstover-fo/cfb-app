import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ChatPage from './page'

const getSessionUserMock = vi.fn()
vi.mock('@/lib/supabase/auth-server', () => ({
  getSessionUser: (...args: unknown[]) => getSessionUserMock(...args),
  getDiscordSnowflake: () => '123456789012345678',
}))

vi.mock('@/components/chat/ChatSignInCard', () => ({
  ChatSignInCard: ({ errorParam }: { errorParam?: string }) => (
    <div data-testid="sign-in-card">{errorParam ?? 'no-error'}</div>
  ),
}))

vi.mock('@/components/chat/ChatClient', () => ({
  ChatClient: ({
    displayName,
    discordSnowflake,
  }: {
    displayName: string
    discordSnowflake: string | null
  }) => (
    <div data-testid="chat-client">
      {displayName} / {discordSnowflake}
    </div>
  ),
}))

describe('Chat page', () => {
  it('renders the sign-in card when signed out', async () => {
    getSessionUserMock.mockResolvedValue(null)

    const jsx = await ChatPage({ searchParams: Promise.resolve({}) })
    render(jsx)

    expect(screen.getByText('Ask the Savant')).toBeInTheDocument()
    expect(screen.getByTestId('sign-in-card')).toBeInTheDocument()
    expect(screen.queryByTestId('chat-client')).not.toBeInTheDocument()
  })

  it('passes the error query param through to the sign-in card', async () => {
    getSessionUserMock.mockResolvedValue(null)

    const jsx = await ChatPage({ searchParams: Promise.resolve({ error: 'auth_failed' }) })
    render(jsx)

    expect(screen.getByTestId('sign-in-card')).toHaveTextContent('auth_failed')
  })

  it('renders the chat client with the display name and snowflake when signed in', async () => {
    getSessionUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'sooner@example.com',
      user_metadata: { full_name: 'Boomer Sooner' },
    })

    const jsx = await ChatPage({ searchParams: Promise.resolve({}) })
    render(jsx)

    expect(screen.getByTestId('chat-client')).toHaveTextContent('Boomer Sooner')
    expect(screen.getByTestId('chat-client')).toHaveTextContent('123456789012345678')
    expect(screen.queryByTestId('sign-in-card')).not.toBeInTheDocument()
  })

  it('falls back to email when no display name is available', async () => {
    getSessionUserMock.mockResolvedValue({
      id: 'user-2',
      email: 'noname@example.com',
      user_metadata: {},
    })

    const jsx = await ChatPage({ searchParams: Promise.resolve({}) })
    render(jsx)

    expect(screen.getByTestId('chat-client')).toHaveTextContent('noname@example.com')
  })
})
