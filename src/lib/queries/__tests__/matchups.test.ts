import { describe, it, expect, vi, beforeEach } from 'vitest'

// React's cache() requires a request scope; make it a pass-through in unit tests
// so the query functions can be exercised directly.
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, cache: <T>(fn: T): T => fn }
})

// Mock the Supabase server client.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  normalizePair,
  parseRecentResults,
  computeStreak,
  getMatchup,
  getMatchupGames,
  type MatchupResult,
} from '../matchups'

// Minimal chainable Supabase query mock. Every builder method returns the same
// object; it resolves to `result` when awaited (thenable) or via maybeSingle().
function makeClient(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {}
  const chain = () => query
  Object.assign(query, {
    select: chain,
    eq: chain,
    or: chain,
    order: chain,
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  })
  return {
    schema: () => ({ from: () => query }),
  }
}

function mockClient(result: { data: unknown; error: unknown }) {
  vi.mocked(createClient).mockResolvedValue(
    makeClient(result) as unknown as Awaited<ReturnType<typeof createClient>>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('normalizePair', () => {
  it('orders alphabetically and flags when teamA is team1', () => {
    expect(normalizePair('Alabama', 'Auburn')).toEqual({
      team1: 'Alabama',
      team2: 'Auburn',
      aIsTeam1: true,
    })
  })

  it('swaps and flags when teamA sorts after teamB', () => {
    expect(normalizePair('Texas', 'Oklahoma')).toEqual({
      team1: 'Oklahoma',
      team2: 'Texas',
      aIsTeam1: false,
    })
  })

  it('treats identical names as aIsTeam1', () => {
    expect(normalizePair('Army', 'Army').aIsTeam1).toBe(true)
  })
})

describe('parseRecentResults', () => {
  const valid = [{ season: 2024, winner: 'Texas', home_team: 'Texas', home_points: 34, away_points: 3 }]

  it('passes through a decoded array', () => {
    expect(parseRecentResults(valid)).toHaveLength(1)
  })

  it('parses a JSON string payload', () => {
    expect(parseRecentResults(JSON.stringify(valid))).toEqual(valid)
  })

  it('returns [] for a malformed JSON string', () => {
    expect(parseRecentResults('{not json')).toEqual([])
  })

  it('returns [] for null / non-array input', () => {
    expect(parseRecentResults(null)).toEqual([])
    expect(parseRecentResults(42)).toEqual([])
    expect(parseRecentResults({ season: 2024 })).toEqual([])
  })

  it('drops malformed elements', () => {
    const mixed = [...valid, { winner: 'x' }, null]
    expect(parseRecentResults(mixed)).toHaveLength(1)
  })
})

describe('computeStreak', () => {
  const mk = (winner: string | null): MatchupResult => ({
    season: 2000,
    winner,
    teamAPoints: 0,
    teamBPoints: 0,
    result: winner == null ? 'T' : 'W',
  })

  it('counts consecutive wins by the most-recent winner', () => {
    expect(computeStreak([mk('Texas'), mk('Texas'), mk('Oklahoma')])).toEqual({
      team: 'Texas',
      count: 2,
    })
  })

  it('returns null on empty input', () => {
    expect(computeStreak([])).toBeNull()
  })

  it('returns null when the most recent meeting was a tie', () => {
    expect(computeStreak([mk(null), mk('Texas')])).toBeNull()
  })
})

describe('getMatchup', () => {
  const row = {
    team1: 'Oklahoma',
    team2: 'Texas',
    total_games: 10,
    team1_wins: 6,
    team2_wins: 3,
    ties: 1,
    first_meeting: 1900,
    last_meeting: 2024,
    recent_results: [
      { season: 2024, winner: 'Texas', home_team: 'Texas', home_points: 34, away_points: 3 },
      { season: 2023, winner: 'Oklahoma', home_team: 'Oklahoma', home_points: 28, away_points: 14 },
    ],
  }

  it('re-orients the record to the caller perspective (teamA = Texas = stored team2)', async () => {
    mockClient({ data: row, error: null })
    const m = await getMatchup('Texas', 'Oklahoma')
    expect(m).not.toBeNull()
    expect(m!.teamAWins).toBe(3) // Texas
    expect(m!.teamBWins).toBe(6) // Oklahoma
    expect(m!.ties).toBe(1)
    expect(m!.firstMeeting).toBe(1900)
    expect(m!.lastMeeting).toBe(2024)
  })

  it('re-orients recent results and computes the streak from teamA perspective', async () => {
    mockClient({ data: row, error: null })
    const m = await getMatchup('Texas', 'Oklahoma')
    expect(m!.recentResults[0]).toMatchObject({ result: 'W', teamAPoints: 34, teamBPoints: 3 })
    expect(m!.recentResults[1]).toMatchObject({ result: 'L', teamAPoints: 14, teamBPoints: 28 })
    expect(m!.streak).toEqual({ team: 'Texas', count: 1 })
  })

  it('returns null when the pair has never met', async () => {
    mockClient({ data: null, error: null })
    expect(await getMatchup('Oklahoma', 'Rutgers')).toBeNull()
  })

  it('tolerates a malformed recent_results payload', async () => {
    mockClient({ data: { ...row, recent_results: '{broken' }, error: null })
    const m = await getMatchup('Texas', 'Oklahoma')
    expect(m!.recentResults).toEqual([])
    expect(m!.streak).toBeNull()
  })
})

describe('getMatchupGames', () => {
  const games = [
    {
      game_id: 2,
      season: 2024,
      week: 6,
      season_type: 'regular',
      start_date: '2024-10-12',
      neutral_site: true,
      home_team: 'Texas',
      away_team: 'Oklahoma',
      home_points: 34,
      away_points: 3,
      winner: 'Texas',
      venue: 'Cotton Bowl',
    },
    {
      game_id: 1,
      season: 2023,
      week: 6,
      season_type: 'regular',
      start_date: '2023-10-07',
      neutral_site: true,
      home_team: 'Oklahoma',
      away_team: 'Texas',
      home_points: 28,
      away_points: 14,
      winner: 'Oklahoma',
      venue: 'Cotton Bowl',
    },
    {
      game_id: 0,
      season: 2022,
      week: 6,
      season_type: 'regular',
      start_date: '2022-10-08',
      neutral_site: true,
      home_team: 'Texas',
      away_team: 'Oklahoma',
      home_points: null,
      away_points: null,
      winner: null,
      venue: 'Cotton Bowl',
    },
  ]

  it('re-orients scores/results to teamA and drops games without scores', async () => {
    mockClient({ data: games, error: null })
    const list = await getMatchupGames('Texas', 'Oklahoma')
    expect(list).toHaveLength(2) // null-score game dropped
    expect(list[0]).toMatchObject({
      season: 2024,
      teamAScore: 34,
      teamBScore: 3,
      teamAHome: true,
      result: 'W',
      neutralSite: true,
    })
    expect(list[1]).toMatchObject({
      season: 2023,
      teamAScore: 14, // Texas was away
      teamBScore: 28,
      teamAHome: false,
      result: 'L',
    })
  })

  it('returns [] when there are no games', async () => {
    mockClient({ data: [], error: null })
    expect(await getMatchupGames('Oklahoma', 'Rutgers')).toEqual([])
  })

  it('returns [] on query error', async () => {
    mockClient({ data: null, error: { message: 'boom' } })
    expect(await getMatchupGames('Texas', 'Oklahoma')).toEqual([])
  })
})
