/**
 * Tests for the root middleware.ts admin gate. Lives under src/ (rather than
 * co-located next to the root file) because vitest.config.ts's `include` is
 * scoped to `src/**` -- this imports the root file by relative path instead.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const updateSessionMock = vi.fn()
const getDiscordSnowflakeMock = vi.fn()

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: (...args: unknown[]) => updateSessionMock(...args),
  getDiscordSnowflake: (...args: unknown[]) => getDiscordSnowflakeMock(...args),
}))

import { middleware, config } from '../../middleware'

describe('root middleware', () => {
  beforeEach(() => {
    updateSessionMock.mockReset()
    getDiscordSnowflakeMock.mockReset()
    process.env.ADMIN_DISCORD_IDS = '111,222'
  })

  afterEach(() => {
    delete process.env.ADMIN_DISCORD_IDS
  })

  it('only matches /chat and /admin', () => {
    expect(config.matcher).toEqual(['/chat/:path*', '/admin/:path*'])
  })

  it('lets an unauthenticated visitor through to /chat unchanged', async () => {
    const passThrough = NextResponse.next()
    updateSessionMock.mockResolvedValue({ response: passThrough, user: null })

    const request = new NextRequest('https://example.com/chat')
    const result = await middleware(request)

    expect(result).toBe(passThrough)
    expect(getDiscordSnowflakeMock).not.toHaveBeenCalled()
  })

  it('redirects an unauthenticated visitor away from /admin', async () => {
    updateSessionMock.mockResolvedValue({ response: NextResponse.next(), user: null })

    const request = new NextRequest('https://example.com/admin/scouting')
    const result = await middleware(request)

    expect(result.status).toBe(307)
    expect(result.headers.get('location')).toBe('https://example.com/')
  })

  it('redirects a signed-in non-admin away from /admin', async () => {
    updateSessionMock.mockResolvedValue({ response: NextResponse.next(), user: { id: 'u1' } })
    getDiscordSnowflakeMock.mockReturnValue('999999999999999999') // not on the allowlist

    const request = new NextRequest('https://example.com/admin/scouting')
    const result = await middleware(request)

    expect(result.status).toBe(307)
    expect(result.headers.get('location')).toBe('https://example.com/')
  })

  it('lets an admin through to /admin', async () => {
    const passThrough = NextResponse.next()
    updateSessionMock.mockResolvedValue({ response: passThrough, user: { id: 'u1' } })
    getDiscordSnowflakeMock.mockReturnValue('111') // on the allowlist

    const request = new NextRequest('https://example.com/admin/scouting')
    const result = await middleware(request)

    expect(result).toBe(passThrough)
  })

  it('treats an unset ADMIN_DISCORD_IDS as an empty allowlist, denying everyone', async () => {
    delete process.env.ADMIN_DISCORD_IDS
    updateSessionMock.mockResolvedValue({ response: NextResponse.next(), user: { id: 'u1' } })
    getDiscordSnowflakeMock.mockReturnValue('111')

    const request = new NextRequest('https://example.com/admin/scouting')
    const result = await middleware(request)

    expect(result.status).toBe(307)
  })
})
