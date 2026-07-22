/**
 * Unit tests for the four phase-3 MCP tools (get_player_leaders,
 * compare_players, get_conference_comparison, get_coaching_history) in
 * src/lib/mcp/tools.ts, with the query layer mocked out.
 *
 * getWepaLeaders/getUsageLeaders/getCoachingHistory (src/lib/queries/
 * players.ts, src/lib/queries/coaches.ts) collapse "no row"/"query error"
 * into [], and getPlayerComparison collapses both into null (see each fn's
 * own doc comment) -- so, following predictions-tools.test.ts's and
 * phase2-tools.test.ts's precedent, there is no separate error-string branch
 * to exercise for these tools: the never-throw contract is verified by
 * confirming a null/empty query result always resolves to a friendly string,
 * never a rejected promise.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/queries/players', () => ({
  getWepaLeaders: vi.fn(),
  getUsageLeaders: vi.fn(),
  getPlayerComparison: vi.fn(),
}))

vi.mock('@/lib/queries/conferences', () => ({
  getConferenceComparison: vi.fn(),
}))

vi.mock('@/lib/queries/coaches', () => ({
  getCoachingHistory: vi.fn(),
}))

import { getWepaLeaders, getUsageLeaders, getPlayerComparison } from '@/lib/queries/players'
import { getConferenceComparison } from '@/lib/queries/conferences'
import { getCoachingHistory } from '@/lib/queries/coaches'
import {
  getPlayerLeadersTool,
  comparePlayersTool,
  getConferenceComparisonTool,
  getCoachingHistoryTool,
} from '../tools'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getPlayerLeadersTool', () => {
  it('routes type=wepa to getWepaLeaders with source api.player_wepa_leaders, defaulting season', async () => {
    const rows = [{ athlete_name: 'Caleb Williams', category: 'passing', season_rank: 1 }]
    vi.mocked(getWepaLeaders).mockResolvedValue(rows as never)

    const parsed = JSON.parse(await getPlayerLeadersTool({ type: 'wepa' }))

    expect(parsed).toEqual({ _source: 'api.player_wepa_leaders', count: 1, rows })
    expect(getWepaLeaders).toHaveBeenCalledWith(2025, undefined, 25)
    expect(getUsageLeaders).not.toHaveBeenCalled()
  })

  it('forwards an explicit season, category, and limit for type=wepa', async () => {
    vi.mocked(getWepaLeaders).mockResolvedValue([])

    await getPlayerLeadersTool({ type: 'wepa', season: 2019, category: 'rushing', limit: 10 })

    expect(getWepaLeaders).toHaveBeenCalledWith(2019, 'rushing', 10)
  })

  it('clamps limit to the 100-row max even if a caller passes more', async () => {
    vi.mocked(getWepaLeaders).mockResolvedValue([])

    await getPlayerLeadersTool({ type: 'wepa', limit: 500 })

    expect(getWepaLeaders).toHaveBeenCalledWith(2025, undefined, 100)
  })

  it('routes type=usage to getUsageLeaders with source api.player_usage_leaders, ignoring category', async () => {
    const rows = [{ player_name: 'Bijan Robinson', usage_overall: 0.42 }]
    vi.mocked(getUsageLeaders).mockResolvedValue(rows as never)

    const parsed = JSON.parse(await getPlayerLeadersTool({ type: 'usage', category: 'rushing' }))

    expect(parsed).toEqual({ _source: 'api.player_usage_leaders', count: 1, rows })
    expect(getUsageLeaders).toHaveBeenCalledWith(2025, 25)
    expect(getWepaLeaders).not.toHaveBeenCalled()
  })

  it('returns a friendly "No wepa leaders found" string mentioning category when empty', async () => {
    vi.mocked(getWepaLeaders).mockResolvedValue([])

    const text = await getPlayerLeadersTool({ type: 'wepa', season: 2010, category: 'kicking' })

    expect(text).toMatch(/^No wepa leaders found for season=2010, category=kicking/)
  })

  it('returns a friendly "No usage leaders found" string when empty', async () => {
    vi.mocked(getUsageLeaders).mockResolvedValue([])

    const text = await getPlayerLeadersTool({ type: 'usage', season: 2010 })

    expect(text).toMatch(/^No usage leaders found for season=2010/)
  })

  it('never throws: an empty result resolves to a string, not a rejection', async () => {
    vi.mocked(getWepaLeaders).mockResolvedValue([])

    await expect(getPlayerLeadersTool({ type: 'wepa' })).resolves.toEqual(expect.any(String))
  })
})

describe('comparePlayersTool', () => {
  it('fetches both players in parallel and returns a {player1, player2} envelope', async () => {
    const player1 = { player_id: '1', name: 'Caleb Williams', season: 2024 }
    const player2 = { player_id: '2', name: 'Drake Maye', season: 2024 }
    vi.mocked(getPlayerComparison).mockImplementation(async (id: string) =>
      (id === '1' ? player1 : player2) as never
    )

    const parsed = JSON.parse(await comparePlayersTool({ player_id_1: 1, player_id_2: 2, season: 2024 }))

    expect(parsed).toEqual({ player1, player2 })
    expect(getPlayerComparison).toHaveBeenCalledWith('1', 2024)
    expect(getPlayerComparison).toHaveBeenCalledWith('2', 2024)
  })

  it('forwards player ids as strings and omits season when not provided', async () => {
    vi.mocked(getPlayerComparison).mockResolvedValue(null)

    await comparePlayersTool({ player_id_1: 111, player_id_2: 222 })

    expect(getPlayerComparison).toHaveBeenCalledWith('111', undefined)
    expect(getPlayerComparison).toHaveBeenCalledWith('222', undefined)
  })

  it('returns a friendly string naming the player_id when only one side has no data', async () => {
    vi.mocked(getPlayerComparison).mockImplementation(async (id: string) =>
      (id === '1' ? { player_id: '1', name: 'X' } : null) as never
    )

    const text = await comparePlayersTool({ player_id_1: 1, player_id_2: 999999 })

    expect(text).toMatch(/^No comparison data found for player_id 999999/)
  })

  it('returns a friendly string naming both player_ids when neither has data', async () => {
    vi.mocked(getPlayerComparison).mockResolvedValue(null)

    const text = await comparePlayersTool({ player_id_1: 111, player_id_2: 222, season: 2010 })

    expect(text).toMatch(/^No comparison data found for player_id 111 and 222 in season=2010/)
  })

  it('never throws: a null result resolves to a string, not a rejection', async () => {
    vi.mocked(getPlayerComparison).mockResolvedValue(null)

    await expect(comparePlayersTool({ player_id_1: 1, player_id_2: 2 })).resolves.toEqual(expect.any(String))
  })
})

describe('getConferenceComparisonTool', () => {
  it('wraps rows under api.conference_comparison with the resolved season, defaulting to CURRENT_SEASON', async () => {
    const rows = [{ conference: 'SEC', season: 2025, member_count: 16, avg_sp_rating: 12.3 }]
    vi.mocked(getConferenceComparison).mockResolvedValue(rows as never)

    const parsed = JSON.parse(await getConferenceComparisonTool({}))

    expect(parsed).toEqual({ season: 2025, _source: 'api.conference_comparison', count: 1, rows })
    expect(getConferenceComparison).toHaveBeenCalledWith(2025)
    expect(getConferenceComparison).toHaveBeenCalledTimes(1)
  })

  it('forwards an explicit season instead of the default', async () => {
    vi.mocked(getConferenceComparison).mockResolvedValue([{ conference: 'Big Ten', season: 2019 }] as never)

    await getConferenceComparisonTool({ season: 2019 })

    expect(getConferenceComparison).toHaveBeenCalledWith(2019)
  })

  it('retries season-1 when the requested season is empty, and reports the fallback season', async () => {
    vi.mocked(getConferenceComparison).mockImplementation(async (season: number) =>
      (season === 2025 ? [] : [{ conference: 'SEC', season: 2024 }]) as never
    )

    const parsed = JSON.parse(await getConferenceComparisonTool({ season: 2025 }))

    expect(getConferenceComparison).toHaveBeenNthCalledWith(1, 2025)
    expect(getConferenceComparison).toHaveBeenNthCalledWith(2, 2024)
    expect(parsed.season).toBe(2024)
    expect(parsed.rows).toEqual([{ conference: 'SEC', season: 2024 }])
  })

  it('returns a friendly "No conference comparison data found" string when both seasons are empty', async () => {
    vi.mocked(getConferenceComparison).mockResolvedValue([])

    const text = await getConferenceComparisonTool({ season: 1899 })

    expect(text).toBe('No conference comparison data found for season=1899 or the prior season.')
  })

  it('never throws: an empty result resolves to a string, not a rejection', async () => {
    vi.mocked(getConferenceComparison).mockResolvedValue([])

    await expect(getConferenceComparisonTool({})).resolves.toEqual(expect.any(String))
  })
})

describe('getCoachingHistoryTool', () => {
  it('wraps rows under api.coaching_history', async () => {
    const rows = [{ first_name: 'Nick', last_name: 'Saban', team: 'Alabama', tenure_start: 2007, tenure_end: 2023 }]
    vi.mocked(getCoachingHistory).mockResolvedValue(rows as never)

    const parsed = JSON.parse(await getCoachingHistoryTool({ first_name: 'Nick', last_name: 'Saban' }))

    expect(parsed).toEqual({ _source: 'api.coaching_history', count: 1, rows })
    expect(getCoachingHistory).toHaveBeenCalledWith('Nick', 'Saban')
  })

  it('returns a friendly "No coaching history found" string when empty', async () => {
    vi.mocked(getCoachingHistory).mockResolvedValue([])

    const text = await getCoachingHistoryTool({ first_name: 'Nobody', last_name: 'Coach' })

    expect(text).toMatch(/^No coaching history found for 'Nobody Coach'/)
  })

  it('never throws: an empty result resolves to a string, not a rejection', async () => {
    vi.mocked(getCoachingHistory).mockResolvedValue([])

    await expect(getCoachingHistoryTool({ first_name: 'Nobody', last_name: 'Coach' })).resolves.toEqual(
      expect.any(String)
    )
  })
})
