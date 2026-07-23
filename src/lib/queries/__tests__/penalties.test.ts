/**
 * Unit tests for the penalty-analytics query layer (src/lib/queries/penalties.ts).
 * These functions back the get_penalty_profile / get_penalty_log MCP tools and
 * keep mcp.ts's contract: raw view rows, friendly "Error: ..." strings on
 * failure (never a throw), and hard row caps.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createSupabaseMock, dbError, ok, type SupabaseMockConfig } from './helpers'
import { DEFAULT_ROW_CAP } from '../mcp'
import {
  PENALTY_AGG_ROW_CAP,
  queryTeamPenaltyGames,
  queryTeamSeasonPenaltyPlays,
  queryPenaltyLog,
} from '../penalties'

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

describe('queryTeamPenaltyGames', () => {
  it('returns rows on success and filters on team + season', async () => {
    const mock = mockClient({
      apiTables: { team_penalties: ok([{ game_id: 1, team: 'Oklahoma', penalties: 7, penalty_yards: 60 }]) },
    })
    const result = await queryTeamPenaltyGames('Oklahoma', 2025)

    expect(result.error).toBeNull()
    expect(result.rows).toEqual([{ game_id: 1, team: 'Oklahoma', penalties: 7, penalty_yards: 60 }])
    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('team', 'Oklahoma')
    expect(chain.eq).toHaveBeenCalledWith('season', 2025)
  })

  it('returns [] with no error when the team-season has no rows', async () => {
    mockClient({ apiTables: { team_penalties: ok([]) } })
    const result = await queryTeamPenaltyGames('Nobody State', 2025)
    expect(result).toEqual({ rows: [], error: null })
  })

  it('returns a friendly "Error: ..." string (never throws) on PostgREST error', async () => {
    mockClient({ apiTables: { team_penalties: dbError('connection refused') } })
    const result = await queryTeamPenaltyGames('Oklahoma', 2025)
    expect(result.rows).toEqual([])
    expect(result.error).toMatch(/^Error: api\.team_penalties request failed: connection refused$/)
  })
})

describe('queryTeamSeasonPenaltyPlays', () => {
  it("filters on penalized_team for side='committed'", async () => {
    const mock = mockClient({ apiTables: { penalty_log: ok([{ infraction: 'Holding' }]) } })
    const result = await queryTeamSeasonPenaltyPlays('Oklahoma', 2025, 'committed')

    expect(result.error).toBeNull()
    expect(result.rows).toHaveLength(1)
    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('penalized_team', 'Oklahoma')
    expect(chain.eq).toHaveBeenCalledWith('season', 2025)
  })

  it("filters on benefiting_team for side='drawn'", async () => {
    const mock = mockClient({ apiTables: { penalty_log: ok([]) } })
    await queryTeamSeasonPenaltyPlays('Oklahoma', 2025, 'drawn')

    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('benefiting_team', 'Oklahoma')
    expect(chain.eq).not.toHaveBeenCalledWith('penalized_team', 'Oklahoma')
  })

  it('fetches up to the internal aggregation cap, not DEFAULT_ROW_CAP', async () => {
    const mock = mockClient({ apiTables: { penalty_log: ok([]) } })
    await queryTeamSeasonPenaltyPlays('Oklahoma', 2025, 'committed')

    expect(PENALTY_AGG_ROW_CAP).toBeGreaterThan(DEFAULT_ROW_CAP)
    expect(apiChain(mock).limit).toHaveBeenCalledWith(PENALTY_AGG_ROW_CAP)
  })

  it('propagates a friendly error string naming api.penalty_log on failure', async () => {
    mockClient({ apiTables: { penalty_log: dbError('timeout') } })
    const result = await queryTeamSeasonPenaltyPlays('Oklahoma', 2025, 'committed')
    expect(result.rows).toEqual([])
    expect(result.error).toMatch(/^Error: api\.penalty_log request failed: timeout$/)
  })
})

describe('queryPenaltyLog', () => {
  it('returns rows on success', async () => {
    mockClient({ apiTables: { penalty_log: ok([{ play_id: 'p1', infraction: 'Targeting' }]) } })
    const result = await queryPenaltyLog({ season: 2024, infraction: 'Targeting' })
    expect(result.error).toBeNull()
    expect(result.rows).toEqual([{ play_id: 'p1', infraction: 'Targeting' }])
  })

  it('applies only the provided filters', async () => {
    const mock = mockClient({ apiTables: { penalty_log: ok([]) } })
    await queryPenaltyLog({ team: 'Oklahoma', gameId: 401752792 })

    const chain = apiChain(mock)
    expect(chain.eq).toHaveBeenCalledWith('penalized_team', 'Oklahoma')
    expect(chain.eq).toHaveBeenCalledWith('game_id', 401752792)
    expect(chain.eq).not.toHaveBeenCalledWith('season', expect.anything())
    expect(chain.eq).not.toHaveBeenCalledWith('week', expect.anything())
    expect(chain.eq).not.toHaveBeenCalledWith('infraction', expect.anything())
  })

  it('sorts postseason before regular within a season so bowl penalties survive the row cap', async () => {
    const mock = mockClient({ apiTables: { penalty_log: ok([]) } })
    await queryPenaltyLog({ team: 'Oklahoma', season: 2024 })

    const chain = apiChain(mock)
    const orderCalls = chain.order.mock.calls
    expect(orderCalls).toEqual([
      ['season', { ascending: false }],
      // 'postseason' < 'regular', so ascending puts the newest games first
      // despite postseason week numbers restarting at 1.
      ['season_type', { ascending: true }],
      ['week', { ascending: false }],
      ['game_id', { ascending: true }],
      ['period', { ascending: true }],
    ])
  })

  it('defaults the limit to 50 and clamps caller limits at DEFAULT_ROW_CAP', async () => {
    const first = mockClient({ apiTables: { penalty_log: ok([]) } })
    await queryPenaltyLog({ season: 2024 })
    expect(apiChain(first).limit).toHaveBeenCalledWith(50)

    const second = mockClient({ apiTables: { penalty_log: ok([]) } })
    await queryPenaltyLog({ season: 2024, limit: 500 })
    expect(apiChain(second).limit).toHaveBeenCalledWith(DEFAULT_ROW_CAP)
  })

  it('returns [] with no error when nothing matches', async () => {
    mockClient({ apiTables: { penalty_log: ok([]) } })
    const result = await queryPenaltyLog({ season: 1899 })
    expect(result).toEqual({ rows: [], error: null })
  })

  it('propagates a friendly error string on failure', async () => {
    mockClient({ apiTables: { penalty_log: dbError('bad request') } })
    const result = await queryPenaltyLog({ season: 2024 })
    expect(result.error).toMatch(/^Error: api\.penalty_log request failed: bad request$/)
  })
})
