/**
 * Unit tests for src/lib/queries/playcalling.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getPlaycallingProfile, getAdjustedEpaWeeks, getTeamWeekFeatures } from '../playcalling'
import { createSupabaseMock, dbError, ok, type SupabaseMockConfig } from './helpers'
import {
  createPlaycallingProfileRow,
  createAdjustedEpaWeekRows,
  createTeamWeekFeatureRows,
} from './fixtures/playcalling'

function mockClient(config: SupabaseMockConfig) {
  const mock = createSupabaseMock(config)
  vi.mocked(createClient).mockResolvedValue(mock as unknown as Awaited<ReturnType<typeof createClient>>)
  return mock
}

/** The chain object returned by the Nth `.schema('api').from(...)` call this test made. */
function apiChain(mock: ReturnType<typeof createSupabaseMock>, callIndex = 0) {
  return mock.schema.mock.results[callIndex].value.from.mock.results[0].value
}

describe('getPlaycallingProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the season playcalling profile for the given team + season', async () => {
    const mock = mockClient({ apiTables: { team_playcalling_profile: ok(createPlaycallingProfileRow()) } })

    const result = await getPlaycallingProfile('Ohio State', 2025)

    expect(result).toEqual(createPlaycallingProfileRow())
    expect(result!.overall_run_rate).toBe(0.412)
    expect(result!.run_rate_delta).toBe(0.177)
    expect(result!.overall_epa_pctl).toBe(0.91)

    const chain = apiChain(mock)
    expect(mock.schema).toHaveBeenCalledWith('api')
    expect(chain.eq).toHaveBeenCalledWith('team', 'Ohio State')
    expect(chain.eq).toHaveBeenCalledWith('season', 2025)
  })

  it('returns null when no row is found (not enough qualifying plays -- not an error)', async () => {
    mockClient({ apiTables: { team_playcalling_profile: ok(null) } })

    expect(await getPlaycallingProfile('Directional State', 2025)).toBeNull()
  })

  it('returns null (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { team_playcalling_profile: dbError() } })

    expect(await getPlaycallingProfile('Ohio State', 2025)).toBeNull()
  })
})

describe('getAdjustedEpaWeeks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the team+season week arc ordered week_index ascending', async () => {
    mockClient({ apiTables: { adjusted_epa_week: ok(createAdjustedEpaWeekRows()) } })

    const result = await getAdjustedEpaWeeks('Ohio State', 2025)

    expect(result).toHaveLength(4)
    expect(result.map(r => r.week_index)).toEqual([1, 2, 3, 4])
    expect(result[0].off_coef).toBe(0.142)
    expect(result[3].def_coef).toBe(-0.112)
  })

  it('filters by team + season and orders week_index ascending', async () => {
    const mock = mockClient({ apiTables: { adjusted_epa_week: ok(createAdjustedEpaWeekRows()) } })

    await getAdjustedEpaWeeks('Ohio State', 2025)

    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('team', 'Ohio State')
    expect(chain.eq).toHaveBeenCalledWith('season', 2025)
    expect(chain.order).toHaveBeenCalledWith('week_index', { ascending: true })
  })

  it('returns [] on empty data (model has not run yet for this team/season -- not an error)', async () => {
    mockClient({ apiTables: { adjusted_epa_week: ok([]) } })

    expect(await getAdjustedEpaWeeks('Ohio State', 2025)).toEqual([])
  })

  it('returns [] (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { adjusted_epa_week: dbError() } })

    expect(await getAdjustedEpaWeeks('Ohio State', 2025)).toEqual([])
  })
})

describe('getTeamWeekFeatures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the team+season week-feature arc ordered week_index ascending', async () => {
    mockClient({ apiTables: { team_week_features: ok(createTeamWeekFeatureRows()) } })

    const result = await getTeamWeekFeatures('Ohio State', 2025)

    expect(result).toHaveLength(4)
    expect(result.map(r => r.week_index)).toEqual([1, 2, 3, 4])
    expect(result[0].elo_pregame).toBe(1840.0)
    expect(result[3].elo_pregame).toBe(1875.0)
    expect(result.map(r => r.games_played_to_date)).toEqual([0, 1, 2, 3])
  })

  it('filters by team + season and orders week_index ascending', async () => {
    const mock = mockClient({ apiTables: { team_week_features: ok(createTeamWeekFeatureRows()) } })

    await getTeamWeekFeatures('Ohio State', 2025)

    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('team', 'Ohio State')
    expect(chain.eq).toHaveBeenCalledWith('season', 2025)
    expect(chain.order).toHaveBeenCalledWith('week_index', { ascending: true })
  })

  it('returns [] on empty data (feature build has not run yet for this team/season -- not an error)', async () => {
    mockClient({ apiTables: { team_week_features: ok([]) } })

    expect(await getTeamWeekFeatures('Ohio State', 2025)).toEqual([])
  })

  it('returns [] (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { team_week_features: dbError() } })

    expect(await getTeamWeekFeatures('Ohio State', 2025)).toEqual([])
  })
})
