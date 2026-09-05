/**
 * Season-rollover U2/U3: cross-cutting tests over every MCP tool that
 * defaults `season`, verifying two properties no single tool's own test file
 * checks in one place:
 *
 * 1. STATIC -- no tool description or input-shape describe() text hardcodes a
 *    four-digit year for its season default (that text goes stale the moment
 *    a season rolls over). get_season_outlook is exempt: it resolves from
 *    its own view, not the shared "current season" resolver, and legitimately
 *    illustrates its season param with an example year.
 * 2. DYNAMIC -- with the shared resolver (src/lib/queries/season.ts) mocked
 *    to a fixed, live season state, every season-defaulted tool: (a) asks its
 *    query layer for that resolved season when the caller omits `season`,
 *    and (b) carries that season/through_week/source back as `as_of` on a
 *    non-empty result.
 *
 * The tool set here is exactly the 12 `args.season ?? <resolved>` call sites
 * in tools.ts (grep for that pattern to reproduce the list) plus
 * get_data_freshness, which reports the resolved season without defaulting
 * an argument. get_leaderboard, query_games, and get_penalty_log take/pass
 * `season` but never default it from the resolver -- they are intentionally
 * NOT covered here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/queries/season', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/queries/season')>()
  return {
    ...actual,
    getCurrentSeasonForRoute: vi.fn().mockResolvedValue({
      season: 2026,
      through_week: 1,
      is_live: true,
      source: 'games',
    }),
  }
})

vi.mock('@/lib/queries/predictions', () => ({
  getGamePrediction: vi.fn(),
  getTeamElo: vi.fn(),
  getTeamEloHistory: vi.fn(),
  getScoredMatchupEdges: vi.fn(),
  getPredictionAccuracy: vi.fn(),
}))

vi.mock('@/lib/queries/playcalling', () => ({
  getPlaycallingProfile: vi.fn(),
  getTeamWeekFeatures: vi.fn(),
}))

vi.mock('@/lib/queries/players', () => ({
  getWepaLeaders: vi.fn(),
  getUsageLeaders: vi.fn(),
  getPlayerComparison: vi.fn(),
}))

vi.mock('@/lib/queries/conferences', () => ({
  getConferenceComparison: vi.fn(),
}))

vi.mock('@/lib/queries/penalties', () => ({
  queryTeamPenaltyGames: vi.fn(),
  queryTeamSeasonPenaltyPlays: vi.fn(),
  queryPenaltyLog: vi.fn(),
}))

vi.mock('@/lib/queries/rushing-charting', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries/rushing-charting')>(
    '@/lib/queries/rushing-charting'
  )
  return { ...actual, queryRushingChartingPlayers: vi.fn() }
})

vi.mock('@/lib/queries/passing-charting', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries/passing-charting')>(
    '@/lib/queries/passing-charting'
  )
  return { ...actual, queryPassingChartingPlayers: vi.fn(), queryTargetProfiles: vi.fn() }
})

vi.mock('@/lib/queries/mcp', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries/mcp')>('@/lib/queries/mcp')
  return { ...actual, callDataFreshness: vi.fn() }
})

import { getTeamElo, getTeamEloHistory, getScoredMatchupEdges } from '@/lib/queries/predictions'
import { getPlaycallingProfile, getTeamWeekFeatures } from '@/lib/queries/playcalling'
import { getWepaLeaders } from '@/lib/queries/players'
import { getConferenceComparison } from '@/lib/queries/conferences'
import { queryTeamPenaltyGames, queryTeamSeasonPenaltyPlays } from '@/lib/queries/penalties'
import { queryRushingChartingPlayers } from '@/lib/queries/rushing-charting'
import { queryPassingChartingPlayers, queryTargetProfiles } from '@/lib/queries/passing-charting'
import { callDataFreshness } from '@/lib/queries/mcp'

import {
  getTeamEloTool,
  getTeamEloDescription,
  getTeamEloInputShape,
  getMatchupEdgesTool,
  getMatchupEdgesDescription,
  getMatchupEdgesInputShape,
  getPlaycallingProfileTool,
  getPlaycallingProfileDescription,
  getPlaycallingProfileInputShape,
  getAdjustedEpaTool,
  getAdjustedEpaDescription,
  getAdjustedEpaInputShape,
  getPlayerLeadersTool,
  getPlayerLeadersDescription,
  getPlayerLeadersInputShape,
  getConferenceComparisonTool,
  getConferenceComparisonDescription,
  getConferenceComparisonInputShape,
  getPenaltyProfileTool,
  getPenaltyProfileDescription,
  getPenaltyProfileInputShape,
  renderChartDescription,
  renderChartInputShape,
  getRushingChartingTool,
  getRushingChartingDescription,
  getRushingChartingInputShape,
  getPassingChartingTool,
  getPassingChartingDescription,
  getPassingChartingInputShape,
  getTargetProfileTool,
  getTargetProfileDescription,
  getTargetProfileInputShape,
  getDataFreshnessTool,
  getDataFreshnessDescription,
  getDataFreshnessInputShape,
  getSeasonOutlookDescription,
  getSeasonOutlookInputShape,
} from '../tools'

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// 1. Static: no hardcoded four-digit year in a season-defaulting description
// ---------------------------------------------------------------------------

const YEAR_RE = /\b20\d\d\b/

/** Every describe() string on a zod shape, flattened. */
function describeTexts(shape: Record<string, { description?: string }>): string[] {
  return Object.values(shape)
    .map(field => field?.description)
    .filter((d): d is string => typeof d === 'string')
}

describe('season-defaulted tool descriptions never hardcode a year', () => {
  const cases: Array<[string, string]> = [
    ['getTeamEloDescription', getTeamEloDescription],
    ['getMatchupEdgesDescription', getMatchupEdgesDescription],
    ['getPlaycallingProfileDescription', getPlaycallingProfileDescription],
    ['getAdjustedEpaDescription', getAdjustedEpaDescription],
    ['getPlayerLeadersDescription', getPlayerLeadersDescription],
    ['getConferenceComparisonDescription', getConferenceComparisonDescription],
    ['getPenaltyProfileDescription', getPenaltyProfileDescription],
    ['renderChartDescription', renderChartDescription],
    ['getRushingChartingDescription', getRushingChartingDescription],
    ['getPassingChartingDescription', getPassingChartingDescription],
    ['getTargetProfileDescription', getTargetProfileDescription],
    ['getDataFreshnessDescription', getDataFreshnessDescription],
  ]

  it.each(cases)('%s has no four-digit-year season default text', (_name, description) => {
    // Only the SEASON-DEFAULT sentence is banned from a year -- these
    // descriptions may still legitimately cite fixed historical facts (e.g.
    // "charting starts in 2025"), so this asserts on the specific phrase
    // rather than the whole description.
    expect(description).not.toMatch(/current season \(20\d\d\)/)
    expect(description).not.toMatch(/Defaults to 20\d\d\b/)
  })

  const inputShapeCases: Array<[string, Record<string, { description?: string }>]> = [
    ['getTeamEloInputShape', getTeamEloInputShape],
    ['getMatchupEdgesInputShape', getMatchupEdgesInputShape],
    ['getPlaycallingProfileInputShape', getPlaycallingProfileInputShape],
    ['getAdjustedEpaInputShape', getAdjustedEpaInputShape],
    ['getPlayerLeadersInputShape', getPlayerLeadersInputShape],
    ['getConferenceComparisonInputShape', getConferenceComparisonInputShape],
    ['getPenaltyProfileInputShape', getPenaltyProfileInputShape],
    ['getRushingChartingInputShape', getRushingChartingInputShape],
    ['getPassingChartingInputShape', getPassingChartingInputShape],
    ['getTargetProfileInputShape', getTargetProfileInputShape],
    ['getDataFreshnessInputShape', getDataFreshnessInputShape],
  ]

  it.each(inputShapeCases)('%s season field has no hardcoded year default', (_name, shape) => {
    const seasonField = (shape as { season?: { description?: string } }).season
    if (!seasonField) return // e.g. getDataFreshnessInputShape takes no arguments
    expect(seasonField.description).not.toMatch(/Defaults to 20\d\d\b/)
    expect(seasonField.description).not.toMatch(/current season \(20\d\d\)/)
  })

  // render_chart's `season`/`to` fields live alongside `from`/`teams`/etc,
  // each of which legitimately uses an example year (e.g. "e.g. 2024") -- so
  // this checks the specific default-season sentence rather than banning
  // every year in the shape outright.
  it('renderChartInputShape season/to fields default to "the current season", no year', () => {
    expect(renderChartInputShape.season.description).toMatch(/current season/)
    expect(renderChartInputShape.season.description).not.toMatch(/current season \(20\d\d\)/)
    expect(renderChartInputShape.to.description).toMatch(/current season/)
    expect(renderChartInputShape.to.description).not.toMatch(/current season \(20\d\d\)/)
  })

  // get_season_outlook is the one legitimate exception (R11): it resolves
  // from its own view, not the shared resolver, and its season field
  // illustrates with an example year on purpose (the description itself
  // stays year-free, per "prefer none"). This just documents that the
  // exemption is scoped to this one tool's `season` field, not a loophole
  // for the rest.
  it("getSeasonOutlookInputShape's season field may cite an example year (not defaulted from the shared resolver)", () => {
    expect(getSeasonOutlookDescription).not.toMatch(/current season \(20\d\d\)/)
    expect(describeTexts(getSeasonOutlookInputShape).join(' ')).toMatch(YEAR_RE)
  })
})

// ---------------------------------------------------------------------------
// 2. Dynamic: the resolved season reaches the query layer and comes back as as_of
// ---------------------------------------------------------------------------

describe('season-defaulted tools resolve season at call time', () => {
  it('get_team_elo asks for the resolved season and echoes it as as_of', async () => {
    const elo = { team: 'Oklahoma', season: 2026, season_end_elo: 1700 }
    vi.mocked(getTeamElo).mockResolvedValue(elo as never)
    vi.mocked(getTeamEloHistory).mockResolvedValue([])

    const parsed = JSON.parse(await getTeamEloTool({ team: 'Oklahoma' }))

    expect(getTeamElo).toHaveBeenCalledWith('Oklahoma', 2026)
    expect(parsed.as_of).toEqual({ season: 2026, through_week: 1, source: 'games' })
  })

  it('get_matchup_edges asks for the resolved season and echoes it as as_of', async () => {
    vi.mocked(getScoredMatchupEdges).mockResolvedValue([{ game_id: 1 }] as never)

    const parsed = JSON.parse(await getMatchupEdgesTool({}))

    expect(getScoredMatchupEdges).toHaveBeenCalledWith(2026, undefined, 'fitted_v1')
    expect(parsed.as_of).toEqual({ season: 2026, through_week: 1, source: 'games' })
  })

  it('get_playcalling_profile asks for the resolved season and echoes it as as_of', async () => {
    const profile = { team: 'Oklahoma', season: 2026 }
    vi.mocked(getPlaycallingProfile).mockResolvedValue(profile as never)

    const parsed = JSON.parse(await getPlaycallingProfileTool({ team: 'Oklahoma' }))

    expect(getPlaycallingProfile).toHaveBeenCalledWith('Oklahoma', 2026)
    expect(parsed.as_of).toEqual({ season: 2026, through_week: 1, source: 'games' })
  })

  it('get_adjusted_epa asks for the resolved season and echoes it as as_of', async () => {
    vi.mocked(getTeamWeekFeatures).mockResolvedValue([{ team: 'Oklahoma', season: 2026, week: 1 }] as never)

    const parsed = JSON.parse(await getAdjustedEpaTool({ team: 'Oklahoma' }))

    expect(getTeamWeekFeatures).toHaveBeenCalledWith('Oklahoma', 2026)
    expect(parsed.as_of).toEqual({ season: 2026, through_week: 1, source: 'games' })
  })

  it('get_player_leaders asks for the resolved season and echoes it as as_of', async () => {
    vi.mocked(getWepaLeaders).mockResolvedValue([{ athlete_name: 'X', season_rank: 1 }] as never)

    const parsed = JSON.parse(await getPlayerLeadersTool({ type: 'wepa' }))

    expect(getWepaLeaders).toHaveBeenCalledWith(2026, undefined, 25)
    expect(parsed.as_of).toEqual({ season: 2026, through_week: 1, source: 'games' })
  })

  it('get_conference_comparison asks for the resolved season and echoes it as as_of', async () => {
    vi.mocked(getConferenceComparison).mockResolvedValue([{ conference: 'SEC', season: 2026 }] as never)

    const parsed = JSON.parse(await getConferenceComparisonTool({}))

    expect(getConferenceComparison).toHaveBeenCalledWith(2026)
    expect(parsed.as_of).toEqual({ season: 2026, through_week: 1, source: 'games' })
  })

  it('get_penalty_profile asks for the resolved season and echoes it as as_of', async () => {
    vi.mocked(queryTeamPenaltyGames).mockResolvedValue({
      rows: [
        {
          game_id: 1,
          season: 2026,
          week: 1,
          season_type: 'regular',
          team: 'Oklahoma',
          opponent: 'Temple',
          home_away: 'home',
          penalties: 5,
          penalty_yards: 40,
          opponent_penalties: 4,
          opponent_penalty_yards: 30,
        },
      ],
      error: null,
    } as never)
    vi.mocked(queryTeamSeasonPenaltyPlays).mockResolvedValue({ rows: [], error: null } as never)

    const parsed = JSON.parse(await getPenaltyProfileTool({ team: 'Oklahoma' }))

    expect(queryTeamPenaltyGames).toHaveBeenCalledWith('Oklahoma', 2026)
    expect(parsed.as_of).toEqual({ season: 2026, through_week: 1, source: 'games' })
  })

  it('get_rushing_charting asks for the resolved season (via state) and echoes it as as_of', async () => {
    vi.mocked(queryRushingChartingPlayers).mockResolvedValue({
      rows: [{ season: 2026, player_id: '1', attempts: 12 }],
      error: null,
    } as never)

    const parsed = JSON.parse(await getRushingChartingTool({}))

    expect(queryRushingChartingPlayers).toHaveBeenCalledWith(
      expect.objectContaining({ state: expect.objectContaining({ season: 2026 }) })
    )
    expect(parsed.as_of).toEqual({ season: 2026, through_week: 1, source: 'games' })
  })

  it('get_passing_charting asks for the resolved season (via state) and echoes it as as_of', async () => {
    vi.mocked(queryPassingChartingPlayers).mockResolvedValue({
      rows: [{ season: 2026, player_id: '1', attempts: 60, air_yards_attempts_available: 60 }],
      error: null,
    } as never)

    const parsed = JSON.parse(await getPassingChartingTool({}))

    expect(queryPassingChartingPlayers).toHaveBeenCalledWith(
      expect.objectContaining({ state: expect.objectContaining({ season: 2026 }) })
    )
    expect(parsed.as_of).toEqual({ season: 2026, through_week: 1, source: 'games' })
  })

  it('get_target_profile asks for the resolved season (via state) and echoes it as as_of', async () => {
    vi.mocked(queryTargetProfiles).mockResolvedValue({
      rows: [{ season: 2026, target_id: '1', targets_charted: 12 }],
      error: null,
    } as never)

    const parsed = JSON.parse(await getTargetProfileTool({}))

    expect(queryTargetProfiles).toHaveBeenCalledWith(
      expect.objectContaining({ state: expect.objectContaining({ season: 2026 }) })
    )
    expect(parsed.as_of).toEqual({ season: 2026, through_week: 1, source: 'games' })
  })

  it('get_data_freshness reports the resolved season/through_week/source', async () => {
    vi.mocked(callDataFreshness).mockResolvedValue({ rows: [{ table_name: 'games', is_stale: false }], error: null } as never)

    const parsed = JSON.parse(await getDataFreshnessTool())

    expect(parsed.current_season).toBe(2026)
    expect(parsed.through_week).toBe(1)
    expect(parsed.season_source).toBe('games')
  })

  it('empty-result tools still resolve the season without throwing', async () => {
    vi.mocked(getTeamElo).mockResolvedValue(null)
    vi.mocked(getTeamEloHistory).mockResolvedValue([])
    vi.mocked(getPlaycallingProfile).mockResolvedValue(null)
    vi.mocked(getTeamWeekFeatures).mockResolvedValue([])
    vi.mocked(getWepaLeaders).mockResolvedValue([])
    vi.mocked(getConferenceComparison).mockResolvedValue([])
    vi.mocked(queryTeamPenaltyGames).mockResolvedValue({ rows: [], error: null } as never)
    vi.mocked(queryTeamSeasonPenaltyPlays).mockResolvedValue({ rows: [], error: null } as never)
    vi.mocked(queryRushingChartingPlayers).mockResolvedValue({ rows: [], error: null } as never)
    vi.mocked(queryPassingChartingPlayers).mockResolvedValue({ rows: [], error: null } as never)
    vi.mocked(queryTargetProfiles).mockResolvedValue({ rows: [], error: null } as never)

    const results = await Promise.all([
      getTeamEloTool({ team: 'Nobody' }),
      getPlaycallingProfileTool({ team: 'Nobody' }),
      getAdjustedEpaTool({ team: 'Nobody' }),
      getPlayerLeadersTool({ type: 'wepa' }),
      getConferenceComparisonTool({}),
      getPenaltyProfileTool({ team: 'Nobody' }),
      getRushingChartingTool({}),
      getPassingChartingTool({}),
      getTargetProfileTool({}),
    ])

    for (const result of results) {
      expect(typeof result).toBe('string')
      // Every empty/boundary message names the resolved season somewhere.
      expect(result).toMatch(/2026/)
    }
  })
})
