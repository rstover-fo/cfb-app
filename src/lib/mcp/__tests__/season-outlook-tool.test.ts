/**
 * Unit tests for the get_season_outlook MCP tool (tool 24).
 *
 * Beyond the usual envelope/never-throws contract, these pin the two things
 * that make this tool safe to answer a forward-looking question with: the
 * `accuracy` block is always attached, and the `caveats` array reacts to the
 * rows actually returned (a completed season, a partial schedule, an unscored
 * game each produce a different warning).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/queries/season-outlook', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/queries/season-outlook')>()
  return {
    ...actual,
    queryLatestOutlookSeason: vi.fn(),
    querySeasonOutlook: vi.fn(),
    queryModelBacktest: vi.fn(),
  }
})

import {
  queryLatestOutlookSeason,
  querySeasonOutlook,
  queryModelBacktest,
} from '@/lib/queries/season-outlook'
import type { SeasonOutlookRow, ModelBacktestRow } from '@/lib/queries/season-outlook'
import { getSeasonOutlookTool } from '../tools'

/** The live 2026-07-27 backtest run, verified against api.model_backtest. */
function backtestRow(overrides: Partial<ModelBacktestRow> = {}): ModelBacktestRow {
  return {
    model_version: 'fitted_v1',
    scope: 'fbs',
    run_date: '2026-07-27',
    season_start: 2019,
    season_end: 2025,
    n: 921,
    win_mae: 1.738,
    rmse: 2.167,
    bias: -0.122,
    coverage: 0.8067,
    resid_p10: -2.646,
    resid_p90: 3.024,
    baseline_prior_mae: 2.128,
    baseline_flat_mae: 2.14,
    beats_prior_baseline: true,
    ...overrides,
  }
}

/** A clean, fully-scheduled, not-yet-played FBS projection row. */
function row(overrides: Partial<SeasonOutlookRow> = {}): SeasonOutlookRow {
  return {
    projection_date: '2026-07-26',
    computed_at: '2026-07-26T16:05:45+00:00',
    model_version: 'fitted_v1',
    season: 2026,
    team: 'Georgia',
    conference: 'SEC',
    classification: 'fbs',
    is_projection: true,
    games_scheduled: 12,
    games_simulated: 12,
    games_unscored: 0,
    games_completed: 0,
    actual_wins: 0,
    schedule_complete: true,
    projected_wins: 9.17,
    projected_losses: 2.83,
    median_wins: 9,
    wins_p10: 7,
    wins_p25: 8,
    wins_p75: 10,
    wins_p90: 11,
    p_win_dist: { '7': 0.1, '8': 0.2, '9': 0.3, '10': 0.25, '11': 0.15 },
    p_bowl_eligible: 0.9794,
    p_ten_plus: 0.4539,
    sos_rating: 1624.9,
    sos_rank: 34,
    conf_title_prob: 0.2187,
    playoff_prob: null,
    n_sims: 10000,
    residual_sigma: 18.948,
    ...overrides,
  }
}

function okRows(rows: SeasonOutlookRow[]) {
  return { rows, error: null as string | null }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(queryLatestOutlookSeason).mockResolvedValue({ rows: [{ season: 2026 }], error: null })
  vi.mocked(queryModelBacktest).mockResolvedValue({ rows: [backtestRow()], error: null })
})

describe('getSeasonOutlookTool', () => {
  it('wraps conference rows in the api.season_outlook envelope with scope and model metadata', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(
      okRows([row(), row({ team: 'Ole Miss', projected_wins: 8.81, projected_losses: 3.19 })])
    )

    const parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC' }))

    expect(parsed._source).toBe('api.season_outlook')
    expect(parsed.count).toBe(2)
    expect(parsed.scope).toEqual({ conference: 'SEC', classification: 'fbs' })
    expect(parsed.model_version).toBe('fitted_v1')
    expect(parsed.n_sims).toBe(10000)
    expect(parsed.rows[0].team).toBe('Georgia')
  })

  it('answers a national query with no team or conference, defaulting to FBS', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([row(), row({ team: 'Ohio State' })]))

    const parsed = JSON.parse(await getSeasonOutlookTool({}))

    expect(parsed.scope).toEqual({ classification: 'fbs' })
    expect(querySeasonOutlook).toHaveBeenCalledWith(
      expect.objectContaining({ classification: 'fbs', team: undefined, conference: undefined })
    )
    expect(parsed.count).toBe(2)
  })

  it("passes classification through, and drops the filter entirely for 'all'", async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([row({ classification: 'fcs' })]))
    await getSeasonOutlookTool({ conference: 'Ivy', classification: 'fcs' })
    expect(querySeasonOutlook).toHaveBeenCalledWith(expect.objectContaining({ classification: 'fcs' }))

    vi.mocked(querySeasonOutlook).mockClear()
    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([row()]))
    const parsed = JSON.parse(await getSeasonOutlookTool({ classification: 'all' }))
    // 'all' is an opt-out, not a value the view stores.
    expect(querySeasonOutlook).toHaveBeenCalledWith(
      expect.objectContaining({ classification: undefined })
    )
    expect(parsed.scope.classification).toBe('all')
  })

  it('resolves the season from the view when none is given and reports where it came from', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([row()]))

    const parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC' }))

    expect(queryLatestOutlookSeason).toHaveBeenCalled()
    expect(parsed.season).toBe(2026)
    expect(parsed.season_source).toBe('latest_projection')
    expect(querySeasonOutlook).toHaveBeenCalledWith(
      expect.objectContaining({ season: 2026, conference: 'SEC' })
    )
  })

  it('skips the resolver when an explicit season is passed', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([row({ season: 2025 })]))

    const parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC', season: 2025 }))

    expect(queryLatestOutlookSeason).not.toHaveBeenCalled()
    expect(parsed.season).toBe(2025)
    expect(parsed.season_source).toBe('requested')
  })

  it('falls back past CURRENT_SEASON and says so when the resolver finds nothing', async () => {
    vi.mocked(queryLatestOutlookSeason).mockResolvedValue({ rows: [], error: null })
    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([row()]))

    const parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC' }))

    expect(parsed.season_source).toBe('fallback')
    expect(parsed.caveats.some((c: string) => /could not be read from the view/.test(c))).toBe(true)
  })

  it('returns the full win distribution in team mode and drops it in conference mode', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([row()]))
    const teamParsed = JSON.parse(await getSeasonOutlookTool({ team: 'Georgia' }))
    expect(teamParsed.rows[0].p_win_dist).toBeDefined()
    expect(teamParsed.scope).toEqual({ team: 'Georgia', classification: 'fbs' })

    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([row(), row({ team: 'Ole Miss' })]))
    const confParsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC' }))
    expect(confParsed.rows.every((r: SeasonOutlookRow) => !('p_win_dist' in r))).toBe(true)
    // The percentile band answers the same question and must survive.
    expect(confParsed.rows[0].wins_p10).toBe(7)
    expect(confParsed.rows[0].wins_p90).toBe(11)
  })

  it('builds the accuracy block live from api.model_backtest, not a hardcoded constant', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([row()]))
    // Deliberately not the real figures: proves the block is read, not baked in.
    vi.mocked(queryModelBacktest).mockResolvedValue({
      rows: [backtestRow({ win_mae: 9.99, n: 4242, resid_p10: -7.5, resid_p90: 8.25 })],
      error: null,
    })

    const parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC' }))

    expect(parsed.accuracy._source).toBe('api.model_backtest')
    expect(parsed.accuracy.win_mae).toBe(9.99)
    // `n` is team-seasons; renamed in the payload because it reads as games.
    expect(parsed.accuracy.n_team_seasons).toBe(4242)
    // Asymmetric on purpose: +/- the MAE would span only ~58% of outcomes.
    expect(parsed.accuracy.interval_80_pct).toEqual({ low: -7.5, high: 8.25 })
    expect(parsed.accuracy.summary).toMatch(/never \+\/- the MAE/)
    expect(parsed.accuracy.run_date).toBe('2026-07-27')
    expect(parsed.accuracy.scope).toBe('fbs')
  })

  it('stays silent when a duplicate backtest row agrees, and warns when it does not', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([row()]))

    // The real 2026-07-27 duplicate: same metrics, different declared window.
    // Picking either is cosmetic, so it must not add noise to every answer.
    vi.mocked(queryModelBacktest).mockResolvedValue({
      rows: [backtestRow(), backtestRow({ season_start: 2018 })],
      error: null,
    })
    let parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC' }))
    expect(parsed.caveats.some((c: string) => /do NOT agree/.test(c))).toBe(false)

    vi.mocked(queryModelBacktest).mockResolvedValue({
      rows: [backtestRow(), backtestRow({ season_start: 2018, win_mae: 2.9 })],
      error: null,
    })
    parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC' }))
    expect(parsed.caveats.some((c: string) => /do NOT agree/.test(c))).toBe(true)
    expect(parsed.caveats.some((c: string) => /backtest source was ambiguous/.test(c))).toBe(true)
    // The chosen row is still reported in full.
    expect(parsed.accuracy.win_mae).toBe(1.738)
  })

  it('renders an unmeasured model as null accuracy plus a caveat -- never as zero error', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([row()]))
    vi.mocked(queryModelBacktest).mockResolvedValue({ rows: [], error: null })

    const parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC' }))

    expect(parsed.accuracy).toBeNull()
    expect(parsed.caveats.some((c: string) => /UNMEASURED -- not zero/.test(c))).toBe(true)
    // The rows are still worth returning; only the error bar is missing.
    expect(parsed.count).toBe(1)
  })

  it('still returns the outlook when the backtest query errors, and says the error is unknown', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([row()]))
    vi.mocked(queryModelBacktest).mockResolvedValue({
      rows: [],
      error: 'Error: api.model_backtest request failed: statement timeout',
    })

    const parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC' }))

    expect(parsed.accuracy).toBeNull()
    expect(parsed.count).toBe(1)
    expect(parsed.caveats.some((c: string) => /accuracy of these projections is UNKNOWN/.test(c)))
      .toBe(true)
    expect(parsed.caveats.some((c: string) => /do not fall back to a remembered figure/.test(c)))
      .toBe(true)
  })

  it('always warns that playoff_prob is empty by design', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([row()]))

    const parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC' }))

    expect(parsed.caveats.some((c: string) => /playoff_prob is NULL on every row by design/.test(c)))
      .toBe(true)
  })

  it('emits no situational caveats for a clean, fully-scheduled, unplayed slate', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([row({ conf_title_prob: null })]))

    const parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC' }))
    const joined = parsed.caveats.join(' ')

    expect(joined).not.toMatch(/already/)
    expect(joined).not.toMatch(/incomplete schedule/)
    expect(joined).not.toMatch(/could not score/)
  })

  it('reads is_projection, not games_completed, to flag a settled season', async () => {
    // games_completed deliberately left at its projection-shaped default: the
    // view's own flag is authoritative and must be what drives the caveat.
    vi.mocked(querySeasonOutlook).mockResolvedValue(
      okRows([row({ season: 2025, is_projection: false, actual_wins: 12 })])
    )

    const parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC', season: 2025 }))
    const joined = parsed.caveats.join(' ')

    expect(joined).toMatch(/Season 2025 is already fully played -- is_projection is false/)
    expect(joined).toMatch(/Report these as results, not as a forecast/)
    expect(joined).toMatch(/tiebreak artifact/)
  })

  it('distinguishes a partly-settled result set from a fully settled one', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(
      okRows([row({ is_projection: false }), row({ team: 'Ole Miss' })])
    )

    const parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC' }))
    const joined = parsed.caveats.join(' ')

    expect(joined).toMatch(/1 of 2 rows are already settled/)
    expect(joined).not.toMatch(/tiebreak artifact/)
  })

  it('counts partially-loaded schedules and names the thinnest one', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(
      okRows([
        row(),
        row({ team: 'Vanderbilt', schedule_complete: false, games_simulated: 3 }),
        row({ team: 'Auburn', schedule_complete: false, games_simulated: 9 }),
      ])
    )

    const parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC' }))

    expect(parsed.caveats.some((c: string) => /2 of 3 teams have an incomplete schedule/.test(c)))
      .toBe(true)
    expect(parsed.caveats.some((c: string) => /as few as 3 games/.test(c))).toBe(true)
    // FBS rows: the DII/DIII calibration warning must not fire here.
    expect(parsed.caveats.some((c: string) => /NOT confirmed/.test(c))).toBe(false)
  })

  it('marks an incomplete-schedule flag as unverified for DII/DIII only', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(
      okRows([
        row({ team: 'Ferris State', classification: 'ii', schedule_complete: false, games_simulated: 1 }),
        row({ team: 'Mount Union', classification: 'iii', schedule_complete: false, games_simulated: 2 }),
      ])
    )

    const parsed = JSON.parse(await getSeasonOutlookTool({ classification: 'all' }))

    expect(parsed.caveats.some((c: string) => /2 of those are DII\/DIII/.test(c))).toBe(true)
    expect(parsed.caveats.some((c: string) => /schedule_complete is calibrated correctly/.test(c)))
      .toBe(true)
  })

  it('explains that p_bowl_eligible is null outside FBS by design', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(
      okRows([row({ team: 'Yale', conference: 'Ivy', classification: 'fcs', p_bowl_eligible: null })])
    )

    const parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'Ivy', classification: 'fcs' }))

    expect(parsed.caveats.some((c: string) => /p_bowl_eligible is NULL for them BY DESIGN/.test(c)))
      .toBe(true)
    expect(parsed.caveats.some((c: string) => /p_ten_plus still means the same thing/.test(c)))
      .toBe(true)
  })

  it('warns when the row cap truncated the result', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(
      okRows(Array.from({ length: 3 }, (_, i) => row({ team: `Team ${i}` })))
    )

    const parsed = JSON.parse(await getSeasonOutlookTool({ limit: 3 }))

    expect(parsed.caveats.some((c: string) => /which is the row limit/.test(c))).toBe(true)
  })

  it('warns that unscored games are excluded rather than counted as losses', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(
      okRows([row({ games_unscored: 2, games_simulated: 10 })])
    )

    const parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC' }))

    expect(parsed.caveats.some((c: string) => /EXCLUDED from the simulation, not counted as losses/.test(c)))
      .toBe(true)
  })

  it('calls out conf_title_prob as a no-tiebreaker, no-title-game approximation', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([row()]))

    const parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC' }))

    expect(parsed.caveats.some((c: string) => /NO tiebreakers and NO conference/.test(c))).toBe(true)
  })

  it('returns a friendly no-match string naming the case-sensitivity trap', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([]))

    const text = await getSeasonOutlookTool({ conference: 'sec' })

    expect(text).toMatch(/^No season outlook found for conference 'sec' in season 2026/)
    expect(text).toMatch(/exact and case-sensitive/)
    // The default FBS filter is the other reason a real name comes back empty,
    // so the miss has to name it -- otherwise 'Ivy' reads as "no such conference".
    expect(text).toMatch(/classification='fbs'/)
  })

  it('passes a query-layer error straight through', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue({
      rows: [],
      error: 'Error: api.season_outlook request failed: statement timeout',
    })

    expect(await getSeasonOutlookTool({ conference: 'SEC' }))
      .toBe('Error: api.season_outlook request failed: statement timeout')
  })

  it('forwards limit to the query layer', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([row()]))

    await getSeasonOutlookTool({ conference: 'SEC', limit: 5 })

    expect(querySeasonOutlook).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }))
  })

  it('never throws: resolves to a string even with no rows', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([]))

    await expect(getSeasonOutlookTool({ team: 'Nobody State' })).resolves.toEqual(expect.any(String))
  })
})
