import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getStorage, resetStorageForTests, setStorageForTests } from '../index.js'
import { resetConfigForTests } from '../../config.js'
import type { StorageBackend } from '../backend.js'

const BASE_ENV = {
  DISCORD_TOKEN: 'token',
  DISCORD_APP_ID: 'app-id',
  DISCORD_GUILD_ID: 'guild-id',
  MCP_URL: 'https://example.com/api/mcp',
  MCP_AUTH_TOKEN: 'secret',
}

const ENV_KEYS = [...Object.keys(BASE_ENV), 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]))
  Object.assign(process.env, BASE_ENV)
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  resetConfigForTests()
  resetStorageForTests()
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  resetConfigForTests()
  resetStorageForTests()
})

describe('getStorage selection', () => {
  it('selects the JSON backend when the Supabase pair is absent', () => {
    expect(getStorage().name).toBe('json')
  })

  it('selects the Supabase backend when both env vars are set', () => {
    process.env.SUPABASE_URL = 'https://project.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    resetConfigForTests()
    expect(getStorage().name).toBe('supabase')
  })

  it('memoizes the backend across calls', () => {
    expect(getStorage()).toBe(getStorage())
  })

  it('path overrides force the JSON backend even with Supabase configured', () => {
    process.env.SUPABASE_URL = 'https://project.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    resetConfigForTests()
    resetStorageForTests({ profilesPath: '/tmp/does-not-matter.json' })
    expect(getStorage().name).toBe('json')
  })

  it('setStorageForTests injects a fake and a bare reset clears it', () => {
    const fake = { name: 'json' } as StorageBackend
    setStorageForTests(fake)
    expect(getStorage()).toBe(fake)
    resetStorageForTests()
    expect(getStorage()).not.toBe(fake)
  })
})
