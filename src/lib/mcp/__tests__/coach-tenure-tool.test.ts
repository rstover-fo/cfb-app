/**
 * Unit tests for get_coach_tenure (src/lib/mcp/tools.ts) over
 * api.coach_tenures, with the query layer mocked.
 *
 * The behaviour worth pinning is the precondition (an unfiltered tenure list
 * is meaningless) and the field semantics the tool must not flatten: a NULL
 * tenure_end means ACTIVE, not unknown, and a NULL hire_date means
 * unrecorded, not "never hired". Those two NULLs mean opposite things on the
 * same row, which is exactly the kind of thing a summarising model gets wrong.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/queries/coach-tenures', () => ({
  queryCoachTenures: vi.fn(),
}))

import { queryCoachTenures } from '@/lib/queries/coach-tenures'
import { getCoachTenureTool } from '../tools'

const VENABLES = {
  coach_id: '4033',
  coach_name: 'Brent Venables',
  team_id: 201,
  team: 'Oklahoma',
  tenure_start: 2022,
  tenure_end: null,
  hire_date: '2021-12-05',
  is_interim: false,
  record_games: 48,
  record_wins: 29,
  record_losses: 19,
  record_ties: 0,
  record_win_percentage: 0.604,
  classification: 'fbs',
}

const INTERIM = {
  ...VENABLES,
  coach_id: '9001',
  coach_name: 'Someone Interim',
  tenure_start: 2019,
  tenure_end: 2019,
  hire_date: null,
  is_interim: true,
  record_games: 3,
  record_wins: 1,
  record_losses: 2,
  record_win_percentage: 0.333,
}

const mockTenures = vi.mocked(queryCoachTenures)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('get_coach_tenure', () => {
  it('requires at least one selective filter', async () => {
    const out = await getCoachTenureTool({})
    expect(out).toMatch(/at least one of coach, team, season, or active_only/)
    expect(mockTenures).not.toHaveBeenCalled()
  })

  it('accepts active_only alone as sufficiently selective', async () => {
    mockTenures.mockResolvedValue({ rows: [VENABLES], error: null })
    const out = JSON.parse(await getCoachTenureTool({ active_only: true }))
    expect(out._source).toBe('api.coach_tenures')
    expect(out.rows).toHaveLength(1)
  })

  it('preserves a NULL tenure_end rather than coercing it', async () => {
    mockTenures.mockResolvedValue({ rows: [VENABLES], error: null })
    const out = JSON.parse(await getCoachTenureTool({ team: 'Oklahoma' }))
    // NULL here means the tenure is ACTIVE. Anything that turned it into 0 or
    // a year would invert the meaning.
    expect(out.rows[0].tenure_end).toBeNull()
    expect(out.rows[0].coach_id).toBe('4033')
  })

  it('preserves a NULL hire_date, which means unrecorded rather than active', async () => {
    mockTenures.mockResolvedValue({ rows: [INTERIM], error: null })
    const out = JSON.parse(await getCoachTenureTool({ team: 'Oklahoma' }))
    expect(out.rows[0].hire_date).toBeNull()
    // Same row carries a non-null tenure_end, so the two NULLs are not
    // interchangeable and the payload must keep them distinct.
    expect(out.rows[0].tenure_end).toBe(2019)
    expect(out.rows[0].is_interim).toBe(true)
  })

  it('maps snake_case tool args onto the query layer camelCase filter', async () => {
    mockTenures.mockResolvedValue({ rows: [VENABLES], error: null })
    await getCoachTenureTool({
      coach: 'Venables',
      team: 'Oklahoma',
      season: 2024,
      active_only: true,
      exclude_interim: true,
      classification: 'fbs',
      limit: 10,
    })
    expect(mockTenures).toHaveBeenCalledWith({
      coach: 'Venables',
      team: 'Oklahoma',
      season: 2024,
      activeOnly: true,
      excludeInterim: true,
      classification: 'fbs',
      limit: 10,
    })
  })

  it('explains an empty result in terms of how the filters match', async () => {
    mockTenures.mockResolvedValue({ rows: [], error: null })
    const out = await getCoachTenureTool({ coach: 'Nobody' })
    expect(out).toMatch(/substring/)
  })

  it('passes a query-layer error string through unchanged (never throws)', async () => {
    mockTenures.mockResolvedValue({ rows: [], error: 'Error: api.coach_tenures request failed: boom' })
    await expect(getCoachTenureTool({ team: 'Oklahoma' })).resolves.toBe(
      'Error: api.coach_tenures request failed: boom'
    )
  })
})
