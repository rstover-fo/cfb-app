import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The real module builds a client via @supabase/supabase-js; capture the
// options it passes so the timeout fetch wiring is observable without any
// network. Every OTHER test in the repo mocks '@/lib/supabase/server' -- this
// file is the one place the real module is under test.
const createSupabaseClient = vi.fn((..._args: unknown[]) => ({ fake: 'client' }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createSupabaseClient(...args),
}))

const GLOBAL_KEY = Symbol.for('cfb-app.supabase.query-client')

describe('supabase query client', () => {
  beforeEach(() => {
    vi.resetModules()
    createSupabaseClient.mockClear()
    delete (globalThis as Record<symbol, unknown>)[GLOBAL_KEY]
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  })

  afterEach(() => {
    delete (globalThis as Record<symbol, unknown>)[GLOBAL_KEY]
  })

  it('memoizes one client per process', async () => {
    const { createClient } = await import('../server')
    const a = await createClient()
    const b = await createClient()
    expect(a).toBe(b)
    expect(createSupabaseClient).toHaveBeenCalledTimes(1)
  })

  it('installs a fetch that aborts requests on a timeout signal', async () => {
    const { createClient } = await import('../server')
    await createClient()

    const options = createSupabaseClient.mock.calls[0]![2] as unknown as {
      global?: { fetch?: typeof fetch }
      auth?: Record<string, unknown>
    }
    expect(options.auth).toEqual({ persistSession: false, autoRefreshToken: false })
    const timeoutFetch = options.global?.fetch
    expect(timeoutFetch).toBeTypeOf('function')

    // The wrapped fetch must always attach an AbortSignal, and must combine
    // with a caller-provided signal rather than dropping it.
    const seen: { signal: AbortSignal | null | undefined }[] = []
    const realFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (_input, init) => {
        seen.push({ signal: init?.signal })
        return new Response('{}')
      })

    await timeoutFetch!('https://example.com/rest', {})
    expect(seen[0]!.signal).toBeInstanceOf(AbortSignal)

    const callerController = new AbortController()
    await timeoutFetch!('https://example.com/rest', { signal: callerController.signal })
    expect(seen[1]!.signal).toBeInstanceOf(AbortSignal)

    realFetch.mockRestore()
  })
})
