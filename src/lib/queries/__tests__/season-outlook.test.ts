/**
 * Unit tests for the season-projection query layer
 * (src/lib/queries/season-outlook.ts). These functions back the
 * get_season_outlook MCP tool and keep mcp.ts's contract: raw view rows,
 * friendly "Error: ..." strings on failure (never a throw), and hard row caps.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createSupabaseMock, dbError, ok, type SupabaseMockConfig } from './helpers'
import { DEFAULT_ROW_CAP } from '../mcp'
import {
  SEASON_OUTLOOK_MODEL,
  SEASON_OUTLOOK_DEFAULT_LIMIT,
  MODEL_BACKTEST_SCOPE_FBS,
  queryLatestOutlookSeason,
  querySeasonOutlook,
  queryModelBacktest,
  backtestRowsDisagree,
} from '../season-outlook'

function mockClient(config: SupabaseMockConfig) {
  const mock = createSupabaseMock(config)
  vi.mocked(createClient).mockResolvedValue(mock as unknown as Awaited<ReturnType<typeof createClient>>)
  return mock
}

function apiChain(mock: ReturnType<typeof mockClient>) {
  return mock.schema.mock.results[0].value.from.mock.results[0].value
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('queryLatestOutlookSeason', () => {
  it('asks for the single newest season, pinned to the house model', async () => {
    const mock = mockClient({ apiTables: { season_outlook: ok([{ season: 2026 }]) } })
    const result = await queryLatestOutlookSeason()

    expect(result).toEqual({ rows: [{ season: 2026 }], error: null })
    const chain = apiChain(mock)
    expect(mock.schema).toHaveBeenCalledWith('api')
    expect(chain.eq).toHaveBeenCalledWith('model_version', SEASON_OUTLOOK_MODEL)
    expect(chain.order).toHaveBeenCalledWith('season', { ascending: false })
    expect(chain.limit).toHaveBeenCalledWith(1)
  })

  it('returns [] with no error when the view is empty', async () => {
    mockClient({ apiTables: { season_outlook: ok([]) } })
    expect(await queryLatestOutlookSeason()).toEqual({ rows: [], error: null })
  })

  it('returns a friendly "Error: ..." string (never throws) on PostgREST error', async () => {
    mockClient({ apiTables: { season_outlook: dbError('connection refused') } })
    const result = await queryLatestOutlookSeason()

    expect(result.rows).toEqual([])
    expect(result.error).toMatch(/^Error: api\.season_outlook request failed: connection refused$/)
  })
})

describe('querySeasonOutlook', () => {
  it('filters on season + conference and orders by projected wins descending', async () => {
    const rows = [
      { team: 'Georgia', conference: 'SEC', projected_wins: 9.17 },
      { team: 'Ole Miss', conference: 'SEC', projected_wins: 8.81 },
    ]
    const mock = mockClient({ apiTables: { season_outlook: ok(rows) } })
    const result = await querySeasonOutlook({ season: 2026, conference: 'SEC' })

    expect(result.error).toBeNull()
    expect(result.rows).toEqual(rows)
    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('season', 2026)
    expect(chain.eq).toHaveBeenCalledWith('conference', 'SEC')
    expect(chain.eq).not.toHaveBeenCalledWith('team', expect.anything())
    // Conference ordering by projected_wins IS the projected standings.
    expect(chain.order).toHaveBeenCalledWith('projected_wins', { ascending: false })
    expect(chain.order).toHaveBeenCalledWith('team', { ascending: true })
  })

  it('filters on team when given one', async () => {
    const mock = mockClient({ apiTables: { season_outlook: ok([{ team: 'Oklahoma' }]) } })
    await querySeasonOutlook({ season: 2026, team: 'Oklahoma' })

    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('team', 'Oklahoma')
    expect(chain.eq).not.toHaveBeenCalledWith('conference', expect.anything())
  })

  it('filters on classification when given one, and omits the filter otherwise', async () => {
    const mock = mockClient({ apiTables: { season_outlook: ok([]) } })
    await querySeasonOutlook({ season: 2026, classification: 'fbs' })
    expect(apiChain(mock).eq).toHaveBeenCalledWith('classification', 'fbs')

    vi.clearAllMocks()
    const mock2 = mockClient({ apiTables: { season_outlook: ok([]) } })
    await querySeasonOutlook({ season: 2026, conference: 'SEC' })
    expect(apiChain(mock2).eq).not.toHaveBeenCalledWith('classification', expect.anything())
  })

  it('always pins model_version so the view stays on one row per team-season', async () => {
    const mock = mockClient({ apiTables: { season_outlook: ok([]) } })
    await querySeasonOutlook({ season: 2026, conference: 'SEC' })

    expect(apiChain(mock).eq).toHaveBeenCalledWith('model_version', SEASON_OUTLOOK_MODEL)
  })

  it('defaults the limit and clamps a caller-supplied one to DEFAULT_ROW_CAP', async () => {
    const mock = mockClient({ apiTables: { season_outlook: ok([]) } })
    await querySeasonOutlook({ season: 2026, conference: 'SEC' })
    expect(apiChain(mock).limit).toHaveBeenCalledWith(SEASON_OUTLOOK_DEFAULT_LIMIT)

    vi.clearAllMocks()
    const mock2 = mockClient({ apiTables: { season_outlook: ok([]) } })
    await querySeasonOutlook({ season: 2026, conference: 'SEC', limit: 5000 })
    expect(apiChain(mock2).limit).toHaveBeenCalledWith(DEFAULT_ROW_CAP)
  })

  it('returns [] with no error when the filter matches nothing', async () => {
    mockClient({ apiTables: { season_outlook: ok([]) } })
    expect(await querySeasonOutlook({ season: 2026, conference: 'Nonesuch' }))
      .toEqual({ rows: [], error: null })
  })

  it('returns a friendly "Error: ..." string (never throws) on PostgREST error', async () => {
    mockClient({ apiTables: { season_outlook: dbError('statement timeout') } })
    const result = await querySeasonOutlook({ season: 2026, conference: 'SEC' })

    expect(result.rows).toEqual([])
    expect(result.error).toMatch(/^Error: api\.season_outlook request failed: statement timeout$/)
  })
})

describe('queryModelBacktest', () => {
  it('pins model and scope and orders deterministically past a run_date tie', async () => {
    const mock = mockClient({
      apiTables: { model_backtest: ok([{ model_version: 'fitted_v1', scope: 'fbs', n: 921 }]) },
    })
    const result = await queryModelBacktest()

    expect(result.error).toBeNull()
    expect(result.rows[0].n).toBe(921)
    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('model_version', SEASON_OUTLOOK_MODEL)
    // 'all_divisions' is a different measurement, not a superset.
    expect(chain.eq).toHaveBeenCalledWith('scope', MODEL_BACKTEST_SCOPE_FBS)
    expect(chain.order).toHaveBeenCalledWith('run_date', { ascending: false })
    // Model+scope does NOT reach a single row: the view's grain also includes
    // the season window, and fitted_v1/fbs really does hold two rows with the
    // same run_date. Without these tiebreaks the pick is up to Postgres.
    expect(chain.order).toHaveBeenCalledWith('season_start', { ascending: false })
    expect(chain.order).toHaveBeenCalledWith('season_end', { ascending: false })
    // Two rows so the caller can tell a material tie from a cosmetic one.
    expect(chain.limit).toHaveBeenCalledWith(2)
  })

  it('backtestRowsDisagree only fires on metrics this app reports', () => {
    const base = {
      model_version: 'fitted_v1', scope: 'fbs', run_date: '2026-07-27',
      season_start: 2019, season_end: 2025, n: 921, win_mae: 1.738, rmse: 2.167,
      bias: -0.122, coverage: 0.8067, resid_p10: -2.646, resid_p90: 3.024,
      baseline_prior_mae: 2.128, baseline_flat_mae: 2.14, beats_prior_baseline: true,
    }
    // The real duplicate: identical metrics, different declared window.
    expect(backtestRowsDisagree(base, { ...base, season_start: 2018 })).toBe(false)
    expect(backtestRowsDisagree(base, { ...base, win_mae: 1.9 })).toBe(true)
    expect(backtestRowsDisagree(base, { ...base, resid_p90: 4.0 })).toBe(true)
    expect(backtestRowsDisagree(base, { ...base, n: 800 })).toBe(true)
  })

  it('accepts an explicit model and scope', async () => {
    const mock = mockClient({ apiTables: { model_backtest: ok([]) } })
    await queryModelBacktest('elo_v1', 'all_divisions')

    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('model_version', 'elo_v1')
    expect(chain.eq).toHaveBeenCalledWith('scope', 'all_divisions')
  })

  it('returns [] with no error when the model has never been backtested', async () => {
    mockClient({ apiTables: { model_backtest: ok([]) } })
    // The caller must render this as unmeasured, never as zero error.
    expect(await queryModelBacktest()).toEqual({ rows: [], error: null })
  })

  it('returns a friendly "Error: ..." string (never throws) on PostgREST error', async () => {
    mockClient({ apiTables: { model_backtest: dbError('relation does not exist') } })
    const result = await queryModelBacktest()

    expect(result.rows).toEqual([])
    expect(result.error).toMatch(/^Error: api\.model_backtest request failed: relation does not exist$/)
  })
})
