/**
 * Unit tests for src/lib/queries/rankings.ts (all 5 exported functions):
 * getAvailableRankingSeasons, getAvailablePolls, getLatestRankingWeek,
 * getRankingsForWeek (best-rank-per-school dedupe, prev-week movement calc,
 * team_history records join), and getRankingsAllWeeks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  getAvailableRankingSeasons,
  getAvailablePolls,
  getLatestRankingWeek,
  getRankingsForWeek,
  getRankingsAllWeeks,
} from '../rankings'
import { CURRENT_SEASON } from '../constants'
import { createSupabaseMock, dbError, ok, type SupabaseMockConfig } from './helpers'
import { createTeamsWithLogosRows } from './fixtures/shared'
import {
  createCurrentWeekPollRows,
  createPrevWeekPollRows,
  createTeamHistoryRecordRows,
  createAllWeeksPollRows,
} from './fixtures/rankings'

function mockClient(config: SupabaseMockConfig) {
  const mock = createSupabaseMock(config)
  vi.mocked(createClient).mockResolvedValue(mock as unknown as Awaited<ReturnType<typeof createClient>>)
  return mock
}

describe('getAvailableRankingSeasons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // getAvailableRankingSeasons issues two bounded (limit=1) queries in
  // Promise.all source order: [max season (order desc), min season (order
  // asc)]. Both hit api:poll_rankings, so the response queue is consumed
  // FIFO: index 0 -> max query, index 1 -> min query.
  it('generates a contiguous descending range from two bounded max/min queries', async () => {
    mockClient({
      apiTables: {
        poll_rankings: [ok([{ season: 2025 }]), ok([{ season: 2003 }])],
      },
    })

    const result = await getAvailableRankingSeasons()

    expect(result).toHaveLength(23)
    expect(result[0]).toBe(2025)
    expect(result[result.length - 1]).toBe(2003)
    expect(result).toEqual(Array.from({ length: 23 }, (_, i) => 2025 - i))
  })

  it('issues both queries with limit(1) and opposite season orderings', async () => {
    const mock = mockClient({
      apiTables: {
        poll_rankings: [ok([{ season: 2025 }]), ok([{ season: 2003 }])],
      },
    })
    await getAvailableRankingSeasons()

    expect(mock.schema).toHaveBeenCalledTimes(2)
    const maxChain = mock.schema.mock.results[0].value.from.mock.results[0].value
    const minChain = mock.schema.mock.results[1].value.from.mock.results[0].value

    expect(maxChain.limit).toHaveBeenCalledWith(1)
    expect(minChain.limit).toHaveBeenCalledWith(1)
    expect(maxChain.order).toHaveBeenCalledWith('season', { ascending: false })
    expect(minChain.order).toHaveBeenCalledWith('season', { ascending: true })
  })

  it('falls back to [CURRENT_SEASON] (not []) on empty data, so the dropdown is never empty', async () => {
    mockClient({ apiTables: { poll_rankings: [ok([]), ok([])] } })

    expect(await getAvailableRankingSeasons()).toEqual([CURRENT_SEASON])
  })

  it('falls back to [CURRENT_SEASON] (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { poll_rankings: [dbError(), dbError()] } })

    expect(await getAvailableRankingSeasons()).toEqual([CURRENT_SEASON])
  })

  it('falls back to [CURRENT_SEASON] if only one side of the query errors', async () => {
    mockClient({ apiTables: { poll_rankings: [ok([{ season: 2025 }]), dbError()] } })

    expect(await getAvailableRankingSeasons()).toEqual([CURRENT_SEASON])
  })
})

describe('getAvailablePolls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('dedupes poll names', async () => {
    mockClient({
      apiTables: {
        poll_rankings: ok([{ poll: 'AP Top 25' }, { poll: 'Coaches Poll' }, { poll: 'AP Top 25' }]),
      },
    })

    expect(await getAvailablePolls(2025)).toEqual(['AP Top 25', 'Coaches Poll'])
  })

  it('returns [] on empty data', async () => {
    mockClient({ apiTables: { poll_rankings: ok([]) } })

    expect(await getAvailablePolls(2025)).toEqual([])
  })

  it('returns [] (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { poll_rankings: dbError() } })

    expect(await getAvailablePolls(2025)).toEqual([])
  })
})

describe('getLatestRankingWeek', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the week of the first (order=week desc, limit=1) row', async () => {
    mockClient({ apiTables: { poll_rankings: ok([{ week: 12 }]) } })

    expect(await getLatestRankingWeek(2025, 'AP Top 25')).toBe(12)
  })

  it('defaults to week 1 on empty data', async () => {
    mockClient({ apiTables: { poll_rankings: ok([]) } })

    expect(await getLatestRankingWeek(2025, 'AP Top 25')).toBe(1)
  })

  it('defaults to week 1 (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { poll_rankings: dbError() } })

    expect(await getLatestRankingWeek(2025, 'AP Top 25')).toBe(1)
  })
})

describe('getRankingsForWeek', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // getRankingsForWeek issues 3 parallel queries in this source order:
  // [current week poll_rankings, previous week poll_rankings, team_history].
  // Both poll_rankings calls share the api:poll_rankings response queue, so
  // an array here is consumed FIFO: index 0 -> current, index 1 -> previous.
  function scenario(overrides: Partial<SupabaseMockConfig> = {}): SupabaseMockConfig {
    return {
      tables: { teams_with_logos: ok(createTeamsWithLogosRows()) },
      apiTables: {
        poll_rankings: [ok(createCurrentWeekPollRows()), ok(createPrevWeekPollRows())],
        team_history: ok(createTeamHistoryRecordRows()),
      },
      ...overrides,
    }
  }

  it('dedupes schools to their best (lowest) rank', async () => {
    mockClient(scenario())

    const result = await getRankingsForWeek(2025, 10, 'AP Top 25')

    // Texas appears at rank 4 and rank 7 in the fixture; only rank 4 survives.
    const texas = result.find(r => r.school === 'Texas')
    expect(texas?.rank).toBe(4)
    expect(result.filter(r => r.school === 'Texas')).toHaveLength(1)
  })

  it('computes movement as prevRank - rank, and null when absent from the previous week', async () => {
    mockClient(scenario())

    const result = await getRankingsForWeek(2025, 10, 'AP Top 25')

    // Oklahoma: prev rank 3 -> current rank 1 => movement = 3 - 1 = +2 (moved up)
    const oklahoma = result.find(r => r.school === 'Oklahoma')!
    expect(oklahoma.prev_rank).toBe(3)
    expect(oklahoma.movement).toBe(2)

    // Texas: deduped prev rank 6 (also duplicated in prev week) -> current rank 4 => movement = +2
    const texas = result.find(r => r.school === 'Texas')!
    expect(texas.prev_rank).toBe(6)
    expect(texas.movement).toBe(2)

    // Ohio State: absent from the previous week -> prev_rank and movement are null
    const ohioState = result.find(r => r.school === 'Ohio State')!
    expect(ohioState.prev_rank).toBeNull()
    expect(ohioState.movement).toBeNull()
  })

  it('joins wins/losses from team_history, defaulting to 0 for teams missing a record', async () => {
    mockClient(scenario())

    const result = await getRankingsForWeek(2025, 10, 'AP Top 25')

    const oklahoma = result.find(r => r.school === 'Oklahoma')!
    expect(oklahoma.wins).toBe(9)
    expect(oklahoma.losses).toBe(1)

    // Ohio State has no team_history row in the fixture.
    const ohioState = result.find(r => r.school === 'Ohio State')!
    expect(ohioState.wins).toBe(0)
    expect(ohioState.losses).toBe(0)
  })

  it('enriches with logo/color from the team lookup and sorts by rank ascending', async () => {
    mockClient(scenario())

    const result = await getRankingsForWeek(2025, 10, 'AP Top 25')

    expect(result.map(r => r.rank)).toEqual([1, 2, 4]) // Oklahoma, Ohio State, Texas
    expect(result[0].school).toBe('Oklahoma')
    expect(result[0].logo).toBe('https://logos/ou.png')
    expect(result[0].color).toBe('#841617')
  })

  it('returns [] (not a throw) when the current-week query errors', async () => {
    mockClient(scenario({
      apiTables: {
        poll_rankings: [dbError('current week failed'), ok(createPrevWeekPollRows())],
        team_history: ok(createTeamHistoryRecordRows()),
      },
    }))

    expect(await getRankingsForWeek(2025, 10, 'AP Top 25')).toEqual([])
  })

  it('still returns rankings (with null movement) when the previous-week query errors', async () => {
    mockClient(scenario({
      apiTables: {
        poll_rankings: [ok(createCurrentWeekPollRows()), dbError('prev week failed')],
        team_history: ok(createTeamHistoryRecordRows()),
      },
    }))

    const result = await getRankingsForWeek(2025, 10, 'AP Top 25')

    expect(result).toHaveLength(3)
    expect(result.every(r => r.prev_rank === null && r.movement === null)).toBe(true)
  })

  it('still returns rankings (with wins/losses 0) when the records query errors', async () => {
    mockClient(scenario({
      apiTables: {
        poll_rankings: [ok(createCurrentWeekPollRows()), ok(createPrevWeekPollRows())],
        team_history: dbError('records failed'),
      },
    }))

    const result = await getRankingsForWeek(2025, 10, 'AP Top 25')

    expect(result).toHaveLength(3)
    expect(result.every(r => r.wins === 0 && r.losses === 0)).toBe(true)
  })

  it('returns [] on empty current-week data', async () => {
    mockClient(scenario({
      apiTables: {
        poll_rankings: [ok([]), ok(createPrevWeekPollRows())],
        team_history: ok(createTeamHistoryRecordRows()),
      },
    }))

    expect(await getRankingsForWeek(2025, 10, 'AP Top 25')).toEqual([])
  })
})

describe('getRankingsAllWeeks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('groups by week and dedupes each week to the best rank per school', async () => {
    mockClient({
      tables: { teams_with_logos: ok(createTeamsWithLogosRows()) },
      apiTables: { poll_rankings: ok(createAllWeeksPollRows()) },
    })

    const result = await getRankingsAllWeeks(2025, 'AP Top 25')

    expect(result.map(w => w.week)).toEqual([8, 9])

    const week9 = result.find(w => w.week === 9)!
    const texasWeek9 = week9.rankings.find(r => r.school === 'Texas')!
    expect(texasWeek9.rank).toBe(4) // deduped from [4, 8] -> keeps 4
    expect(week9.rankings.filter(r => r.school === 'Texas')).toHaveLength(1)
  })

  it('sorts weeks ascending regardless of input order', async () => {
    const rows = createAllWeeksPollRows().reverse()
    mockClient({
      tables: { teams_with_logos: ok(createTeamsWithLogosRows()) },
      apiTables: { poll_rankings: ok(rows) },
    })

    const result = await getRankingsAllWeeks(2025, 'AP Top 25')

    expect(result.map(w => w.week)).toEqual([8, 9])
  })

  it('attaches color from the team lookup to each ranking', async () => {
    mockClient({
      tables: { teams_with_logos: ok(createTeamsWithLogosRows()) },
      apiTables: { poll_rankings: ok(createAllWeeksPollRows()) },
    })

    const result = await getRankingsAllWeeks(2025, 'AP Top 25')

    const week8 = result.find(w => w.week === 8)!
    const oklahoma = week8.rankings.find(r => r.school === 'Oklahoma')!
    expect(oklahoma.color).toBe('#841617')
  })

  it('returns [] on empty data', async () => {
    mockClient({
      tables: { teams_with_logos: ok(createTeamsWithLogosRows()) },
      apiTables: { poll_rankings: ok([]) },
    })

    expect(await getRankingsAllWeeks(2025, 'AP Top 25')).toEqual([])
  })

  it('returns [] (not a throw) on PostgREST error', async () => {
    mockClient({
      tables: { teams_with_logos: ok(createTeamsWithLogosRows()) },
      apiTables: { poll_rankings: dbError() },
    })

    expect(await getRankingsAllWeeks(2025, 'AP Top 25')).toEqual([])
  })
})
