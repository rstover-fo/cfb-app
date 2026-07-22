/**
 * Unit tests for src/lib/queries/coaches.ts's getCoachRecords: order/filter
 * params sent to api.coach_records, client-side FBS filtering against the
 * team lookup (the view has no classification column), and the error->[]
 * fallback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// React's cache() requires a request scope; make it a pass-through in unit
// tests (matches matchups.test.ts's pattern). This also affects
// shared.ts's getTeamLookup, which coaches.ts calls.
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, cache: <T>(fn: T): T => fn }
})

// Chainable Supabase query builder mock (house style, see compare.test.ts).
function chainable(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const builder: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'neq', 'in', 'not', 'or', 'order', 'limit', 'range', 'lte', 'gte', 'schema']
  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder)
  }
  builder.single = vi.fn().mockResolvedValue(result)
  builder.then = (resolve: (v: unknown) => void) => resolve(result)
  return builder
}

const fromMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: (...args: unknown[]) => fromMock(...args),
    schema: vi.fn().mockReturnValue({ from: (...args: unknown[]) => fromMock(...args) }),
  }),
}))

import { getCoachRecords, type CoachRecordRow } from '../coaches'

const TEAM_LOOKUP_ROWS = [
  { school: 'Oklahoma', logo: 'https://logos/ou.png', color: '#841617', conference: 'SEC' },
  { school: 'Texas', logo: 'https://logos/tex.png', color: '#BF5700', conference: 'SEC' },
]

function coachRow(overrides: Partial<CoachRecordRow> = {}): CoachRecordRow {
  return {
    coach_name: 'Bob Stoops',
    first_name: 'Bob',
    last_name: 'Stoops',
    team: 'Oklahoma',
    first_season: 1999,
    last_season: 2016,
    seasons_count: 18,
    games: 200,
    wins: 190,
    losses: 48,
    ties: 0,
    win_pct: 0.798,
    ats_games: 150,
    ats_wins: 80,
    ats_losses: 65,
    ats_pushes: 5,
    ats_win_pct: 0.552,
    seasons_with_ats_data: 12,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getCoachRecords', () => {
  it('queries api.coach_records with the requested sort, default min-games floor, and row cap', async () => {
    const builder = chainable({ data: [coachRow()], error: null })
    fromMock.mockImplementation((table: string) => {
      if (table === 'teams_with_logos') return chainable({ data: TEAM_LOOKUP_ROWS, error: null })
      return builder
    })

    await getCoachRecords({ sortBy: 'win_pct' })

    expect(fromMock).toHaveBeenCalledWith('coach_records')
    // FBS restriction must be server-side, BEFORE .limit() -- a client-only
    // filter would let non-FBS coaches consume the top-100 cap.
    expect(builder.in).toHaveBeenCalledWith('team', expect.arrayContaining(['Oklahoma']))
    expect(builder.order).toHaveBeenCalledWith('win_pct', { ascending: false, nullsFirst: false })
    expect(builder.gte).toHaveBeenCalledWith('games', 24)
    expect(builder.limit).toHaveBeenCalledWith(100)
  })

  it('honors a custom minGames floor and the ats_win_pct sort key', async () => {
    const builder = chainable({ data: [], error: null })
    fromMock.mockImplementation((table: string) => {
      if (table === 'teams_with_logos') return chainable({ data: TEAM_LOOKUP_ROWS, error: null })
      return builder
    })

    await getCoachRecords({ sortBy: 'ats_win_pct', minGames: 50 })

    expect(builder.order).toHaveBeenCalledWith('ats_win_pct', { ascending: false, nullsFirst: false })
    expect(builder.gte).toHaveBeenCalledWith('games', 50)
  })

  it('filters out coaches whose team is not in the FBS team lookup', async () => {
    const rows = [
      coachRow({ coach_name: 'Bob Stoops', team: 'Oklahoma' }),
      coachRow({ coach_name: 'FCS Coach', team: 'North Dakota State' }),
    ]
    fromMock.mockImplementation((table: string) => {
      if (table === 'teams_with_logos') return chainable({ data: TEAM_LOOKUP_ROWS, error: null })
      return chainable({ data: rows, error: null })
    })

    const result = await getCoachRecords({ sortBy: 'win_pct' })

    expect(result.map(r => r.coach_name)).toEqual(['Bob Stoops'])
  })

  it('attaches logo/color from the team lookup', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'teams_with_logos') return chainable({ data: TEAM_LOOKUP_ROWS, error: null })
      return chainable({ data: [coachRow({ team: 'Texas' })], error: null })
    })

    const result = await getCoachRecords({ sortBy: 'win_pct' })

    expect(result[0].logo).toBe('https://logos/tex.png')
    expect(result[0].color).toBe('#BF5700')
  })

  it('returns an empty array when the query errors', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'teams_with_logos') return chainable({ data: TEAM_LOOKUP_ROWS, error: null })
      return chainable({ data: null, error: { message: 'boom' } })
    })

    const result = await getCoachRecords({ sortBy: 'win_pct' })

    expect(result).toEqual([])
  })
})
