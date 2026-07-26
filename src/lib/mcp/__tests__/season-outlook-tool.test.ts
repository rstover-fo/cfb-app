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
  }
})

import { queryLatestOutlookSeason, querySeasonOutlook } from '@/lib/queries/season-outlook'
import type { SeasonOutlookRow } from '@/lib/queries/season-outlook'
import { getSeasonOutlookTool } from '../tools'

/** A clean, fully-scheduled, not-yet-played projection row. */
function row(overrides: Partial<SeasonOutlookRow> = {}): SeasonOutlookRow {
  return {
    projection_date: '2026-07-26',
    computed_at: '2026-07-26T16:05:45+00:00',
    model_version: 'fitted_v1',
    season: 2026,
    team: 'Georgia',
    conference: 'SEC',
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
})

describe('getSeasonOutlookTool', () => {
  it('wraps conference rows in the api.season_outlook envelope with scope and model metadata', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(
      okRows([row(), row({ team: 'Ole Miss', projected_wins: 8.81, projected_losses: 3.19 })])
    )

    const parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC' }))

    expect(parsed._source).toBe('api.season_outlook')
    expect(parsed.count).toBe(2)
    expect(parsed.scope).toEqual({ conference: 'SEC' })
    expect(parsed.model_version).toBe('fitted_v1')
    expect(parsed.n_sims).toBe(10000)
    expect(parsed.rows[0].team).toBe('Georgia')
  })

  it('requires a team or conference and never touches the query layer without one', async () => {
    const text = await getSeasonOutlookTool({})

    expect(text).toMatch(/^Provide a team or a conference/)
    expect(text).toMatch(/not FBS-only/)
    expect(querySeasonOutlook).not.toHaveBeenCalled()
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
    expect(teamParsed.scope).toEqual({ team: 'Georgia' })

    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([row(), row({ team: 'Ole Miss' })]))
    const confParsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC' }))
    expect(confParsed.rows.every((r: SeasonOutlookRow) => !('p_win_dist' in r))).toBe(true)
    // The percentile band answers the same question and must survive.
    expect(confParsed.rows[0].wins_p10).toBe(7)
    expect(confParsed.rows[0].wins_p90).toBe(11)
  })

  it('always attaches the backtest accuracy block with the asymmetric 80% interval', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(okRows([row()]))

    const parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC' }))

    expect(parsed.accuracy.win_mae).toBe(1.743)
    expect(parsed.accuracy.n_team_seasons).toBe(921)
    // Asymmetric on purpose: +/- the MAE would span only ~58% of outcomes.
    expect(parsed.accuracy.interval_80_pct).toEqual({ low: -2.68, high: 3.02 })
    expect(parsed.accuracy.baseline_win_mae.prior_season_record).toBe(2.128)
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

  it('flags a completed season as results rather than a forecast, incl. the title-odds artifact', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(
      okRows([row({ season: 2025, games_completed: 12, games_scheduled: 12, actual_wins: 12 })])
    )

    const parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC', season: 2025 }))
    const joined = parsed.caveats.join(' ')

    expect(joined).toMatch(/Season 2025 is already fully played/)
    expect(joined).toMatch(/Report these as results, not as a forecast/)
    expect(joined).toMatch(/tiebreak artifact/)
  })

  it('distinguishes a part-played season from a fully settled one', async () => {
    vi.mocked(querySeasonOutlook).mockResolvedValue(
      okRows([row({ games_completed: 6 }), row({ team: 'Ole Miss' })])
    )

    const parsed = JSON.parse(await getSeasonOutlookTool({ conference: 'SEC' }))
    const joined = parsed.caveats.join(' ')

    expect(joined).toMatch(/1 of 2 teams have already played games/)
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
