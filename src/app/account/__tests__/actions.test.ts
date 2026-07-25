import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const signInWithOtp = vi.fn()
const signOutFn = vi.fn()
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { signInWithOtp, signOut: signOutFn },
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
}))

// `import type` is fully erased, so it cannot load the module ahead of the
// mocks above; the runtime bindings still come from the dynamic import.
import type { MagicLinkState } from '../actions'

const { requestMagicLink, signOut } = await import('../actions')

const IDLE = { status: 'idle' } as MagicLinkState

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  Object.entries(fields).forEach(([k, v]) => fd.set(k, v))
  return fd
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  signInWithOtp.mockReset().mockResolvedValue({ error: null })
  signOutFn.mockReset().mockResolvedValue({ error: null })
  redirect.mockClear()
  process.env.NEXT_PUBLIC_SITE_URL = 'https://cfb.example.com'
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('requestMagicLink', () => {
  it('sends a link and reports sent for a valid address', async () => {
    const result = await requestMagicLink(IDLE, form({ email: 'rob@example.com' }))

    expect(result.status).toBe('sent')
    expect(signInWithOtp).toHaveBeenCalledOnce()
  })

  it('builds emailRedirectTo from NEXT_PUBLIC_SITE_URL with an encoded next', async () => {
    await requestMagicLink(IDLE, form({ email: 'rob@example.com', next: '/predictions?week=3' }))

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'rob@example.com',
      options: {
        emailRedirectTo:
          'https://cfb.example.com/auth/callback?next=%2Fpredictions%3Fweek%3D3',
        shouldCreateUser: true,
      },
    })
  })

  it('defaults next to /account when absent', async () => {
    await requestMagicLink(IDLE, form({ email: 'rob@example.com' }))

    const options = signInWithOtp.mock.calls[0][0].options
    expect(options.emailRedirectTo).toBe('https://cfb.example.com/auth/callback?next=%2Faccount')
  })

  it('trims surrounding whitespace before validating', async () => {
    const result = await requestMagicLink(IDLE, form({ email: '  rob@example.com  ' }))

    expect(result.status).toBe('sent')
    expect(signInWithOtp.mock.calls[0][0].email).toBe('rob@example.com')
  })

  describe('account enumeration', () => {
    // The sign-in form must not become an oracle for "does this person have an
    // account here" -- for a paid product that leaks the customer list.
    it('reports sent identically for any syntactically valid address', async () => {
      const known = await requestMagicLink(IDLE, form({ email: 'existing@example.com' }))
      const unknown = await requestMagicLink(IDLE, form({ email: 'never-seen@example.com' }))

      expect(known).toEqual(unknown)
      expect(known.status).toBe('sent')
    })

    it('passes shouldCreateUser so an unknown address cannot 404', async () => {
      await requestMagicLink(IDLE, form({ email: 'never-seen@example.com' }))

      expect(signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(true)
    })
  })

  describe('failure modes', () => {
    it('rejects a malformed address without calling Supabase', async () => {
      const result = await requestMagicLink(IDLE, form({ email: 'not-an-email' }))

      expect(result.status).toBe('error')
      expect(signInWithOtp).not.toHaveBeenCalled()
    })

    it('refuses to send when NEXT_PUBLIC_SITE_URL is unset', async () => {
      // Otherwise every user is mailed "undefined/auth/callback" while the form
      // still shows "check your email" -- total auth failure behind a success UI.
      delete process.env.NEXT_PUBLIC_SITE_URL

      const result = await requestMagicLink(IDLE, form({ email: 'rob@example.com' }))

      expect(result.status).toBe('error')
      expect(signInWithOtp).not.toHaveBeenCalled()
    })

    it('does not leak the underlying provider error to the user', async () => {
      signInWithOtp.mockResolvedValue({ error: { message: 'smtp relay 550 at mail.internal' } })

      const result = await requestMagicLink(IDLE, form({ email: 'rob@example.com' }))

      expect(result.status).toBe('error')
      expect(result.message).not.toContain('smtp')
      expect(result.message).not.toContain('internal')
    })

    it('survives a thrown client failure', async () => {
      signInWithOtp.mockRejectedValue(new Error('network down'))

      const result = await requestMagicLink(IDLE, form({ email: 'rob@example.com' }))

      expect(result.status).toBe('error')
    })
  })
})

describe('signOut', () => {
  it('clears the session and redirects home', async () => {
    await expect(signOut()).rejects.toThrow('REDIRECT:/')
    expect(signOutFn).toHaveBeenCalledOnce()
  })
})
