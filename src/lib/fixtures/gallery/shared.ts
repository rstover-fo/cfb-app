/**
 * Shared helpers for the dev chart gallery fixtures (src/app/dev/charts).
 * Pure TS only -- no vitest, no supabase, safe to import from a rendered
 * page. See docs/chart-style-spec.md for the chart contract these fixtures
 * feed.
 */

/**
 * Hand-authored brand hex for a subset of well-known FBS programs (public
 * knowledge, not from any MCP tool) -- enough to give the ScatterPlot/radar
 * pools believable per-team ink. Everything else in a fixture pool falls
 * back to `FALLBACK_TEAM_COLOR` (a muted neutral token), matching the "team
 * colors pass through resolveColor, missing ones fall back" rule (spec §6).
 */
export const TEAM_COLORS: Record<string, string> = {
  'Ohio State': '#ce1141', // real value from CFBD MCP query_team('Ohio State').team_detail.color
  Texas: '#BF5700',
  Oklahoma: '#841617',
  Alabama: '#9E1B32',
  Georgia: '#BA0C2F',
  Indiana: '#990000',
  Oregon: '#154733',
  'Notre Dame': '#0C2340',
  Miami: '#F47321',
  'Texas A&M': '#500000',
  Michigan: '#00274C',
  'Penn State': '#041E42',
  Tennessee: '#FF8200',
  Vanderbilt: '#866D4B',
  BYU: '#002E5D',
  'Texas Tech': '#CC0000',
  'Ole Miss': '#14213D',
  USC: '#990000',
  Washington: '#4B2E83',
  Utah: '#CC0000',
  TCU: '#4D1979',
  Missouri: '#F1B82D',
  'Iowa State': '#C8102E',
  Illinois: '#E84A27',
  Arizona: '#AB0520',
  'Boise State': '#0033A0',
  'James Madison': '#450084',
  'North Texas': '#00853E',
  Louisville: '#AD0000',
  Virginia: '#232D4B',
  Cincinnati: '#E00122',
  'South Florida': '#006747',
  Houston: '#C8102E',
  'Florida State': '#782F40',
}

/** Muted neutral fallback for teams outside the hand map (spec §6). */
export const FALLBACK_TEAM_COLOR = 'var(--color-neutral)'

export function teamColor(school: string): string {
  return TEAM_COLORS[school] ?? FALLBACK_TEAM_COLOR
}
