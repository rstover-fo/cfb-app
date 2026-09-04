/**
 * Unit tests for the get_rushing_charting MCP tool in src/lib/mcp/tools.ts,
 * with the query layer mocked.
 *
 * The property worth pinning: unlike passing charting, rate metrics here are
 * averaged over EVERY carry, so min_attempts is a sample-size floor, not a
 * coverage floor -- the empty-result message must not borrow passing's
 * "only ~407 have anything charted" framing or use the word "charted" in its
 * causal clause, because that would misrepresent what the floor is for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/queries/rushing-charting', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries/rushing-charting')>(
    '@/lib/queries/rushing-charting'
  )
  return {
    ...actual,
    queryRushingChartingPlayers: vi.fn(),
  }
})

import { queryRushingChartingPlayers, DEFAULT_MIN_ATTEMPTS } from '@/lib/queries/rushing-charting'
import {
  getRushingChartingTool,
  getRushingChartingDescription,
  runSqlDescription,
  searchPlayersDescription,
} from '../tools'

const HAMPTON = {
  season: 2025,
  player_id: '5083568',
  player: 'Jonah Coleman',
  team: 'Washington',
  conference: 'Big Ten',
  position: 'RB',
  attempts: 180,
  rushing_yards_available: 180,
  direction_eligible_attempts: 117,
  direction_available_attempts: 26,
  total_rushing_yards: 950,
  yards_per_carry: 5.3,
  success_rate: 0.51,
  ppa: 0.12,
  total_ppa: 21.6,
  stuff_rate: 0.14,
  power_success: 0.72,
  explosiveness: 1.4,
  line_yards: 2.8,
  line_yards_total: 504,
  second_level_yards: 1.1,
  second_level_yards_total: 198,
  open_field_yards: 0.9,
  open_field_yards_total: 162,
  direction_coverage_pct: 0.222,
}

const mockQuery = vi.mocked(queryRushingChartingPlayers)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('get_rushing_charting', () => {
  it('returns the envelope with min_attempts, position, and a coverage_note', async () => {
    mockQuery.mockResolvedValue({ rows: [HAMPTON], error: null })
    const out = JSON.parse(await getRushingChartingTool({}))

    expect(out._source).toBe('api.rushing_charting_player_season')
    expect(out.count).toBe(1)
    expect(out.min_attempts).toBe(DEFAULT_MIN_ATTEMPTS)
    expect(out.position).toBe('RB')
    expect(out.coverage_note).toMatch(/every carry/)
    expect(out.coverage_note).toMatch(/direction_coverage_pct/)
  })

  it('echoes the ENFORCED floor, not the requested one', async () => {
    mockQuery.mockResolvedValue({ rows: [HAMPTON], error: null })
    const zeroed = JSON.parse(await getRushingChartingTool({ min_attempts: 0 }))
    expect(zeroed.min_attempts).toBe(DEFAULT_MIN_ATTEMPTS)

    const explicit = JSON.parse(await getRushingChartingTool({ min_attempts: 20 }))
    expect(explicit.min_attempts).toBe(20)
  })

  it("echoes position 'ALL' and passes the raw arg through to the query layer", async () => {
    mockQuery.mockResolvedValue({ rows: [HAMPTON], error: null })
    const out = JSON.parse(await getRushingChartingTool({ position: 'all' }))
    expect(out.position).toBe('ALL')
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ position: 'all' }))
  })

  it('passes filters through to the query layer', async () => {
    mockQuery.mockResolvedValue({ rows: [HAMPTON], error: null })
    await getRushingChartingTool({
      season: 2025,
      team: 'Washington',
      conference: 'Big Ten',
      position: 'RB',
      sort: 'ypc',
      min_attempts: 30,
      limit: 10,
    })
    expect(mockQuery).toHaveBeenCalledWith({
      season: 2025,
      team: 'Washington',
      conference: 'Big Ten',
      position: 'RB',
      minAttempts: 30,
      sort: 'ypc',
      limit: 10,
    })
  })

  it('refuses a pre-2025 season as a coverage boundary, not an empty result', async () => {
    const out = await getRushingChartingTool({ season: 2024 })
    expect(out).toMatch(/starts in 2025/)
    expect(out).toMatch(/coverage boundary/)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('explains an empty result by naming the floor, position, and season -- never using "charted"', async () => {
    mockQuery.mockResolvedValue({ rows: [], error: null })
    const out = await getRushingChartingTool({ team: 'Kent State', min_attempts: 40 })
    expect(out).toMatch(/40/)
    expect(out).toMatch(/RB/)
    expect(out).toMatch(/2025/)
    expect(out).toMatch(/carries/)
    expect(out).not.toMatch(/charted/)
  })

  it("says 'No rushers' (not 'No ALL rushers') when position is 'all', and never uses \"charted\"", async () => {
    mockQuery.mockResolvedValue({ rows: [], error: null })
    const out = await getRushingChartingTool({ position: 'all', min_attempts: 40 })
    expect(out).toMatch(/No rushers/)
    expect(out).not.toMatch(/ALL rushers/)
    expect(out).not.toMatch(/charted/)
  })

  it('echoes the applied team and states the exact-match rule', async () => {
    mockQuery.mockResolvedValue({ rows: [], error: null })
    const out = await getRushingChartingTool({ team: 'Ohio St' })
    expect(out).toContain('Ohio St')
    expect(out).toMatch(/exact/i)
  })

  it('omits the "Lower min_attempts" clause when the floor is already 1', async () => {
    mockQuery.mockResolvedValue({ rows: [], error: null })
    const out = await getRushingChartingTool({ min_attempts: 1 })
    expect(out).not.toMatch(/Lower min_attempts/)
  })

  it('passes a query-layer error string through unchanged (never throws)', async () => {
    mockQuery.mockResolvedValue({ rows: [], error: 'Error: api.rushing_charting_player_season request failed: boom' })
    await expect(getRushingChartingTool({})).resolves.toBe(
      'Error: api.rushing_charting_player_season request failed: boom'
    )
  })

  it('renders a null ppa as null in the JSON output (never coerced to 0)', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ...HAMPTON, ppa: null }], error: null })
    const out = JSON.parse(await getRushingChartingTool({}))
    expect(out.rows[0].ppa).toBeNull()
  })
})

describe('getRushingChartingDescription', () => {
  it('states the six R9 claims in order', () => {
    const desc = getRushingChartingDescription
    const everyCarryIdx = desc.indexOf('every carry')
    const rbIdx = desc.indexOf('RB')
    const fortyIdx = desc.indexOf('40%')
    const nullIdx = desc.indexOf('NULL')
    const reconcileIdx = desc.indexOf('reconcile')
    const repullIdx = desc.indexOf('re-pull')

    expect(everyCarryIdx).toBeGreaterThan(-1)
    expect(rbIdx).toBeGreaterThan(-1)
    expect(fortyIdx).toBeGreaterThan(-1)
    expect(nullIdx).toBeGreaterThan(-1)
    expect(reconcileIdx).toBeGreaterThan(-1)
    expect(repullIdx).toBeGreaterThan(-1)

    expect(everyCarryIdx).toBeLessThan(rbIdx)
    expect(rbIdx).toBeLessThan(fortyIdx)
    expect(fortyIdx).toBeLessThan(nullIdx)
    expect(nullIdx).toBeLessThan(reconcileIdx)
    expect(reconcileIdx).toBeLessThan(repullIdx)
  })
})

describe('run_sql schema card and search_players description', () => {
  it('lists all three rushing views with the direction denominators and the roster join', () => {
    expect(runSqlDescription).toContain('api.rushing_charting_player_season')
    expect(runSqlDescription).toContain('api.rushing_charting_team_season')
    expect(runSqlDescription).toContain('api.rushing_charting_direction_season')
    expect(runSqlDescription).toContain('direction_available_attempts')
    // The direction-view entry owns the unknown-share rule.
    expect(runSqlDescription).toMatch(/never divide unknown by available/)
    // The 2026 roster note and the returning-player join on id, not name.
    expect(runSqlDescription).toMatch(/r\.id = p\.player_id AND r\.team = p\.team AND r\.year = 2026/)
  })

  it('names the rushing_charting block, its directions keys, the share rule, and the NULL case', () => {
    expect(searchPlayersDescription).toContain('rushing_charting')
    expect(searchPlayersDescription).toMatch(/left\/middle\/right\/unknown/)
    expect(searchPlayersDescription).toContain('direction_available_attempts')
    expect(searchPlayersDescription).toMatch(/rushing_charting is NULL/)
    expect(searchPlayersDescription).toMatch(/never zero carries/)
  })
})
