import { describe, it, expect, beforeEach } from 'vitest'
import { loadConfig, deriveDefaultSeason, resetConfigForTests } from '../config.js'

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
