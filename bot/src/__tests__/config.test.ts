import { describe, it, expect, beforeEach } from 'vitest'
import { loadConfig, deriveDefaultSeason, isAllowedGuild, resetConfigForTests } from '../config.js'

const VALID_ENV = {
  DISCORD_TOKEN: 'token',
  DISCORD_APP_ID: 'app-id',
  DISCORD_GUILD_ID: 'guild-id',
  MCP_URL: 'https://example.com/api/mcp',
  MCP_AUTH_TOKEN: 'secret',
}

beforeEach(() => {
  resetConfigForTests()
})

describe('loadConfig', () => {
  it('parses a fully-populated env', () => {
    const config = loadConfig(VALID_ENV)
    expect(config).toMatchObject({
      discordToken: 'token',
      discordAppId: 'app-id',
      discordGuildId: 'guild-id',
      mcpUrl: 'https://example.com/api/mcp',
      mcpAuthToken: 'secret',
    })
  })

  it('throws a readable error listing every missing var', () => {
    expect(() => loadConfig({})).toThrowError(/DISCORD_TOKEN.*DISCORD_APP_ID.*DISCORD_GUILD_ID.*MCP_URL.*MCP_AUTH_TOKEN/s)
  })

  it('throws when MCP_URL is not a valid URL', () => {
    expect(() => loadConfig({ ...VALID_ENV, MCP_URL: 'not-a-url' })).toThrowError(/MCP_URL/)
  })

  it('memoizes across calls until reset', () => {
    const first = loadConfig(VALID_ENV)
    const second = loadConfig({}) // would throw if actually re-parsed
    expect(second).toBe(first)
  })

  it('re-parses after resetConfigForTests', () => {
    loadConfig(VALID_ENV)
    resetConfigForTests()
    expect(() => loadConfig({})).toThrow()
  })

  it('coerces a numeric CFB_SEASON override', () => {
    const config = loadConfig({ ...VALID_ENV, CFB_SEASON: '2022' })
    expect(config.cfbSeasonOverride).toBe(2022)
    expect(config.defaultSeason).toBe(2022)
  })

  it('treats an empty-string CFB_SEASON as unset', () => {
    const config = loadConfig({ ...VALID_ENV, CFB_SEASON: '' })
    expect(config.cfbSeasonOverride).toBeUndefined()
  })

  it('rejects a non-numeric CFB_SEASON', () => {
    expect(() => loadConfig({ ...VALID_ENV, CFB_SEASON: 'not-a-year' })).toThrowError(/CFB_SEASON/)
  })

  it('parses without ANTHROPIC_API_KEY (Phase-A commands keep working)', () => {
    const config = loadConfig(VALID_ENV)
    expect(config.anthropicApiKey).toBeUndefined()
  })

  it('picks up ANTHROPIC_API_KEY when set', () => {
    const config = loadConfig({ ...VALID_ENV, ANTHROPIC_API_KEY: 'sk-ant-test' })
    expect(config.anthropicApiKey).toBe('sk-ant-test')
  })

  it('treats an empty-string ANTHROPIC_API_KEY as unset', () => {
    const config = loadConfig({ ...VALID_ENV, ANTHROPIC_API_KEY: '  ' })
    expect(config.anthropicApiKey).toBeUndefined()
  })

  it('defaults the three model IDs when unset', () => {
    const config = loadConfig(VALID_ENV)
    expect(config.modelDefault).toBe('claude-sonnet-5')
    expect(config.modelAdvisor).toBe('claude-opus-4-8')
    expect(config.modelRouter).toBe('claude-haiku-4-5')
  })

  it('honors MODEL_DEFAULT / MODEL_ADVISOR / MODEL_ROUTER overrides', () => {
    const config = loadConfig({
      ...VALID_ENV,
      MODEL_DEFAULT: 'model-a',
      MODEL_ADVISOR: 'model-b',
      MODEL_ROUTER: 'model-c',
    })
    expect(config.modelDefault).toBe('model-a')
    expect(config.modelAdvisor).toBe('model-b')
    expect(config.modelRouter).toBe('model-c')
  })

  it('treats empty-string model overrides as unset (falls back to defaults)', () => {
    const config = loadConfig({ ...VALID_ENV, MODEL_DEFAULT: '', MODEL_ROUTER: ' ' })
    expect(config.modelDefault).toBe('claude-sonnet-5')
    expect(config.modelRouter).toBe('claude-haiku-4-5')
  })

  it('defaults profilesPath and the limits guards when unset', () => {
    const config = loadConfig(VALID_ENV)
    expect(config.profilesPath).toBe('data/profiles.json')
    expect(config.cooldownSeconds).toBe(20)
    expect(config.userDailyLimit).toBe(10)
    expect(config.dailyBudgetUsd).toBe(10)
    expect(config.webSearchMaxUses).toBe(3)
  })

  it('honors WEB_SEARCH_MAX_USES, including 0 as an explicit kill switch', () => {
    expect(loadConfig({ ...VALID_ENV, WEB_SEARCH_MAX_USES: '5' }).webSearchMaxUses).toBe(5)
    resetConfigForTests()
    expect(loadConfig({ ...VALID_ENV, WEB_SEARCH_MAX_USES: '0' }).webSearchMaxUses).toBe(0)
    resetConfigForTests()
    // Empty string is "unset", not 0 -- falls back to the default.
    expect(loadConfig({ ...VALID_ENV, WEB_SEARCH_MAX_USES: ' ' }).webSearchMaxUses).toBe(3)
  })

  it('rejects a fractional or negative WEB_SEARCH_MAX_USES at boot', () => {
    // A fraction would be sent verbatim as the tool's max_uses and make the
    // API reject every conversational request -- fail the boot instead.
    expect(() => loadConfig({ ...VALID_ENV, WEB_SEARCH_MAX_USES: '0.5' })).toThrow(/WEB_SEARCH_MAX_USES/)
    resetConfigForTests()
    // Only an explicit 0 may act as the kill switch.
    expect(() => loadConfig({ ...VALID_ENV, WEB_SEARCH_MAX_USES: '-1' })).toThrow(/WEB_SEARCH_MAX_USES/)
  })

  it('honors PROFILES_PATH / COOLDOWN_SECONDS / USER_DAILY_LIMIT / DAILY_BUDGET_USD overrides', () => {
    const config = loadConfig({
      ...VALID_ENV,
      PROFILES_PATH: '/tmp/profiles.json',
      COOLDOWN_SECONDS: '5',
      USER_DAILY_LIMIT: '25',
      DAILY_BUDGET_USD: '50.5',
    })
    expect(config.profilesPath).toBe('/tmp/profiles.json')
    expect(config.cooldownSeconds).toBe(5)
    expect(config.userDailyLimit).toBe(25)
    expect(config.dailyBudgetUsd).toBe(50.5)
  })

  it('treats empty-string limits overrides as unset (falls back to defaults)', () => {
    const config = loadConfig({ ...VALID_ENV, COOLDOWN_SECONDS: '', DAILY_BUDGET_USD: '  ' })
    expect(config.cooldownSeconds).toBe(20)
    expect(config.dailyBudgetUsd).toBe(10)
  })

  it('accepts the Supabase pair when both are set', () => {
    const config = loadConfig({
      ...VALID_ENV,
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    })
    expect(config.supabaseUrl).toBe('https://project.supabase.co')
    expect(config.supabaseServiceRoleKey).toBe('service-role-key')
  })

  it('leaves the Supabase pair undefined when neither is set', () => {
    const config = loadConfig(VALID_ENV)
    expect(config.supabaseUrl).toBeUndefined()
    expect(config.supabaseServiceRoleKey).toBeUndefined()
    expect(config.memoryPath).toBe('data/memory.json')
  })

  it('rejects a half-configured Supabase pair', () => {
    expect(() => loadConfig({ ...VALID_ENV, SUPABASE_URL: 'https://project.supabase.co' })).toThrowError(
      /SUPABASE_SERVICE_ROLE_KEY/
    )
    expect(() => loadConfig({ ...VALID_ENV, SUPABASE_SERVICE_ROLE_KEY: 'key' })).toThrowError(/SUPABASE_URL/)
  })

  it('rejects a non-URL SUPABASE_URL', () => {
    expect(() =>
      loadConfig({ ...VALID_ENV, SUPABASE_URL: 'not-a-url', SUPABASE_SERVICE_ROLE_KEY: 'key' })
    ).toThrowError(/SUPABASE_URL/)
  })
})

describe('loadConfig allowedGuildIds', () => {
  it('parses a single guild ID into a one-element allowlist', () => {
    const config = loadConfig({ ...VALID_ENV, DISCORD_GUILD_ID: 'guild-a' })
    expect(config.allowedGuildIds).toEqual(['guild-a'])
  })

  it('parses a comma-separated list into N entries, order preserved', () => {
    const config = loadConfig({ ...VALID_ENV, DISCORD_GUILD_ID: 'guild-a,guild-b,guild-c' })
    expect(config.allowedGuildIds).toEqual(['guild-a', 'guild-b', 'guild-c'])
  })

  it('trims whitespace around each entry and drops empty ones', () => {
    const config = loadConfig({ ...VALID_ENV, DISCORD_GUILD_ID: ' guild-a , guild-b ,, guild-c ' })
    expect(config.allowedGuildIds).toEqual(['guild-a', 'guild-b', 'guild-c'])
  })

  it('sets discordGuildId to the first entry for backwards compatibility', () => {
    const config = loadConfig({ ...VALID_ENV, DISCORD_GUILD_ID: 'guild-a,guild-b' })
    expect(config.discordGuildId).toBe('guild-a')
  })

  // Without this, the bot boots cleanly, registers zero commands, and refuses
  // every guild -- a silent no-op that looks like a Discord problem rather
  // than a config one. Fail at startup instead.
  it('rejects a value that parses to zero usable guild IDs', () => {
    expect(() => loadConfig({ ...VALID_ENV, DISCORD_GUILD_ID: ' , , ' })).toThrow(
      /at least one guild ID/
    )
  })
})

describe('isAllowedGuild', () => {
  beforeEach(() => {
    resetConfigForTests()
    loadConfig({ ...VALID_ENV, DISCORD_GUILD_ID: 'guild-a,guild-b' })
  })

  it('is true for a guild in the allowlist', () => {
    expect(isAllowedGuild('guild-a')).toBe(true)
    expect(isAllowedGuild('guild-b')).toBe(true)
  })

  it('is false for a guild not in the allowlist', () => {
    expect(isAllowedGuild('stranger-guild')).toBe(false)
  })

  it('is false for null/undefined (DMs)', () => {
    expect(isAllowedGuild(null)).toBe(false)
    expect(isAllowedGuild(undefined)).toBe(false)
  })
})

describe('deriveDefaultSeason', () => {
  it('returns the override when given, ignoring the date', () => {
    expect(deriveDefaultSeason(1999, new Date('2026-01-01T00:00:00Z'))).toBe(1999)
  })

  it('returns the current year from August 1 onward', () => {
    expect(deriveDefaultSeason(undefined, new Date('2025-08-01T00:00:00Z'))).toBe(2025)
  })

  it('returns the current year in December', () => {
    expect(deriveDefaultSeason(undefined, new Date('2025-12-31T00:00:00Z'))).toBe(2025)
  })

  it('returns the prior year in July', () => {
    expect(deriveDefaultSeason(undefined, new Date('2025-07-31T00:00:00Z'))).toBe(2024)
  })

  it('returns the prior year in January', () => {
    expect(deriveDefaultSeason(undefined, new Date('2026-01-15T00:00:00Z'))).toBe(2025)
  })

  it('pivots exactly at the August 1 boundary', () => {
    expect(deriveDefaultSeason(undefined, new Date('2025-07-31T23:59:59Z'))).toBe(2024)
    expect(deriveDefaultSeason(undefined, new Date('2025-08-01T00:00:01Z'))).toBe(2025)
  })
})
