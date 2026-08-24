import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { getDiscordSnowflake, updateSession } from '../middleware'
import type { User } from '@supabase/supabase-js'

function discordUser(overrides: Partial<{ providerId: string; identityId: string }> = {}): User {
  const providerId = overrides.providerId ?? '123456789012345678'
  const identityId = overrides.identityId ?? providerId
  return {
    id: 'user-1',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
    identities: [
      {
        identity_id: 'identity-1',
        id: identityId,
        user_id: 'user-1',
        identity_data: { provider_id: providerId, sub: providerId },
        provider: 'discord',
        created_at: '2026-01-01T00:00:00Z',
        last_sign_in_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
  } as unknown as User
}

describe('getDiscordSnowflake', () => {
  it('returns null for a user with no identities', () => {
    expect(getDiscordSnowflake(null)).toBeNull()
    expect(getDiscordSnowflake(undefined)).toBeNull()
    expect(getDiscordSnowflake({ identities: [] } as unknown as User)).toBeNull()
  })

  it('returns null when the user has identities but none from discord', () => {
    const user = {
      identities: [{ provider: 'email', id: 'abc', identity_data: {} }],
    } as unknown as User
    expect(getDiscordSnowflake(user)).toBeNull()
  })

  it('prefers identity_data.provider_id when it agrees with identity.id', () => {
    expect(getDiscordSnowflake(discordUser({ providerId: '999888777666555444' }))).toBe(
      '999888777666555444'
    )
  })

  it('falls back to identity.id when provider_id is missing', () => {
    const user = {
      identities: [{ provider: 'discord', id: '111222333444555666', identity_data: {} }],
    } as unknown as User
    expect(getDiscordSnowflake(user)).toBe('111222333444555666')
  })
})

describe('updateSession', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey
    vi.restoreAllMocks()
  })

  it('never throws and returns user: null when env vars are missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    const request = new NextRequest('https://example.com/chat')
    const result = await updateSession(request)

    expect(result.user).toBeNull()
    expect(result.response).toBeDefined()
  })

  it('never throws when the Supabase call itself fails', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder-anon-key'

    vi.doMock('@supabase/ssr', () => ({
      createServerClient: () => ({
        auth: {
          getUser: () => Promise.reject(new Error('network down')),
        },
      }),
    }))

    const { updateSession: freshUpdateSession } = await import('../middleware')
    const request = new NextRequest('https://example.com/chat')
    const result = await freshUpdateSession(request)

    expect(result.user).toBeNull()
    expect(result.response).toBeDefined()

    vi.doUnmock('@supabase/ssr')
  })
})
