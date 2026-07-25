import { describe, it, expect, vi, beforeEach } from 'vitest'

const exchangeCodeForSession = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession },
  })),
}))

const { GET } = await import('./route')

beforeEach(() => {
  exchangeCodeForSession.mockReset()
  exchangeCodeForSession.mockResolvedValue({ error: null })
})

describe('GET /auth/callback', () => {
  it('exchanges the code and redirects to the default destination', async () => {
    const response = await GET(new Request('https://example.com/auth/callback?code=abc123'))

    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc123')
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://example.com/account')
  })

  it('honors a same-origin relative next param', async () => {
    const response = await GET(
      new Request('https://example.com/auth/callback?code=abc123&next=%2Fpredictions')
    )

    expect(response.headers.get('location')).toBe('https://example.com/predictions')
  })

  it('redirects to the error page when no code is present', async () => {
    const response = await GET(new Request('https://example.com/auth/callback'))

    expect(exchangeCodeForSession).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toBe('https://example.com/auth/auth-code-error')
  })

  it('redirects to the error page when the exchange fails', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: 'expired' } })

    const response = await GET(new Request('https://example.com/auth/callback?code=stale'))

    expect(response.headers.get('location')).toBe('https://example.com/auth/auth-code-error')
  })

  describe('open-redirect guard', () => {
    // `next` rides in on an email link, so it is attacker-influenceable. Each
    // of these must fall back to /account rather than leaving the origin.
    const hostile = [
      ['protocol-relative', '//evil.example.com'],
      ['absolute http', 'https://evil.example.com/phish'],
      ['scheme-only', 'javascript:alert(1)'],
      ['bare path without leading slash', 'evil.example.com'],
    ] as const

    it.each(hostile)('rejects %s', async (_label, next) => {
      const response = await GET(
        new Request(`https://example.com/auth/callback?code=abc123&next=${encodeURIComponent(next)}`)
      )

      expect(response.headers.get('location')).toBe('https://example.com/account')
    })
  })
})
