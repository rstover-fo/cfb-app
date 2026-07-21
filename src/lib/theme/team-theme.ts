/**
 * Team theme registry.
 *
 * A "team theme" is an opt-in, cookie-backed CSS overlay that recolors the
 * shared --accent* design tokens (see globals.css `[data-team-theme="…"]`
 * scopes). It is deliberately generic — driven by a team key, not by any
 * team-specific logic in shared components — so additional team palettes can
 * be added later just by extending TEAM_THEMES and globals.css. Only the
 * Oklahoma (OU) palette ships today.
 */

export const TEAM_THEME_COOKIE = 'cfb-team-theme'

/** One year, in seconds. */
export const TEAM_THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export interface TeamThemeConfig {
  /** Value stored in the cookie / `data-team-theme` attribute. */
  key: string
  /** Label shown on the opt-in toggle, e.g. "Sooner Mode". */
  label: string
}

/** Team slug (see teamNameToSlug) -> theme config. */
export const TEAM_THEMES: Record<string, TeamThemeConfig> = {
  oklahoma: { key: 'ou', label: 'Sooner Mode' },
}

const VALID_THEME_KEYS = new Set(Object.values(TEAM_THEMES).map((t) => t.key))

/** Theme config for a given team slug, or null if that team has no theme. */
export function themeConfigForSlug(slug: string): TeamThemeConfig | null {
  return TEAM_THEMES[slug] ?? null
}

/**
 * Parse a raw cookie value into a known, valid theme key.
 * Returns null for missing/empty/unrecognized values so callers never have
 * to trust unsanitized cookie input as a CSS attribute value.
 */
export function parseTeamThemeCookie(value: string | undefined | null): string | null {
  if (!value) return null
  return VALID_THEME_KEYS.has(value) ? value : null
}
