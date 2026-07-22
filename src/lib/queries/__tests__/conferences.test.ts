/**
 * Unit tests for src/lib/queries/conferences.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getConferenceComparison, getConferenceHeadToHead } from '../conferences'
import { createSupabaseMock, dbError, ok, type SupabaseMockConfig } from './helpers'
import {
  createConferenceComparisonRows,
  createConferenceHeadToHeadRow,
  createConferenceHeadToHeadRows,
} from './fixtures/conferences'

function mockClient(config: SupabaseMockConfig) {
  vi.mocked(createClient).mockResolvedValue(
    createSupabaseMock(config) as unknown as Awaited<ReturnType<typeof createClient>>
  )
}

describe('getConferenceComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns conference aggregate rows for a season, pre-sorted strongest-first', async () => {
    mockClient({ apiTables: { conference_comparison: ok(createConferenceComparisonRows()) } })

    const result = await getConferenceComparison(2025)

    expect(result).toHaveLength(3)
    expect(result.map(r => r.conference)).toEqual(['SEC', 'Big Ten', 'Big 12'])
    expect(result[0].avg_sp_rating).toBe(15.2)
    expect(result[0].member_count).toBe(16)
    expect(result[0].non_conf_win_pct).toBe(0.712)
  })

  it('returns [] on empty data (season has no computed aggregates yet -- not an error)', async () => {
    mockClient({ apiTables: { conference_comparison: ok([]) } })

    expect(await getConferenceComparison(2026)).toEqual([])
  })

  it('returns [] (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { conference_comparison: dbError() } })

    expect(await getConferenceComparison(2025)).toEqual([])
  })
})

describe('getConferenceHeadToHead', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns season-by-season H2H rows oriented to the caller order', async () => {
    mockClient({ rpc: { get_conference_head_to_head: ok(createConferenceHeadToHeadRows()) } })

    const result = await getConferenceHeadToHead('SEC', 'Big Ten', 2015, 2025)

    expect(result).toHaveLength(3)
    expect(result[0].season).toBe(2025)
    expect(result[0].conf1_wins).toBe(2)
    expect(result[0].conf2_wins).toBe(1)
  })

  it('passes p_conf1/p_conf2/p_season_start/p_season_end args through to the RPC', async () => {
    const supabase = createSupabaseMock({ rpc: { get_conference_head_to_head: ok(createConferenceHeadToHeadRows()) } })
    vi.mocked(createClient).mockResolvedValue(supabase as unknown as Awaited<ReturnType<typeof createClient>>)

    await getConferenceHeadToHead('SEC', 'Big Ten', 2015, 2025)

    expect(supabase.rpc).toHaveBeenCalledWith('get_conference_head_to_head', {
      p_conf1: 'SEC',
      p_conf2: 'Big Ten',
      p_season_start: 2015,
      p_season_end: 2025,
    })
  })

  it('defaults season_start/season_end to null when omitted (RPC returns every season on record)', async () => {
    const supabase = createSupabaseMock({ rpc: { get_conference_head_to_head: ok([createConferenceHeadToHeadRow()]) } })
    vi.mocked(createClient).mockResolvedValue(supabase as unknown as Awaited<ReturnType<typeof createClient>>)

    await getConferenceHeadToHead('SEC', 'Big Ten')

    expect(supabase.rpc).toHaveBeenCalledWith('get_conference_head_to_head', {
      p_conf1: 'SEC',
      p_conf2: 'Big Ten',
      p_season_start: null,
      p_season_end: null,
    })
  })

  it('returns [] when the two conferences never played in range (not an error)', async () => {
    mockClient({ rpc: { get_conference_head_to_head: ok([]) } })

    expect(await getConferenceHeadToHead('Sun Belt', 'MAC', 2024, 2025)).toEqual([])
  })

  it('returns [] (not a throw) on PostgREST error', async () => {
    mockClient({ rpc: { get_conference_head_to_head: dbError() } })

    expect(await getConferenceHeadToHead('SEC', 'Big Ten')).toEqual([])
  })
})
