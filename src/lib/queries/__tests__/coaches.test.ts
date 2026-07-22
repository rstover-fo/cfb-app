/**
 * Unit tests for src/lib/queries/coaches.ts:
 *  - getCoachRecords: order/filter params sent to api.coach_records,
 *    client-side FBS filtering against the team lookup (the view has no
 *    classification column), and the error->[] fallback.
 *  - getCoachingHistory: order/filter params sent to api.coaching_history
 *    (per-tenure grain), chronological ordering, and the error->[] fallback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// React's cache() requires a request scope; make it a pass-through in unit
// tests (matches matchups.test.ts's pattern). This also affects
// shared.ts's getTeamLookup, which coaches.ts calls.
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, cache: <T>(fn: T): T => fn }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getCoachRecords, getCoachingHistory } from '../coaches'
import { createSupabaseMock, dbError, ok, type SupabaseMockConfig } from './helpers'
import { createTeamsWithLogosRows } from './fixtures/shared'
import { createCoachRecordRow, createCoachingTenureRow, createCoachingTenureRows } from './fixtures/coaches'

function mockClient(config: SupabaseMockConfig) {
  const mock = createSupabaseMock(config)
  vi.mocked(createClient).mockResolvedValue(mock as unknown as Awaited<ReturnType<typeof createClient>>)
  return mock
}

/** The chain object returned by the Nth `.schema('api').from(...)` call this test made. */
function apiChain(mock: ReturnType<typeof createSupabaseMock>, callIndex = 0) {
  return mock.schema.mock.results[callIndex].value.from.mock.results[0].value
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getCoachRecords', () => {
  it('queries api.coach_records with the requested sort, default min-games floor, and row cap', async () => {
    const mock = mockClient({
      apiTables: { coach_records: ok([createCoachRecordRow()]) },
      tables: { teams_with_logos: ok(createTeamsWithLogosRows()) },
    })

    await getCoachRecords({ sortBy: 'win_pct' })

    expect(mock.schema).toHaveBeenCalledWith('api')
    const chain = apiChain(mock)
    // FBS restriction must be server-side, BEFORE .limit() -- a client-only
    // filter would let non-FBS coaches consume the top-100 cap.
    expect(chain.in).toHaveBeenCalledWith('team', expect.arrayContaining(['Oklahoma']))
    expect(chain.order).toHaveBeenCalledWith('win_pct', { ascending: false, nullsFirst: false })
    expect(chain.gte).toHaveBeenCalledWith('games', 24)
    expect(chain.limit).toHaveBeenCalledWith(100)
  })

  it('applies the active-coach filter server-side, before the limit', async () => {
    const builder = chainable({ data: [], error: null })
    fromMock.mockImplementation(() => builder)

    await getCoachRecords({ sortBy: 'win_pct', activeOnly: true })

    // last_season >= CURRENT_SEASON must be part of the query -- filtering
    // the capped all-time list client-side would drop active coaches ranked
    // below the all-time top-100 cutoff.
    expect(builder.gte).toHaveBeenCalledWith('last_season', 2025)
  })

  it('omits the active-coach filter by default', async () => {
    const builder = chainable({ data: [], error: null })
    fromMock.mockImplementation(() => builder)

    await getCoachRecords({ sortBy: 'win_pct' })

    expect(builder.gte).not.toHaveBeenCalledWith('last_season', 2025)
  })

  it('honors a custom minGames floor and the ats_win_pct sort key', async () => {
    const mock = mockClient({
      apiTables: { coach_records: ok([]) },
      tables: { teams_with_logos: ok(createTeamsWithLogosRows()) },
    })

    await getCoachRecords({ sortBy: 'ats_win_pct', minGames: 50 })

    const chain = apiChain(mock)
    expect(chain.order).toHaveBeenCalledWith('ats_win_pct', { ascending: false, nullsFirst: false })
    expect(chain.gte).toHaveBeenCalledWith('games', 50)
  })

  it('filters out coaches whose team is not in the FBS team lookup', async () => {
    mockClient({
      apiTables: {
        coach_records: ok([
          createCoachRecordRow({ coach_name: 'Bob Stoops', team: 'Oklahoma' }),
          createCoachRecordRow({ coach_name: 'FCS Coach', team: 'North Dakota State' }),
        ]),
      },
      tables: { teams_with_logos: ok(createTeamsWithLogosRows()) },
    })

    const result = await getCoachRecords({ sortBy: 'win_pct' })

    expect(result.map(r => r.coach_name)).toEqual(['Bob Stoops'])
  })

  it('attaches logo/color from the team lookup', async () => {
    mockClient({
      apiTables: { coach_records: ok([createCoachRecordRow({ team: 'Texas' })]) },
      tables: { teams_with_logos: ok(createTeamsWithLogosRows()) },
    })

    const result = await getCoachRecords({ sortBy: 'win_pct' })

    expect(result[0].logo).toBe('https://logos/tex.png')
    expect(result[0].color).toBe('#BF5700')
  })

  it('returns an empty array when the query errors', async () => {
    mockClient({
      apiTables: { coach_records: dbError() },
      tables: { teams_with_logos: ok(createTeamsWithLogosRows()) },
    })

    const result = await getCoachRecords({ sortBy: 'win_pct' })

    expect(result).toEqual([])
  })
})

describe('getCoachingHistory', () => {
  it('queries api.coaching_history filtered by first+last name, ordered tenure_start ascending', async () => {
    const mock = mockClient({ apiTables: { coaching_history: ok(createCoachingTenureRows()) } })

    const result = await getCoachingHistory('Bob', 'Stoops')

    expect(mock.schema).toHaveBeenCalledWith('api')
    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('first_name', 'Bob')
    expect(chain.eq).toHaveBeenCalledWith('last_name', 'Stoops')
    expect(chain.order).toHaveBeenCalledWith('tenure_start', { ascending: true })
    expect(result.map(r => r.team)).toEqual(['Florida', 'Oklahoma'])
  })

  it('passes through nullable talent-rank columns as-is (no coercion)', async () => {
    mockClient({ apiTables: { coaching_history: ok(createCoachingTenureRows()) } })

    const result = await getCoachingHistory('Bob', 'Stoops')

    const florida = result.find(r => r.team === 'Florida')!
    const oklahoma = result.find(r => r.team === 'Oklahoma')!
    expect(florida.inherited_talent_rank).toBeNull()
    expect(florida.year3_talent_rank).toBeNull()
    expect(oklahoma.inherited_talent_rank).toBe(34)
    expect(oklahoma.year3_talent_rank).toBe(12)
    expect(oklahoma.talent_improvement).toBe(22)
  })

  it('returns [] on empty data (a coach with no history rows -- not an error)', async () => {
    mockClient({ apiTables: { coaching_history: ok([]) } })

    expect(await getCoachingHistory('Nobody', 'Coach')).toEqual([])
  })

  it('returns [] (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { coaching_history: dbError() } })

    expect(await getCoachingHistory('Bob', 'Stoops')).toEqual([])
  })

  it('returns a single-tenure result unwrapped as an array', async () => {
    mockClient({ apiTables: { coaching_history: ok([createCoachingTenureRow()]) } })

    const result = await getCoachingHistory('Bob', 'Stoops')

    expect(result).toHaveLength(1)
    expect(result[0].team).toBe('Oklahoma')
  })
})
