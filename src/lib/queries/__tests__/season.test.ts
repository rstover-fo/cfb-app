/**
 * Unit tests for src/lib/queries/season.ts.
 *
 * The behavior worth pinning here is the resolution order (override ->
 * api.season_state -> games -> CURRENT_SEASON fallback), the "completed
 * games define loaded" semantics of the games fallback (a schedule-only
 * season never counts, even when it is the numerically newest season),
 * never-throw error handling (R4), and scaleFloor's live-only scaling.
 *
 * `SEASON_OVERRIDE` is read once at module load (see season.ts), so every
 * test that exercises override behavior through resolveCurrentSeason itself
 * (rather than through the exported readSeasonOverride() function directly)
 * must set process.env.CFB_SEASON and re-import a fresh module instance via
 * vi.resetModules() -- a plain `import` would reuse whatever value the
 * module captured on first load.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createSupabaseMock, ok, dbError, type SupabaseMockConfig } from './helpers'
import { CURRENT_SEASON } from '../constants'
import { scaleFloor, readSeasonOverride, type SeasonState } from '../season'

function mockClient(config: SupabaseMockConfig) {
  const mock = createSupabaseMock(config)
  vi.mocked(createClient).mockResolvedValue(mock as unknown as Awaited<ReturnType<typeof createClient>>)
  return mock
}

/** Re-imports season.ts as a fresh module instance so its module-load-time
 * SEASON_OVERRIDE constant re-reads whatever process.env.CFB_SEASON is set
 * to at the moment of import. */
async function freshSeasonModule() {
  vi.resetModules()
  return import('../season')
}

const ORIGINAL_CFB_SEASON = process.env.CFB_SEASON

afterEach(() => {
  if (ORIGINAL_CFB_SEASON === undefined) delete process.env.CFB_SEASON
  else process.env.CFB_SEASON = ORIGINAL_CFB_SEASON
  vi.clearAllMocks()
  vi.useRealTimers()
})

beforeEach(() => {
  delete process.env.CFB_SEASON
})

describe('resolveCurrentSeason: games fallback', () => {
  it('newest completed season with an incomplete game remaining is live', async () => {
    const mock = mockClient({
      apiTables: { season_state: dbError('relation "api.season_state" does not exist') },
      tables: {
        games: [
          ok([{ season: 2026 }]), // newest season with a completed game (2025 is also complete, but older)
          ok([{ week: 1 }]),      // max completed week for 2026
          ok([{ week: 2 }]),      // an incomplete 2026 game exists -> is_live
        ],
      },
    })

    const { resolveCurrentSeason } = await freshSeasonModule()
    const result = await resolveCurrentSeason()

    expect(result).toEqual({ season: 2026, through_week: 1, is_live: true, source: 'games' })
    expect(mock.from).toHaveBeenCalledWith('games')
  })

  it('a schedule-only newer season never counts; the fully-complete season is current and not live', async () => {
    // 2027 is scheduled-only (no completed rows), so the "newest completed
    // season" query never surfaces it -- the mock simply reflects what that
    // query would actually return against such data.
    mockClient({
      apiTables: { season_state: dbError('relation "api.season_state" does not exist') },
      tables: {
        games: [
          ok([{ season: 2026 }]), // newest season with >=1 completed game (2027 has none)
          ok([{ week: 16 }]),     // max completed week for 2026
          ok([]),                 // no incomplete 2026 games remain
        ],
      },
    })

    const { resolveCurrentSeason } = await freshSeasonModule()
    const result = await resolveCurrentSeason()

    expect(result).toEqual({ season: 2026, through_week: 16, is_live: false, source: 'games' })
  })
})

describe('resolveCurrentSeason: CFB_SEASON override', () => {
  it('wins over the data-driven season entirely, even when games would resolve differently', async () => {
    process.env.CFB_SEASON = '2025'
    const mock = mockClient({
      apiTables: { season_state: dbError('relation "api.season_state" does not exist') },
      tables: {
        // If the override path queried "newest completed season" the way the
        // non-override path does, it would see 2026 here -- it must not.
        games: [
          ok([{ week: 14 }]), // max completed week for the OVERRIDDEN season (2025)
          ok([]),             // no incomplete 2025 games remain
        ],
      },
    })

    const { resolveCurrentSeason } = await freshSeasonModule()
    const result = await resolveCurrentSeason()

    expect(result).toEqual({ season: 2025, through_week: 14, is_live: false, source: 'override' })
    // The override path must never ask "what is the newest completed season" --
    // only two games calls (week + is_live), scoped to the override season.
    expect(mock.from).toHaveBeenCalledTimes(2)
  })

  it('ignores a non-integer or out-of-range CFB_SEASON and falls through to normal resolution', async () => {
    for (const invalid of ['abc', '1999', '', '  ']) {
      process.env.CFB_SEASON = invalid
      mockClient({
        apiTables: { season_state: dbError('relation "api.season_state" does not exist') },
        tables: {
          games: [ok([{ season: 2026 }]), ok([{ week: 1 }]), ok([{ week: 2 }])],
        },
      })

      const { resolveCurrentSeason } = await freshSeasonModule()
      const result = await resolveCurrentSeason()

      expect(result.source).toBe('games')
      expect(result.season).toBe(2026)
    }
  })

  it('a row from api.season_state wins for the overridden season too, and games is never queried', async () => {
    process.env.CFB_SEASON = '2025'
    const mock = mockClient({
      apiTables: { season_state: ok([{ season: 2025, through_week: 9, is_complete: false }]) },
    })

    const { resolveCurrentSeason } = await freshSeasonModule()
    const result = await resolveCurrentSeason()

    expect(result).toEqual({ season: 2025, through_week: 9, is_live: true, source: 'override' })
    expect(mock.from).not.toHaveBeenCalled()
  })

  it('degrades through_week/is_live to null/false (not the CURRENT_SEASON fallback) when both queries fail', async () => {
    process.env.CFB_SEASON = '2025'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockClient({
      apiTables: { season_state: dbError('connection reset') },
      tables: { games: dbError('connection reset') },
    })

    const { resolveCurrentSeason } = await freshSeasonModule()
    const result = await resolveCurrentSeason()

    // R3: the override season itself is never in question, even on total failure.
    expect(result).toEqual({ season: 2025, through_week: null, is_live: false, source: 'override' })
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('readSeasonOverride validates directly: integer 2000-2100 only', () => {
    expect(readSeasonOverride({ CFB_SEASON: '2025' })).toBe(2025)
    expect(readSeasonOverride({ CFB_SEASON: 'abc' })).toBeUndefined()
    expect(readSeasonOverride({ CFB_SEASON: '1999' })).toBeUndefined()
    expect(readSeasonOverride({ CFB_SEASON: '2101' })).toBeUndefined()
    expect(readSeasonOverride({ CFB_SEASON: '2000.5' })).toBeUndefined()
    expect(readSeasonOverride({})).toBeUndefined()
    expect(readSeasonOverride({ CFB_SEASON: '' })).toBeUndefined()
  })
})

describe('resolveCurrentSeason: api.season_state', () => {
  it('a row from api.season_state wins, and games is never queried', async () => {
    const mock = mockClient({
      apiTables: { season_state: ok([{ season: 2026, through_week: 3, is_complete: false }]) },
    })

    const { resolveCurrentSeason } = await freshSeasonModule()
    const result = await resolveCurrentSeason()

    expect(result).toEqual({ season: 2026, through_week: 3, is_live: true, source: 'season_state' })
    expect(mock.from).not.toHaveBeenCalled()
  })

  it('a missing relation (42P01) falls through to games silently (no console.warn)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockClient({
      apiTables: { season_state: dbError('relation "api.season_state" does not exist') },
      tables: {
        games: [ok([{ season: 2026 }]), ok([{ week: 5 }]), ok([{ week: 6 }])],
      },
    })

    const { resolveCurrentSeason } = await freshSeasonModule()
    const result = await resolveCurrentSeason()

    expect(result).toEqual({ season: 2026, through_week: 5, is_live: true, source: 'games' })
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

describe('resolveCurrentSeason: total failure', () => {
  it('falls back to CURRENT_SEASON with null through_week and never throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockClient({
      apiTables: { season_state: dbError('connection reset') },
      tables: { games: dbError('connection reset') },
    })

    const { resolveCurrentSeason } = await freshSeasonModule()
    const result: SeasonState = await resolveCurrentSeason()

    expect(result).toEqual({ season: CURRENT_SEASON, through_week: null, is_live: false, source: 'fallback' })
    // The non-missing-relation error on season_state does get one console.warn.
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})

describe('scaleFloor', () => {
  const live = (through_week: number): SeasonState => ({
    season: 2026, through_week, is_live: true, source: 'games',
  })
  const completed: SeasonState = { season: 2025, through_week: 16, is_live: false, source: 'games' }

  it('scales down proportionally to weeks played, floored at MIN_SCALED_FLOOR', () => {
    expect(scaleFloor(50, live(1))).toBe(10) // ceil(50*1/12)=5 -> floored at 10
    expect(scaleFloor(50, live(6))).toBe(25) // ceil(50*6/12)=25
  })

  it('returns the default floor unscaled once the season is complete', () => {
    expect(scaleFloor(50, completed)).toBe(50)
  })

  it('never drops a small floor below itself', () => {
    expect(scaleFloor(10, live(3))).toBe(10) // ceil(10*3/12)=3 -> floored at 10
  })

  it('returns the default floor when through_week is unknowable, even if live', () => {
    expect(scaleFloor(50, { season: 2026, through_week: null, is_live: true, source: 'games' })).toBe(50)
  })

  it('never exceeds the default floor late in a live season', () => {
    // is_live only means "at least one incomplete game remains" -- a season
    // can still be live at through_week 13-16 (bowls pending, or a
    // cancelled game that never completes), where the raw ratio would
    // otherwise scale the floor UP past the default.
    expect(scaleFloor(50, live(13))).toBe(50)
    expect(scaleFloor(50, live(14))).toBe(50)
    expect(scaleFloor(50, live(16))).toBe(50)
    expect(scaleFloor(10, live(16))).toBe(10)
  })
})

describe('getCurrentSeasonForRoute: TTL cache', () => {
  it('resolves once and reuses the cached value for calls within the TTL', async () => {
    const mock = mockClient({
      apiTables: { season_state: dbError('relation "api.season_state" does not exist') },
      tables: {
        games: [ok([{ season: 2026 }]), ok([{ week: 1 }]), ok([{ week: 2 }])],
      },
    })

    const { getCurrentSeasonForRoute } = await freshSeasonModule()
    const first = await getCurrentSeasonForRoute()
    const second = await getCurrentSeasonForRoute()

    expect(second).toEqual(first)
    // Exactly one resolution's worth of `games` calls (3), not two.
    expect(mock.from).toHaveBeenCalledTimes(3)
  })

  it('resetSeasonCache() forces the next call to re-resolve', async () => {
    const mock = mockClient({
      apiTables: { season_state: dbError('relation "api.season_state" does not exist') },
      tables: {
        games: [
          ok([{ season: 2026 }]), ok([{ week: 1 }]), ok([{ week: 2 }]),
          ok([{ season: 2026 }]), ok([{ week: 2 }]), ok([{ week: 3 }]),
        ],
      },
    })

    const { getCurrentSeasonForRoute, resetSeasonCache } = await freshSeasonModule()
    await getCurrentSeasonForRoute()
    resetSeasonCache()
    await getCurrentSeasonForRoute()

    expect(mock.from).toHaveBeenCalledTimes(6)
  })

  it('re-resolves once the TTL has elapsed', async () => {
    vi.useFakeTimers()
    const mock = mockClient({
      apiTables: { season_state: dbError('relation "api.season_state" does not exist') },
      tables: {
        games: [
          ok([{ season: 2026 }]), ok([{ week: 1 }]), ok([{ week: 2 }]),
          ok([{ season: 2026 }]), ok([{ week: 2 }]), ok([{ week: 3 }]),
        ],
      },
    })

    const { getCurrentSeasonForRoute, SEASON_CACHE_TTL_MS } = await freshSeasonModule()
    await getCurrentSeasonForRoute()
    vi.advanceTimersByTime(SEASON_CACHE_TTL_MS + 1)
    await getCurrentSeasonForRoute()

    expect(mock.from).toHaveBeenCalledTimes(6)
  })

  it('caches a fallback result for FALLBACK_CACHE_TTL_MS, not the full SEASON_CACHE_TTL_MS', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mock = mockClient({
      // season_state keeps failing (a real error, not a missing relation)
      // across every resolution attempt.
      apiTables: { season_state: dbError('connection reset') },
      tables: {
        // Call 1 (newestCompletedSeason, first resolution) fails too -> a
        // total failure, same shape as the 'total failure' describe above.
        // Calls 2-4 (newestCompletedSeason + the two gamesWeekInfo queries
        // of the second resolution) succeed.
        games: [
          dbError('connection reset'),
          ok([{ season: 2026 }]), ok([{ week: 1 }]), ok([{ week: 2 }]),
        ],
      },
    })

    const { getCurrentSeasonForRoute, FALLBACK_CACHE_TTL_MS } = await freshSeasonModule()

    const first = await getCurrentSeasonForRoute()
    expect(first.source).toBe('fallback')
    expect(mock.from).toHaveBeenCalledTimes(1)

    // Still within the fallback TTL -- must reuse the cached value rather
    // than retrying the warehouse.
    await getCurrentSeasonForRoute()
    expect(mock.from).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(FALLBACK_CACHE_TTL_MS + 1)
    const second = await getCurrentSeasonForRoute()

    expect(second.source).toBe('games')
    expect(mock.from).toHaveBeenCalledTimes(4)
  })
})
