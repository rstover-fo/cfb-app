import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  loadConfig,
  deriveDefaultSeason,
  isAllowedGuild,
  resetConfigForTests,
  refreshSeasonState,
  getSeasonState,
  getDefaultSeason,
} from '../config.js'

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

/** Builds a fetchImpl-shaped fake for refreshSeasonState -- only .ok/.json() are ever read. */
function fakeFetch(body: unknown, ok = true): typeof fetch {
  return vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body })) as unknown as typeof fetch
}

describe('refreshSeasonState / getSeasonState / getDefaultSeason (R15/R16)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetConfigForTests()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    // vi.spyOn on an already-mocked console.warn returns the SAME mock
    // (call counts carried over) rather than a fresh one -- restore it so
    // each test's toHaveBeenCalledTimes assertion starts from zero.
    warnSpy.mockRestore()
  })

  it('populates getSeasonState/getDefaultSeason from a successful /api/season fetch', async () => {
    loadConfig(VALID_ENV)
    const fetchImpl = fakeFetch({ season: 2026, through_week: 2, is_live: true, source: 'games' })

    await refreshSeasonState(fetchImpl)

    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/api/season', expect.anything())
    expect(getDefaultSeason()).toBe(2026)
    expect(getSeasonState().through_week).toBe(2)
    expect(getSeasonState().source).toBe('games')
  })

  it('short-circuits on CFB_SEASON without calling fetch', async () => {
    loadConfig({ ...VALID_ENV, CFB_SEASON: '2025' })
    const fetchImpl = fakeFetch({ season: 9999, through_week: 1, source: 'games' })

    await refreshSeasonState(fetchImpl)

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(getDefaultSeason()).toBe(2025)
    expect(getSeasonState().source).toBe('override')
  })

  it('falls back to the calendar rule (with one warning) when the fetch throws and no prior state exists', async () => {
    loadConfig(VALID_ENV)
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch

    const state = await refreshSeasonState(fetchImpl)

    expect(state.source).toBe('calendar')
    expect(state.season).toBe(deriveDefaultSeason())
    expect(getDefaultSeason()).toBe(deriveDefaultSeason())
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('keeps the previous good value when a later refresh fails, and warns only once', async () => {
    loadConfig(VALID_ENV)
    await refreshSeasonState(fakeFetch({ season: 2026, through_week: 2, source: 'games' }))
    expect(getDefaultSeason()).toBe(2026)

    const failingFetch = vi.fn(async () => {
      throw new Error('timeout')
    }) as unknown as typeof fetch

    const state = await refreshSeasonState(failingFetch)
    expect(state.season).toBe(2026)
    expect(state.through_week).toBe(2)
    expect(getDefaultSeason()).toBe(2026)

    // A second consecutive failure must not warn again -- only the first
    // failure in a streak logs, per config.ts's hasWarnedSeasonFetchFailure.
    await refreshSeasonState(failingFetch)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('rejects an unexpected fetch response shape and falls back like any other failure', async () => {
    loadConfig(VALID_ENV)
    const fetchImpl = fakeFetch({ nonsense: true })

    const state = await refreshSeasonState(fetchImpl)

    expect(state.source).toBe('calendar')
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('treats a non-2xx response as a failed fetch', async () => {
    loadConfig(VALID_ENV)
    const fetchImpl = fakeFetch({ season: 2026, through_week: 2, source: 'games' }, false)

    const state = await refreshSeasonState(fetchImpl)

    expect(state.source).toBe('calendar')
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('keeps the previous good season across a non-2xx response', async () => {
    loadConfig(VALID_ENV)
    await refreshSeasonState(fakeFetch({ season: 2026, through_week: 2, source: 'games' }))
    expect(getDefaultSeason()).toBe(2026)

    const state = await refreshSeasonState(fakeFetch({ season: 2027, through_week: 1, source: 'games' }, false))

    expect(state.season).toBe(2026)
    expect(getDefaultSeason()).toBe(2026)
  })

  it('keeps the previous good season when the app reports a fallback', async () => {
    loadConfig(VALID_ENV)
    await refreshSeasonState(fakeFetch({ season: 2026, through_week: 2, source: 'games' }))
    expect(getDefaultSeason()).toBe(2026)

    const state = await refreshSeasonState(fakeFetch({ season: 2020, through_week: null, source: 'fallback' }))

    expect(state.season).toBe(2026)
    expect(state.source).toBe('games')
    expect(getDefaultSeason()).toBe(2026)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('accepts a fallback body on first resolution', async () => {
    loadConfig(VALID_ENV)
    const state = await refreshSeasonState(fakeFetch({ season: 2020, through_week: null, source: 'fallback' }))

    expect(state.season).toBe(2020)
    expect(state.source).toBe('fallback')
    expect(getDefaultSeason()).toBe(2020)
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

describe('getSeasonState honors CFB_SEASON before the first refresh', () => {
  it('honours CFB_SEASON before the first refresh', () => {
    loadConfig({ ...VALID_ENV, CFB_SEASON: '2025' })

    expect(getDefaultSeason()).toBe(2025)
    expect(getSeasonState().source).toBe('override')
  })

  it('falls back to the calendar guess pre-refresh when no override is set', () => {
    loadConfig(VALID_ENV)

    expect(getSeasonState().source).toBe('calendar')
    expect(getDefaultSeason()).toBe(deriveDefaultSeason())
  })
})
