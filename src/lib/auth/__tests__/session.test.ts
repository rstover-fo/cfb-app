import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const redirect = vi.fn((url: string) => {
  // next/navigation's redirect throws a control-flow signal; model that so a
  // caller can never accidentally continue past it.
  throw new Error(`REDIRECT:${url}`)
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
}))

// cache() dedupes per request; in tests each import gets a fresh registry, so
// re-import per test to avoid one test's memoized user leaking into the next.
async function freshModule() {
  vi.resetModules()
  return import('../session')
}

beforeEach(() => {
  getUser.mockReset()
  redirect.mockClear()
})

describe('getCurrentUser', () => {
  it('maps an authenticated user to id + email', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'rob@example.com' } },
      error: null,
    })

    const { getCurrentUser } = await freshModule()
    await expect(getCurrentUser()).resolves.toEqual({ id: 'user-1', email: 'rob@example.com' })
  })

  it('returns null when anonymous', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })

    const { getCurrentUser } = await freshModule()
    await expect(getCurrentUser()).resolves.toBeNull()
  })

  it('normalizes a missing email to null rather than undefined', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })

    const { getCurrentUser } = await freshModule()
    await expect(getCurrentUser()).resolves.toEqual({ id: 'user-1', email: null })
  })

  it('reads an auth error as anonymous instead of throwing', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'boom' } })

    const { getCurrentUser } = await freshModule()
    await expect(getCurrentUser()).resolves.toBeNull()
  })

  it('reads a thrown auth-server failure as anonymous (fails closed)', async () => {
    getUser.mockRejectedValue(new Error('network down'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { getCurrentUser } = await freshModule()
    await expect(getCurrentUser()).resolves.toBeNull()

    consoleError.mockRestore()
  })
})

describe('requireUser', () => {
  it('returns the user when authenticated', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'rob@example.com' } },
      error: null,
    })

    const { requireUser } = await freshModule()
    await expect(requireUser()).resolves.toEqual({ id: 'user-1', email: 'rob@example.com' })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('redirects anonymous visitors to /signin', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })

    const { requireUser } = await freshModule()
    await expect(requireUser()).rejects.toThrow('REDIRECT:/signin')
  })

  it('round-trips the caller through an encoded next param', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })

    const { requireUser } = await freshModule()
    await expect(requireUser('/predictions?week=3')).rejects.toThrow(
      'REDIRECT:/signin?next=%2Fpredictions%3Fweek%3D3'
    )
  })
})
