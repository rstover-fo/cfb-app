import { describe, it, expect } from 'vitest'
import { parseTeamThemeCookie, themeConfigForSlug, TEAM_THEME_COOKIE } from './team-theme'

describe('parseTeamThemeCookie', () => {
  it('accepts a known theme key', () => {
    expect(parseTeamThemeCookie('ou')).toBe('ou')
  })

  it('rejects unknown values', () => {
    expect(parseTeamThemeCookie('texas')).toBeNull()
    expect(parseTeamThemeCookie('<script>')).toBeNull()
  })

  it('treats missing/empty values as no preference', () => {
    expect(parseTeamThemeCookie(undefined)).toBeNull()
    expect(parseTeamThemeCookie(null)).toBeNull()
    expect(parseTeamThemeCookie('')).toBeNull()
  })
})

describe('themeConfigForSlug', () => {
  it('resolves the Oklahoma theme', () => {
    expect(themeConfigForSlug('oklahoma')).toEqual({ key: 'ou', label: 'Sooner Mode' })
  })

  it('returns null for teams without a theme', () => {
    expect(themeConfigForSlug('texas')).toBeNull()
    expect(themeConfigForSlug('alabama')).toBeNull()
  })
})

describe('TEAM_THEME_COOKIE', () => {
  it('is a stable cookie name', () => {
    expect(TEAM_THEME_COOKIE).toBe('cfb-team-theme')
  })
})
