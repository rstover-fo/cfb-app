import { describe, it, expect, vi, beforeEach } from 'vitest'

const exchangeCodeForSessionMock = vi.fn()
vi.mock('@/lib/supabase/auth-server', () => ({
  createAuthClient: vi.fn().mockResolvedValue({
    auth: {
      exchangeCodeForSession: (...args: unknown[]) => exchangeCodeForSessionMock(...args),
    },
  }),
}))

import { GET } from './route'

describe('GET /auth/callback', () => {
  beforeEach(() => {
    exchangeCodeForSessionMock.mockReset()
  })

  it('redirects to next on a successful exchange', async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null })

    const request = new Request('https://example.com/auth/callback?code=abc123&next=/chat')
    const response = await GET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://example.com/chat')
    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith('abc123')
  })

  it('defaults next to /chat when not provided', async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null })

    const request = new Request('https://example.com/auth/callback?code=abc123')
    const response = await GET(request)

    expect(response.headers.get('location')).toBe('https://example.com/chat')
  })

  it('refuses to follow an off-app next param and falls back to /chat', async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null })

    const request = new Request(
      'https://example.com/auth/callback?code=abc123&next=https://evil.example.com'
    )
    const response = await GET(request)

    expect(response.headers.get('location')).toBe('https://example.com/chat')
  })

  it('redirects to /chat with an error when the provider reports one', async () => {
    const request = new Request(
      'https://example.com/auth/callback?error=access_denied&error_description=User+declined'
    )
    const response = await GET(request)

    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/chat')
    expect(location.searchParams.get('error')).toBe('User declined')
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled()
  })

  it('redirects to /chat with an error when the code is missing', async () => {
    const request = new Request('https://example.com/auth/callback')
    const response = await GET(request)

    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/chat')
    expect(location.searchParams.get('error')).toBe('missing_code')
  })

  it('redirects to /chat with an error when the exchange fails', async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: new Error('bad code') })

    const request = new Request('https://example.com/auth/callback?code=bad')
    const response = await GET(request)

    const location = new URL(response.headers.get('location')!)
    expect(location.searchParams.get('error')).toBe('auth_failed')
  })
})
