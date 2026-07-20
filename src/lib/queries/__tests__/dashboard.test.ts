/**
 * Unit tests for getStandings() in src/lib/queries/dashboard.ts.
 *
 * getStandings joins three parallel queries (team_epa_season, team_special_teams_sos,
 * api.team_history) against the FBS team lookup, computes a weighted composite
 * score per team, sorts descending, and assigns 1-based ranks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getStandings } from '../dashboard'
import { createSupabaseMock, dbError, ok, type SupabaseMockConfig } from './helpers'
import { createTeamsWithLogosRows } from './fixtures/shared'
import {
  createStandingsScenario,
  createTeamEpaRankRow,
  createTeamSpecialTeamsRow,
  createTeamHistoryRecordRow,
} from './fixtures/dashboard'

function mockClient(config: SupabaseMockConfig) {
  vi.mocked(createClient).mockResolvedValue(
    createSupabaseMock(config) as unknown as Awaited<ReturnType<typeof createClient>>
  )
}

describe('getStandings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('computes weighted composite scores, sorts descending, and assigns 1-based ranks', async () => {
    const scenario = createStandingsScenario()
    mockClient({
      tables: {
        teams_with_logos: ok(createTeamsWithLogosRows()),
        team_epa_season: ok(scenario.metrics),
        team_special_teams_sos: ok(scenario.specialTeams),
      },
      apiTables: {
        team_history: ok(scenario.records),
      },
    })

    const result = await getStandings(2025, 10)

    // Only teams with EPA metrics appear (Ohio State, Houston have none -> excluded).
    expect(result.map(s => s.team)).toEqual(['Texas', 'Oklahoma', 'Alabama'])
    expect(result.map(s => s.rank)).toEqual([1, 2, 3])

    const oklahoma = result.find(s => s.team === 'Oklahoma')!
    expect(oklahoma.compositeScore).toBeCloseTo(90.52238805970148, 9)
    expect(oklahoma.wins).toBe(9)
    expect(oklahoma.losses).toBe(1)
    expect(oklahoma.logo).toBe('https://logos/ou.png')
    expect(oklahoma.color).toBe('#841617')

    const texas = result.find(s => s.team === 'Texas')!
    expect(texas.compositeScore).toBeCloseTo(97.84079601990052, 9)

    // Alabama has metrics but no special-teams or record row: defaults to
    // sp_st_rating 0 and wins/losses 0 rather than throwing.
    const alabama = result.find(s => s.team === 'Alabama')!
    expect(alabama.compositeScore).toBeCloseTo(76.56716417910448, 9)
    expect(alabama.wins).toBe(0)
    expect(alabama.losses).toBe(0)
  })

  it('excludes teams with no EPA metrics row even if they are FBS', async () => {
    mockClient({
      tables: {
        teams_with_logos: ok(createTeamsWithLogosRows()), // includes Ohio State, Houston
        team_epa_season: ok([createTeamEpaRankRow({ team: 'Oklahoma' })]),
        team_special_teams_sos: ok([createTeamSpecialTeamsRow({ team: 'Oklahoma' })]),
      },
      apiTables: {
        team_history: ok([createTeamHistoryRecordRow({ team: 'Oklahoma' })]),
      },
    })

    const result = await getStandings(2025, 10)

    expect(result).toHaveLength(1)
    expect(result[0].team).toBe('Oklahoma')
  })

  it('respects the limit parameter after sorting', async () => {
    const scenario = createStandingsScenario()
    mockClient({
      tables: {
        teams_with_logos: ok(createTeamsWithLogosRows()),
        team_epa_season: ok(scenario.metrics),
        team_special_teams_sos: ok(scenario.specialTeams),
      },
      apiTables: {
        team_history: ok(scenario.records),
      },
    })

    const result = await getStandings(2025, 2)

    expect(result).toHaveLength(2)
    expect(result.map(s => s.team)).toEqual(['Texas', 'Oklahoma'])
  })

  it('returns an empty list when the team lookup is empty (no FBS teams to score)', async () => {
    const scenario = createStandingsScenario()
    mockClient({
      tables: {
        teams_with_logos: ok([]),
        team_epa_season: ok(scenario.metrics),
        team_special_teams_sos: ok(scenario.specialTeams),
      },
      apiTables: {
        team_history: ok(scenario.records),
      },
    })

    const result = await getStandings(2025, 10)

    expect(result).toEqual([])
  })

  it('returns an empty list, not a throw, when the EPA metrics query errors', async () => {
    const scenario = createStandingsScenario()
    mockClient({
      tables: {
        teams_with_logos: ok(createTeamsWithLogosRows()),
        team_epa_season: dbError('metrics query failed'),
        team_special_teams_sos: ok(scenario.specialTeams),
      },
      apiTables: {
        team_history: ok(scenario.records),
      },
    })

    const result = await getStandings(2025, 10)

    // No team has metrics -> every team is skipped by `if (!teamMetrics) continue`.
    expect(result).toEqual([])
  })

  it('defaults special-teams rating to 0 (not a throw) when that query errors', async () => {
    mockClient({
      tables: {
        teams_with_logos: ok(createTeamsWithLogosRows()),
        team_epa_season: ok([createTeamEpaRankRow({ team: 'Oklahoma', off_epa_rank: 5, def_epa_rank: 10 })]),
        team_special_teams_sos: dbError('special teams query failed'),
      },
      apiTables: {
        team_history: ok([createTeamHistoryRecordRow({ team: 'Oklahoma' })]),
      },
    })

    const result = await getStandings(2025, 10)

    expect(result).toHaveLength(1)
    // stRating defaults to 0 -> stScore = (0+3)/6*100 = 50
    const offScore = ((134 - 5) / 134) * 100
    const defScore = ((134 - 10) / 134) * 100
    const expected = offScore * 0.4 + defScore * 0.4 + 50 * 0.2
    expect(result[0].compositeScore).toBeCloseTo(expected, 9)
  })

  it('defaults wins/losses to 0 (not a throw) when the records query errors', async () => {
    mockClient({
      tables: {
        teams_with_logos: ok(createTeamsWithLogosRows()),
        team_epa_season: ok([createTeamEpaRankRow({ team: 'Oklahoma' })]),
        team_special_teams_sos: ok([createTeamSpecialTeamsRow({ team: 'Oklahoma' })]),
      },
      apiTables: {
        team_history: dbError('records query failed'),
      },
    })

    const result = await getStandings(2025, 10)

    expect(result).toHaveLength(1)
    expect(result[0].wins).toBe(0)
    expect(result[0].losses).toBe(0)
  })
})
