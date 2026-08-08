/**
 * Unit tests for the get_expected_points MCP tool (tool 25 in
 * src/lib/mcp/tools.ts). Mocks the query module, not Supabase: the query
 * layer's own behavior is covered by
 * src/lib/queries/__tests__/expected-points.test.ts, and mocking at the
 * module seam keeps the real era/zone helpers and constants live.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/queries/expected-points', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/queries/expected-points')>()
  return { ...actual, queryExpectedPoints: vi.fn() }
})

import { queryExpectedPoints, type ExpectedPointsRow } from '@/lib/queries/expected-points'
import { getExpectedPointsTool } from '../tools'

/**
 * Row factory seeded with the real 2021+-era 1st-and-10-from-own-25 cell
 * (d1|standard|z8), live-verified against api.expected_points on 2026-08-08 --
 * the modal state of college football, 77,045 observed plays.
 */
function row(overrides: Partial<ExpectedPointsRow> = {}): ExpectedPointsRow {
  return {
    era: '2021+',
    state: 'd1|standard|z8',
    down: 1,
    distance_bucket: 'standard',
    field_zone: 8,
    yards_to_goal_min: 71,
    yards_to_goal_max: 80,
    n_obs: 77045,
    ep_drive: 1.7961,
    ep_net: 0.8962,
    p_td: 0.2379,
    p_fg: 0.0761,
    p_punt: 0.4149,
    p_turnover: 0.1176,
    se_boot: 0.01005,
    computed_at: '2026-08-08T14:08:10.564225+00:00',
    ...overrides,
  }
}

/**
 * The real 2021+-era 4th-and-short-from-own-25 cell (d4|short|z8), same
 * live verification -- a go-for-it-conditional row with negative ep_net.
 */
function downFourRow(overrides: Partial<ExpectedPointsRow> = {}): ExpectedPointsRow {
  return row({
    state: 'd4|short|z8',
    down: 4,
    distance_bucket: 'short',
    n_obs: 336,
    ep_drive: 1.5303,
    ep_net: -0.2175,
    p_td: 0.2038,
    p_fg: 0.0625,
    p_punt: 0.2179,
    p_turnover: 0.0885,
    se_boot: 0.06439,
    ...overrides,
  })
}

function mockRows(rows: ExpectedPointsRow[]) {
  vi.mocked(queryExpectedPoints).mockResolvedValue({ rows, error: null })
}

/**
 * A flat down-1 EP curve for the punt side of fourth_down_decision: one row
 * per opponent starting zone ('goal' for zone 1, where 1st-and-10 cannot
 * exist, 'standard' elsewhere), every ep_net the same so the distribution
 * arithmetic is hand-checkable.
 */
function downOneCurve(epNet: number): ExpectedPointsRow[] {
  return Array.from({ length: 10 }, (_, i) => {
    const zone = i + 1
    const bucket = zone === 1 ? 'goal' : 'standard'
    return row({
      state: `d1|${bucket}|z${zone}`,
      down: 1,
      distance_bucket: bucket,
      field_zone: zone,
      ep_net: epNet,
    })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getExpectedPointsTool', () => {
  it('defaults to the current era and says so via era_source', async () => {
    mockRows([row()])
    const payload = JSON.parse(await getExpectedPointsTool({}))

    expect(payload.era).toBe('2021+')
    expect(payload.era_source).toBe('current_era')
    expect(payload).not.toHaveProperty('season')
    expect(vi.mocked(queryExpectedPoints)).toHaveBeenCalledWith(
      expect.objectContaining({ era: '2021+' })
    )
  })

  it('resolves the era from a requested season and echoes both back', async () => {
    mockRows([row({ era: '2014-2020' })])
    const payload = JSON.parse(await getExpectedPointsTool({ season: 2015 }))

    expect(payload.era).toBe('2014-2020')
    expect(payload.era_source).toBe('requested_season')
    expect(payload.season).toBe(2015)
    expect(vi.mocked(queryExpectedPoints)).toHaveBeenCalledWith(
      expect.objectContaining({ era: '2014-2020' })
    )
  })

  it('rejects a pre-coverage season with the valid range, without querying', async () => {
    const result = await getExpectedPointsTool({ season: 1999 })

    expect(result).toMatch(/No expected-points model covers season 1999/)
    expect(result).toMatch(/2004/)
    expect(vi.mocked(queryExpectedPoints)).not.toHaveBeenCalled()
  })

  it('maps yards_to_goal onto the field-position decile and reports the resolved zone', async () => {
    mockRows([row()])
    const payload = JSON.parse(await getExpectedPointsTool({ down: 1, yards_to_goal: 75 }))

    expect(payload.yards_to_goal).toBe(75)
    expect(payload.field_zone).toBe(8)
    expect(vi.mocked(queryExpectedPoints)).toHaveBeenCalledWith(
      expect.objectContaining({ down: 1, fieldZone: 8 })
    )
  })

  it('carries the basis block so answers can define ep_drive vs ep_net', async () => {
    mockRows([row()])
    const payload = JSON.parse(await getExpectedPointsTool({}))

    expect(payload.basis.model).toMatch(/house EP v1\.5/)
    expect(payload.basis.model).toMatch(/r = 0\.86/)
    expect(payload.basis.ep_drive).toMatch(/TD 6\.97/)
    expect(payload.basis.ep_net).toMatch(/net next-score/i)
    expect(payload.basis.ep_net).toMatch(/never clamp/i)
    expect(payload.basis.se_boot).toMatch(/2\*se_boot/)
  })

  it('maps down + distance onto the handoff bucket boundaries and reports the derivation', async () => {
    mockRows([row({ state: 'd3|long|z5', down: 3, distance_bucket: 'long', field_zone: 5 })])
    const payload = JSON.parse(await getExpectedPointsTool({ down: 3, distance: 7, yards_to_goal: 45 }))

    expect(payload.distance).toBe(7)
    expect(payload.distance_bucket).toBe('long')
    expect(payload.distance_bucket_source).toBe('derived_from_distance')
    expect(vi.mocked(queryExpectedPoints)).toHaveBeenCalledWith(
      expect.objectContaining({ down: 3, distanceBucket: 'long' })
    )
  })

  it('lets the numbers beat a contradictory explicit bucket, with a caveat saying so', async () => {
    // 3rd-and-7 maps to 'long'; an explicit 'short' contradicts the numbers
    // and must not silently rewrite the state (a contradictory 'goal' on a
    // 4th down would flip the go-vs-punt recommendation).
    mockRows([row({ state: 'd3|long|z5', down: 3, distance_bucket: 'long', field_zone: 5 })])
    const payload = JSON.parse(
      await getExpectedPointsTool({ down: 3, distance: 7, distance_bucket: 'short' })
    )

    expect(payload.distance_bucket).toBe('long')
    expect(payload.distance_bucket_source).toBe('derived_from_distance')
    expect(payload.caveats.join(' ')).toMatch(/contradicts down 3 and distance 7/)
    expect(payload.caveats.join(' ')).toMatch(/The numbers win/)
    expect(vi.mocked(queryExpectedPoints)).toHaveBeenCalledWith(
      expect.objectContaining({ distanceBucket: 'long' })
    )
  })

  it('respects an explicit bucket when nothing can check it, and ignores distance without down', async () => {
    mockRows([row()])
    const explicitOnly = JSON.parse(
      await getExpectedPointsTool({ down: 3, distance_bucket: 'short' })
    )
    expect(explicitOnly.distance_bucket).toBe('short')
    expect(explicitOnly.distance_bucket_source).toBe('requested')

    vi.clearAllMocks()
    mockRows([row()])
    // The boundaries are down-aware, so distance alone cannot pick a bucket.
    const unmapped = JSON.parse(await getExpectedPointsTool({ distance: 7 }))
    expect(unmapped).not.toHaveProperty('distance_bucket')
    expect(vi.mocked(queryExpectedPoints)).toHaveBeenCalledWith(
      expect.objectContaining({ distanceBucket: undefined })
    )
  })

  it('renders NULL ep_net as not-computed and NULL se_boot as no-interval, never as zero', async () => {
    mockRows([row({ ep_net: null }), row({ state: 'd2|short|z8', down: 2, distance_bucket: 'short', se_boot: null })])
    const payload = JSON.parse(await getExpectedPointsTool({}))
    const caveats = payload.caveats.join(' ')

    expect(caveats).toMatch(/NULL ep_net/)
    expect(caveats).toMatch(/not computed/)
    expect(caveats).toMatch(/NULL se_boot/)
    expect(caveats).toMatch(/interval unavailable/)

    mockRows([row()])
    const clean = JSON.parse(await getExpectedPointsTool({}))
    expect(clean.caveats.join(' ')).not.toMatch(/NULL ep_net|NULL se_boot/)
  })

  it('wraps rows in the standard envelope with the view as _source', async () => {
    mockRows([row()])
    const payload = JSON.parse(await getExpectedPointsTool({}))

    expect(payload._source).toBe('api.expected_points')
    expect(payload.count).toBe(1)
    expect(payload.rows[0].state).toBe('d1|standard|z8')
    expect(payload.rows[0].ep_drive).toBe(1.7961)
  })

  it('flags down=4 rows as go-for-it-conditional -- and only when present', async () => {
    mockRows([row(), downFourRow()])
    const withFourth = JSON.parse(await getExpectedPointsTool({}))
    expect(withFourth.caveats.join(' ')).toMatch(/GO-FOR-IT-CONDITIONAL/)

    mockRows([row()])
    const withoutFourth = JSON.parse(await getExpectedPointsTool({}))
    expect(withoutFourth.caveats.join(' ')).not.toMatch(/GO-FOR-IT-CONDITIONAL/)
  })

  it('flags sparse cells with the observed floor, never a well-observed result', async () => {
    // Real sparse cell shape: 1st-and-goal from the 31-40 decile exists in the
    // view with a single observed play.
    mockRows([row(), row({ state: 'd1|goal|z4', distance_bucket: 'goal', field_zone: 4, n_obs: 1 })])
    const sparse = JSON.parse(await getExpectedPointsTool({}))
    const sparseCaveat = sparse.caveats.join(' ')
    expect(sparseCaveat).toMatch(/fewer than 100/)
    expect(sparseCaveat).toMatch(/as few as 1\b/)

    mockRows([row(), downFourRow()])
    const dense = JSON.parse(await getExpectedPointsTool({}))
    expect(dense.caveats.join(' ')).not.toMatch(/fewer than 100/)
  })

  it('warns when the result fills the row limit exactly', async () => {
    mockRows([row(), downFourRow()])
    const payload = JSON.parse(await getExpectedPointsTool({ limit: 2 }))

    expect(payload.caveats.join(' ')).toMatch(/row limit/)
  })

  it('explains the per-down bucket vocabulary on an empty match instead of an empty envelope', async () => {
    mockRows([])
    const result = await getExpectedPointsTool({ down: 1, distance_bucket: 'med' })

    expect(typeof result).toBe('string')
    expect(result).toMatch(/No expected-points cell matches/)
    expect(result).toMatch(/down 1/)
    expect(result).toMatch(/'standard'/)
    expect(result).toMatch(/short\/med\/long\/xlong/)
  })

  it('attaches the go-vs-punt block with the distribution-weighted punt EP, not EP of the average spot', async () => {
    // 4th-and-2 at midfield (ytg 50, zone 5), 2021+: 7469 clean transfers,
    // 16 return TDs, 223 kicking-team recoveries = 7708 punts. On a flat 0.4
    // down-1 curve: EP(punt) = (7469*(-0.4) + 16*(-6.97) + 223*(0.4)) / 7708.
    vi.mocked(queryExpectedPoints)
      .mockResolvedValueOnce({
        rows: [downFourRow({ state: 'd4|short|z5', field_zone: 5, ep_net: -0.1 })],
        error: null,
      })
      .mockResolvedValueOnce({ rows: downOneCurve(0.4), error: null })
    const payload = JSON.parse(
      await getExpectedPointsTool({ down: 4, distance: 2, yards_to_goal: 50 })
    )

    const expectedEpPunt = (7469 * -0.4 + 16 * -6.97 + 223 * 0.4) / 7708
    const block = payload.fourth_down_decision
    expect(block.go.state).toBe('d4|short|z5')
    expect(block.go.ep_net).toBe(-0.1)
    expect(block.punt.ep_punt).toBeCloseTo(expectedEpPunt, 10)
    expect(block.punt.n_punts_basis).toBe(7708)
    expect(block.punt.p_return_td).toBeCloseTo(16 / 7708, 10)
    expect(block.punt.p_kick_team_keeps).toBeCloseTo(223 / 7708, 10)
    expect(block.ep_delta_go_minus_punt).toBeCloseTo(-0.1 - expectedEpPunt, 10)
    expect(block.assumptions.join(' ')).toMatch(/distribution-weighted/)
    expect(block.assumptions.join(' ')).toMatch(/FG option is NOT modeled/)
    // The punt side needs the whole down-1 curve, not one zone.
    expect(vi.mocked(queryExpectedPoints)).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ down: 1, limit: 50 })
    )
  })

  it('omits the block without a spot, and nudges for distance when only the bucket is missing', async () => {
    mockRows([downFourRow()])
    const noSpot = JSON.parse(await getExpectedPointsTool({ down: 4, distance: 2 }))
    expect(noSpot).not.toHaveProperty('fourth_down_decision')
    expect(vi.mocked(queryExpectedPoints)).toHaveBeenCalledTimes(1)

    vi.clearAllMocks()
    mockRows([downFourRow()])
    const noBucket = JSON.parse(await getExpectedPointsTool({ down: 4, yards_to_goal: 75 }))
    expect(noBucket).not.toHaveProperty('fourth_down_decision')
    expect(noBucket.caveats.join(' ')).toMatch(/Pass `distance`.*fourth_down_decision/)
  })

  it('skips the block with a caveat when a required ep_net is not computed', async () => {
    // NULL ep_net on the go side: the punt side is computable but the
    // comparison is not -- never substitute ep_drive or zero.
    vi.mocked(queryExpectedPoints)
      .mockResolvedValueOnce({
        rows: [downFourRow({ state: 'd4|short|z5', field_zone: 5, ep_net: null })],
        error: null,
      })
      .mockResolvedValueOnce({ rows: downOneCurve(0.4), error: null })
    const payload = JSON.parse(
      await getExpectedPointsTool({ down: 4, distance: 2, yards_to_goal: 50 })
    )
    expect(payload).not.toHaveProperty('fourth_down_decision')
    expect(payload.caveats.join(' ')).toMatch(/go-vs-punt comparison could not be computed/)

    vi.clearAllMocks()
    // A hole in the down-1 curve where the punt distribution carries weight
    // (zone 9 dropped) must also fail the punt side rather than zeroing it.
    vi.mocked(queryExpectedPoints)
      .mockResolvedValueOnce({
        rows: [downFourRow({ state: 'd4|short|z5', field_zone: 5, ep_net: -0.1 })],
        error: null,
      })
      .mockResolvedValueOnce({
        rows: downOneCurve(0.4).filter(r => r.field_zone !== 9),
        error: null,
      })
    const holed = JSON.parse(
      await getExpectedPointsTool({ down: 4, distance: 2, yards_to_goal: 50 })
    )
    expect(holed).not.toHaveProperty('fourth_down_decision')
    expect(holed.caveats.join(' ')).toMatch(/go-vs-punt comparison could not be computed/)
  })

  it('flags a punt side resting on a nearly-extinct punting zone as an anecdote', async () => {
    // 4th-and-goal from the 5 (zone 1): 13 usable punts in the 2021+ table
    // (11 clean transfers + 1 return TD + 1 kicking-team recovery).
    vi.mocked(queryExpectedPoints)
      .mockResolvedValueOnce({
        rows: [downFourRow({ state: 'd4|goal|z1', distance_bucket: 'goal', field_zone: 1, ep_net: 1.9 })],
        error: null,
      })
      .mockResolvedValueOnce({ rows: downOneCurve(0.4), error: null })
    const payload = JSON.parse(
      await getExpectedPointsTool({ down: 4, distance: 5, yards_to_goal: 5 })
    )

    expect(payload.fourth_down_decision.punt.n_punts_basis).toBe(13)
    expect(payload.caveats.join(' ')).toMatch(/Only 13 real punts/)
  })

  it('passes the query error string through untouched (never throws)', async () => {
    vi.mocked(queryExpectedPoints).mockResolvedValue({
      rows: [],
      error: 'Error: api.expected_points request failed: connection refused',
    })
    const result = await getExpectedPointsTool({})

    expect(result).toBe('Error: api.expected_points request failed: connection refused')
  })
})
