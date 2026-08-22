import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: () => [],
    set: vi.fn(),
    get: () => undefined,
  }),
}))

const getUserMock = vi.fn()
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: getUserMock },
  })),
}))

import { getSessionUser } from '../auth-server'

describe('getSessionUser', () => {
  beforeEach(() => {
    getUserMock.mockReset()
  })

  it('returns the user when Supabase Auth resolves one', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.com' } }, error: null })

    const user = await getSessionUser()

    expect(user).toEqual({ id: 'user-1', email: 'a@b.com' })
  })

  it('returns null when signed out', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })

    expect(await getSessionUser()).toBeNull()
  })

  it('returns null (never throws) when Supabase Auth errors', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: new Error('bad session') })

    expect(await getSessionUser()).toBeNull()
  })

  it('returns null (never throws) when the client call itself rejects', async () => {
    getUserMock.mockRejectedValue(new Error('network down'))

    expect(await getSessionUser()).toBeNull()
  })
})
