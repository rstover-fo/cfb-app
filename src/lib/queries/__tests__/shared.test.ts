/**
 * Unit tests for getTeamLookup() in src/lib/queries/shared.ts.
 *
 * getTeamLookup backs almost every FBS-scoped dashboard/ranking query
 * (getStandings, getStatLeaders, getRankingsForWeek, ...). It must filter
 * `teams_with_logos` on `classification`, not conference-name matching --
 * the old `.in('conference', FBS_CONFERENCES)` allowlist leaked FCS schools
 * into prod (e.g. North Dakota State on the homepage Stat Leaders).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getTeamLookup, getFBSTeams } from '../shared'
import { createSupabaseMock, ok, type SupabaseMockConfig } from './helpers'
import { createTeamsWithLogosRows } from './fixtures/shared'

function mockClient(config: SupabaseMockConfig) {
  const mock = createSupabaseMock(config)
  vi.mocked(createClient).mockResolvedValue(mock as unknown as Awaited<ReturnType<typeof createClient>>)
  return mock
}

describe('getTeamLookup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('filters teams_with_logos on classification=fbs, not conference name', async () => {
    const mock = mockClient({
      tables: { teams_with_logos: ok(createTeamsWithLogosRows()) },
    })

    await getTeamLookup()

    const chain = mock.from.mock.results[0].value
    expect(mock.from).toHaveBeenCalledWith('teams_with_logos')
    expect(chain.eq).toHaveBeenCalledWith('classification', 'fbs')
    expect(chain.in).not.toHaveBeenCalled()
  })

  it('builds a school -> {logo, color, conference} map from the response', async () => {
    mockClient({
      tables: { teams_with_logos: ok(createTeamsWithLogosRows()) },
    })

    const lookup = await getTeamLookup()

    expect(lookup.get('Oklahoma')).toEqual({
      logo: 'https://logos/ou.png',
      color: '#841617',
      conference: 'SEC',
    })
    expect(lookup.size).toBe(createTeamsWithLogosRows().length)
  })

  it('returns an empty map when the query errors', async () => {
    mockClient({
      tables: { teams_with_logos: { data: null, error: { message: 'boom' } } },
    })

    const lookup = await getTeamLookup()

    expect(lookup.size).toBe(0)
  })
})

describe('getFBSTeams', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns FBS team names sorted alphabetically', async () => {
    mockClient({
      tables: { teams_with_logos: ok(createTeamsWithLogosRows()) },
    })

    const teams = await getFBSTeams()

    expect(teams).toEqual([...teams].sort())
    expect(teams).toContain('Oklahoma')
  })
})
