/**
 * Unit tests for the transform/merge/pivot logic in src/lib/queries/games.ts:
 * getGameBoxScore (EAV pivot), getGamePlayerLeaders (group/merge stat_type
 * rows per player, descending parseFloat sort), getGameLineScores (pivoted
 * quarters + conditional OT column), getGameDrives, and getGamePlays
 * (row mapping + EXCLUDED_PLAY_TYPES filter).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getGameBoxScore, getGamePlayerLeaders, getGameLineScores, getGameDrives, getGamePlays } from '../games'
import { createSupabaseMock, dbError, ok, type SupabaseMockConfig } from './helpers'
import {
  createGameBoxScoreRows,
  createGamePlayerLeaderRows,
  createGameLineScoresRow,
  createGameDriveRows,
  createGamePlayRowsWithExcludedTypes,
} from './fixtures/games'

function mockClient(config: SupabaseMockConfig) {
  vi.mocked(createClient).mockResolvedValue(
    createSupabaseMock(config) as unknown as Awaited<ReturnType<typeof createClient>>
  )
}

describe('getGameBoxScore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pivots EAV rows into one BoxScoreTeam per home_away side', async () => {
    mockClient({ apiTables: { game_box_score: ok(createGameBoxScoreRows()) } })

    const result = await getGameBoxScore(1001)

    expect(result).toEqual({
      home: {
        team: 'Oklahoma',
        homeAway: 'home',
        stats: { totalYards: '420', possessionTime: '31:12' },
      },
      away: {
        team: 'Houston',
        homeAway: 'away',
        stats: { totalYards: '310', possessionTime: '28:48' },
      },
    })
  })

  it('returns null on empty data', async () => {
    mockClient({ apiTables: { game_box_score: ok([]) } })

    expect(await getGameBoxScore(1001)).toBeNull()
  })

  it('returns null (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { game_box_score: dbError() } })

    expect(await getGameBoxScore(1001)).toBeNull()
  })

  it('returns null when only one side has rows', async () => {
    mockClient({
      apiTables: {
        game_box_score: ok(createGameBoxScoreRows().filter(r => r.home_away === 'home')),
      },
    })

    expect(await getGameBoxScore(1001)).toBeNull()
  })
})

describe('getGamePlayerLeaders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('merges stat_type rows per player and sorts descending by the category primary stat', async () => {
    mockClient({ apiTables: { game_player_leaders: ok(createGamePlayerLeaderRows()) } })

    const result = await getGamePlayerLeaders(1001)
    expect(result).not.toBeNull()

    // Home passing: Arnold and Hawkins tie at YDS=250; tie broken by player_id
    // ascending (row order from the `.order('player_id')` the real query applies).
    expect(result!.home.passing).toEqual([
      { id: '100', name: 'Jackson Arnold', stats: { YDS: '250', TD: '2' } },
      { id: '101', name: 'Michael Hawkins', stats: { YDS: '250', TD: '1' } },
    ])

    // Home rushing: single back, YDS + TD merged onto one player record.
    expect(result!.home.rushing).toEqual([
      { id: '110', name: 'Jovantae Barnes', stats: { YDS: '112', TD: '1' } },
    ])

    // Away "defensive" category maps to UI key "defense" via CATEGORY_MAP.
    expect(result!.away.defense).toEqual([
      { id: '211', name: 'Alex Hogan', stats: { TOT: '11' } },
      { id: '210', name: 'Jamal George', stats: { TOT: '9' } },
    ])

    // Categories with no rows for a side are empty arrays, not undefined.
    expect(result!.home.receiving).toEqual([])
    expect(result!.away.passing).toEqual([])
  })

  it('sorts by numeric value, not string comparison, on the primary stat', async () => {
    // NOTE: documents current behavior — the sort uses parseFloat, so '106' > '87'
    // sorts correctly descending. If it ever regressed to a plain string
    // comparison, '87' would incorrectly outrank '106' (lexicographic '8' > '1').
    mockClient({ apiTables: { game_player_leaders: ok(createGamePlayerLeaderRows()) } })

    const result = await getGamePlayerLeaders(1001)

    expect(result!.away.rushing.map(p => p.id)).toEqual(['201', '200']) // 106 yds before 87 yds
  })

  it('returns null on empty data', async () => {
    mockClient({ apiTables: { game_player_leaders: ok([]) } })

    expect(await getGamePlayerLeaders(1001)).toBeNull()
  })

  it('returns null (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { game_player_leaders: dbError() } })

    expect(await getGamePlayerLeaders(1001)).toBeNull()
  })

  it('skips rows whose category is not in CATEGORY_MAP instead of throwing', async () => {
    // The real query pre-filters `.in('category', Object.keys(CATEGORY_MAP))`,
    // so this exercises the defensive `if (!uiCategory) continue` guard directly
    // in case an unexpected category ever reaches this function.
    mockClient({
      apiTables: {
        game_player_leaders: ok([
          { team: 'Oklahoma', home_away: 'home', category: 'kicking', stat_type: 'FG', player_id: '900', player_name: 'Kicker', stat: '3' },
          { team: 'Oklahoma', home_away: 'home', category: 'passing', stat_type: 'YDS', player_id: '100', player_name: 'Jackson Arnold', stat: '250' },
        ]),
      },
    })

    const result = await getGamePlayerLeaders(1001)

    expect(result!.home.passing).toHaveLength(1)
    expect(result!.home.passing[0].id).toBe('100')
  })

  it('treats a missing primary stat as 0 for sorting purposes', async () => {
    mockClient({
      apiTables: {
        game_player_leaders: ok([
          // No YDS row at all for player 300 -> falls back to '0' in the sort.
          { team: 'Oklahoma', home_away: 'home', category: 'passing', stat_type: 'TD', player_id: '300', player_name: 'No Yards Guy', stat: '1' },
          { team: 'Oklahoma', home_away: 'home', category: 'passing', stat_type: 'YDS', player_id: '100', player_name: 'Jackson Arnold', stat: '250' },
        ]),
      },
    })

    const result = await getGamePlayerLeaders(1001)

    expect(result!.home.passing.map(p => p.id)).toEqual(['100', '300'])
  })
})

describe('getGameLineScores', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pivots q1-q4 into arrays with no OT column when neither side has overtime', async () => {
    mockClient({ apiTables: { game_line_scores: ok(createGameLineScoresRow()) } })

    const result = await getGameLineScores(1001)

    expect(result).toEqual({ home: [7, 14, 7, 7], away: [0, 7, 0, 7] })
  })

  it('appends a combined OT column to both sides when both scored in overtime', async () => {
    mockClient({
      apiTables: {
        game_line_scores: ok(
          createGameLineScoresRow({ home_q4: 10, home_ot: 6, away_q4: 10, away_ot: 3 })
        ),
      },
    })

    const result = await getGameLineScores(1001)

    expect(result).toEqual({ home: [7, 14, 7, 10, 6], away: [0, 7, 0, 10, 3] })
  })

  it('appends OT to both sides when only one side scored, keeping arrays the same length', async () => {
    // When only one side scores in overtime, both arrays still get an OT entry
    // so an OT shutout renders as an explicit 0, and home[i]/away[i] stay aligned.
    mockClient({
      apiTables: {
        game_line_scores: ok(
          createGameLineScoresRow({ home_q4: 10, home_ot: 3, away_q4: 10, away_ot: 0 })
        ),
      },
    })

    const result = await getGameLineScores(1001)

    expect(result).toEqual({ home: [7, 14, 7, 10, 3], away: [0, 7, 0, 10, 0] })
    expect(result!.home).toHaveLength(5)
    expect(result!.away).toHaveLength(5)
  })

  it('treats a null OT value the same as zero (no OT column appended)', async () => {
    mockClient({
      apiTables: {
        game_line_scores: ok(createGameLineScoresRow({ home_ot: null, away_ot: null })),
      },
    })

    const result = await getGameLineScores(1001)

    expect(result!.home).toHaveLength(4)
    expect(result!.away).toHaveLength(4)
  })

  it('returns null when every quarter is zero/null on both sides', async () => {
    mockClient({
      apiTables: {
        game_line_scores: ok({
          home_q1: null, home_q2: 0, home_q3: null, home_q4: 0, home_ot: null,
          away_q1: 0, away_q2: null, away_q3: 0, away_q4: null, away_ot: null,
        }),
      },
    })

    expect(await getGameLineScores(1001)).toBeNull()
  })

  it('returns null when no row is found (single() error)', async () => {
    mockClient({ apiTables: { game_line_scores: dbError('no rows') } })

    expect(await getGameLineScores(1001)).toBeNull()
  })
})

describe('getGameDrives', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes through mapped drive rows in order', async () => {
    mockClient({ apiTables: { game_drives: ok(createGameDriveRows()) } })

    const result = await getGameDrives(1001)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ drive_number: 1, offense: 'Oklahoma', is_home_offense: true })
    expect(result[1]).toMatchObject({ drive_number: 2, offense: 'Houston', is_home_offense: false })
  })

  it('returns [] on empty data', async () => {
    mockClient({ apiTables: { game_drives: ok([]) } })

    expect(await getGameDrives(1001)).toEqual([])
  })

  it('returns [] (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { game_drives: dbError() } })

    expect(await getGameDrives(1001)).toEqual([])
  })
})

describe('getGamePlays', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('filters out every EXCLUDED_PLAY_TYPES entry and null play_type rows', async () => {
    mockClient({ apiTables: { game_plays: ok(createGamePlayRowsWithExcludedTypes()) } })

    const result = await getGamePlays(1001)

    expect(result.map(p => p.play_type)).toEqual(['Rush', 'Pass Reception', 'Sack'])
  })

  it('returns [] on empty data', async () => {
    mockClient({ apiTables: { game_plays: ok([]) } })

    expect(await getGamePlays(1001)).toEqual([])
  })

  it('returns [] (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { game_plays: dbError() } })

    expect(await getGamePlays(1001)).toEqual([])
  })
})
