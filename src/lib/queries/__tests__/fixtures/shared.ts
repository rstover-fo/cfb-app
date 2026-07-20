/**
 * Fixtures for the `teams_with_logos` view — the row shape behind
 * getTeamLookup() in src/lib/queries/shared.ts. Consumed by any query test
 * that enriches results with logo/color/conference.
 */

export interface TeamsWithLogosRow {
  school: string
  logo: string | null
  color: string | null
  conference: string | null
}

export function createTeamsWithLogosRow(
  overrides: Partial<TeamsWithLogosRow> = {}
): TeamsWithLogosRow {
  return {
    school: 'Oklahoma',
    logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500/201.png',
    color: '#841617',
    conference: 'SEC',
    ...overrides,
  }
}

/** A small FBS team lookup covering the schools used across the fixtures below. */
export function createTeamsWithLogosRows(): TeamsWithLogosRow[] {
  return [
    createTeamsWithLogosRow({ school: 'Oklahoma', logo: 'https://logos/ou.png', color: '#841617', conference: 'SEC' }),
    createTeamsWithLogosRow({ school: 'Texas', logo: 'https://logos/tex.png', color: '#BF5700', conference: 'SEC' }),
    createTeamsWithLogosRow({ school: 'Alabama', logo: 'https://logos/bama.png', color: '#9E1B32', conference: 'SEC' }),
    createTeamsWithLogosRow({ school: 'Ohio State', logo: 'https://logos/osu.png', color: '#BB0000', conference: 'Big Ten' }),
    createTeamsWithLogosRow({ school: 'Houston', logo: 'https://logos/houston.png', color: '#C8102E', conference: 'Big 12' }),
  ]
}
