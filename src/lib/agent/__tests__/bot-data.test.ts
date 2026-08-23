import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }))

import { getUserProfile, resetBotDataForTests } from '../bot-data'

/**
 * The memoryEnabled tri-state is a privacy guard's foundation: true/false is
 * the user's real setting (missing row = product default on), 'unknown' means
 * the setting could not be verified and every memory consumer fails closed.
 */

function makeProfileClient(result: { data: unknown; error: { message: string } | null } | 'reject') {
  const maybeSingle = vi.fn(() =>
    result === 'reject' ? Promise.reject(new Error('network down')) : Promise.resolve(result)
  )
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { from }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetBotDataForTests()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  resetBotDataForTests()
  vi.restoreAllMocks()
})

describe('getUserProfile memoryEnabled tri-state', () => {
  it("returns the user's stored setting when the row exists", async () => {
    createClientMock.mockReturnValue(makeProfileClient({ data: { favorite_team: 'Oklahoma', memory_enabled: false }, error: null }))
    await expect(getUserProfile('u1')).resolves.toEqual({ favoriteTeam: 'Oklahoma', memoryEnabled: false })
  })

  it('a verified missing row is the product default: memory on', async () => {
    createClientMock.mockReturnValue(makeProfileClient({ data: null, error: null }))
    await expect(getUserProfile('u1')).resolves.toEqual({ memoryEnabled: true })
  })

  it("a read error is 'unknown', never enabled", async () => {
    createClientMock.mockReturnValue(makeProfileClient({ data: null, error: { message: 'timeout' } }))
    await expect(getUserProfile('u1')).resolves.toEqual({ memoryEnabled: 'unknown' })
  })

  it("a thrown request is 'unknown', never enabled", async () => {
    createClientMock.mockReturnValue(makeProfileClient('reject'))
    await expect(getUserProfile('u1')).resolves.toEqual({ memoryEnabled: 'unknown' })
  })

  it("an unconfigured client (no service key) is 'unknown', never enabled", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    await expect(getUserProfile('u1')).resolves.toEqual({ memoryEnabled: 'unknown' })
    expect(createClientMock).not.toHaveBeenCalled()
  })
})
