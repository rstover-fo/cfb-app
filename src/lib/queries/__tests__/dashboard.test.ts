/**
 * Unit tests for getStandings() and getStatLeaders() in src/lib/queries/dashboard.ts.
 *
 * getStandings joins three parallel queries (team_epa_season, team_special_teams_sos,
 * api.team_history) against the FBS team lookup, computes a weighted composite
 * score per team, sorts descending, and assigns 1-based ranks.
 *
 * getStatLeaders joins team_epa_season + defensive_havoc against the FBS team
 * lookup and produces five top-5 leaderboards (epa, defEpa, havoc, successRate,
 * explosiveness).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getStandings, getStatLeaders, getDataFreshness, getFreshestUpdateDays } from '../dashboard'
import { createSupabaseMock, dbError, ok, type SupabaseMockConfig } from './helpers'
import { createTeamsWithLogosRows } from './fixtures/shared'
import {
  createStandingsScenario,
  createTeamEpaRankRow,
  createTeamSpecialTeamsRow,
  createTeamHistoryRecordRow,
  createRawDataFreshnessRow,
  createDataFreshnessScenario,
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

describe('getStatLeaders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Oklahoma/Texas/Alabama are FBS per createTeamsWithLogosRows(); "Nobody
  // State" is not in the team lookup at all -- simulates an FCS/unlisted
  // school slipping into team_epa_season.
  const epaRows = [
    { team: 'Oklahoma', epa_per_play: 0.25, success_rate: 0.48, explosiveness: 1.3 },
    { team: 'Texas', epa_per_play: 0.32, success_rate: 0.52, explosiveness: 1.5 },
    { team: 'Alabama', epa_per_play: 0.1, success_rate: 0.4, explosiveness: 1.1 },
    { team: 'Nobody State', epa_per_play: 0.9, success_rate: 0.9, explosiveness: 3.0 },
  ]
  // opp_epa_per_play rides on defensive_havoc, NOT team_epa_season -- see
  // getStatLeaders: selecting it from team_epa_season would 400 the query.
  const havocRows = [
    { team: 'Oklahoma', havoc_rate: 0.18, opp_epa_per_play: -0.05, front_seven_havoc_rate: 0.12, db_havoc_rate: 0.06 },
    { team: 'Texas', havoc_rate: 0.22, opp_epa_per_play: -0.18, front_seven_havoc_rate: 0.15, db_havoc_rate: 0.07 },
    { team: 'Alabama', havoc_rate: 0.1, opp_epa_per_play: 0.02, front_seven_havoc_rate: 0.08, db_havoc_rate: 0.02 },
    { team: 'Nobody State', havoc_rate: 0.5, opp_epa_per_play: -0.9, front_seven_havoc_rate: 0.3, db_havoc_rate: 0.2 },
  ]

  it('excludes teams absent from the FBS team lookup', async () => {
    mockClient({
      tables: {
        teams_with_logos: ok(createTeamsWithLogosRows()), // does not include "Nobody State"
        team_epa_season: ok(epaRows),
        defensive_havoc: ok(havocRows),
      },
    })

    const result = await getStatLeaders(2025)

    expect(result.epa.some(l => l.team === 'Nobody State')).toBe(false)
    expect(result.havoc.some(l => l.team === 'Nobody State')).toBe(false)
    expect(result.defEpa.some(l => l.team === 'Nobody State')).toBe(false)
    expect(result.successRate.some(l => l.team === 'Nobody State')).toBe(false)
    expect(result.explosiveness.some(l => l.team === 'Nobody State')).toBe(false)
  })

  it('sorts defensive EPA ascending -- lower opponent EPA/play is better', async () => {
    mockClient({
      tables: {
        teams_with_logos: ok(createTeamsWithLogosRows()),
        team_epa_season: ok(epaRows),
        defensive_havoc: ok(havocRows),
      },
    })

    const result = await getStatLeaders(2025)

    // Texas (-0.18) allows the fewest EPA/play, then Oklahoma (-0.05), then Alabama (+0.02).
    expect(result.defEpa.map(l => l.team)).toEqual(['Texas', 'Oklahoma', 'Alabama'])
    expect(result.defEpa.map(l => l.value)).toEqual([-0.18, -0.05, 0.02])
  })

  it('sorts offensive EPA descending -- higher EPA/play is better', async () => {
    mockClient({
      tables: {
        teams_with_logos: ok(createTeamsWithLogosRows()),
        team_epa_season: ok(epaRows),
        defensive_havoc: ok(havocRows),
      },
    })

    const result = await getStatLeaders(2025)

    expect(result.epa.map(l => l.team)).toEqual(['Texas', 'Oklahoma', 'Alabama'])
  })

  it('returns each leaderboard as {team, logo, color, value} rows enriched from the team lookup, capped at 5', async () => {
    mockClient({
      tables: {
        teams_with_logos: ok(createTeamsWithLogosRows()),
        team_epa_season: ok(epaRows),
        defensive_havoc: ok(havocRows),
      },
    })

    const result = await getStatLeaders(2025)

    for (const list of [result.epa, result.defEpa, result.havoc, result.successRate, result.explosiveness]) {
      expect(list.length).toBeLessThanOrEqual(5)
      for (const leader of list) {
        expect(leader).toHaveProperty('team')
        expect(leader).toHaveProperty('logo')
        expect(leader).toHaveProperty('color')
        expect(leader).toHaveProperty('value')
      }
    }

    const oklahoma = result.epa.find(l => l.team === 'Oklahoma')!
    expect(oklahoma.logo).toBe('https://logos/ou.png')
    expect(oklahoma.color).toBe('#841617')
  })

  it('excludes teams missing opp_epa_per_play from the defensive EPA leaderboard without throwing', async () => {
    mockClient({
      tables: {
        teams_with_logos: ok(createTeamsWithLogosRows()),
        team_epa_season: ok([
          { team: 'Oklahoma', epa_per_play: 0.25, success_rate: 0.48, explosiveness: 1.3 },
        ]),
        defensive_havoc: ok([
          { team: 'Oklahoma', havoc_rate: 0.18, opp_epa_per_play: null },
        ]),
      },
    })

    const result = await getStatLeaders(2025)

    expect(result.defEpa).toEqual([])
    // Other leaderboards are unaffected by the missing opp_epa_per_play.
    expect(result.epa).toHaveLength(1)
    expect(result.havoc).toHaveLength(1)
  })

  it('returns empty leaderboards, not a throw, when a query errors', async () => {
    mockClient({
      tables: {
        teams_with_logos: ok(createTeamsWithLogosRows()),
        team_epa_season: dbError('metrics query failed'),
        defensive_havoc: dbError('havoc query failed'),
      },
    })

    const result = await getStatLeaders(2025)

    expect(result).toEqual({ epa: [], defEpa: [], havoc: [], successRate: [], explosiveness: [] })
  })
})

describe('getDataFreshness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('camelCases the raw RPC rows', async () => {
    mockClient({ rpc: { get_data_freshness: ok([createRawDataFreshnessRow()]) } })

    const result = await getDataFreshness()

    expect(result).toEqual([
      {
        schemaName: 'marts',
        tableName: 'team_epa_season',
        rowCount: 134,
        expectedRefreshFrequency: 'daily',
        daysSinceActivity: 0.5,
        isStale: false,
      },
    ])
  })

  it('returns an empty list, not a throw, when the RPC errors', async () => {
    mockClient({ rpc: { get_data_freshness: dbError('boom') } })

    const result = await getDataFreshness()

    expect(result).toEqual([])
  })

  it('returns an empty list when the RPC resolves with no data', async () => {
    mockClient({ rpc: { get_data_freshness: ok(null) } })

    const result = await getDataFreshness()

    expect(result).toEqual([])
  })
})

describe('getFreshestUpdateDays', () => {
  it('returns the minimum days_since_activity across tracked tables, ignoring nulls', async () => {
    mockClient({ rpc: { get_data_freshness: ok(createDataFreshnessScenario()) } })

    const rows = await getDataFreshness()

    expect(getFreshestUpdateDays(rows)).toBe(0.125)
  })

  it('returns null when every row has a null days_since_activity', () => {
    const rows = [
      { schemaName: 'marts', tableName: 'recruiting', rowCount: 1, expectedRefreshFrequency: 'yearly', daysSinceActivity: null, isStale: true },
    ]

    expect(getFreshestUpdateDays(rows)).toBeNull()
  })

  it('returns null for an empty row set', () => {
    expect(getFreshestUpdateDays([])).toBeNull()
  })
})
