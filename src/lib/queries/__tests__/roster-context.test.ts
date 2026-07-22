/**
 * Unit tests for src/lib/queries/roster-context.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getReturningProduction, getTransferPortalImpact } from '../roster-context'
import { createSupabaseMock, dbError, ok, type SupabaseMockConfig } from './helpers'
import { createReturningProductionRow, createTransferPortalImpactRow } from './fixtures/roster-context'

function mockClient(config: SupabaseMockConfig) {
  const mock = createSupabaseMock(config)
  vi.mocked(createClient).mockResolvedValue(mock as unknown as Awaited<ReturnType<typeof createClient>>)
  return mock
}

/** The chain object returned by the Nth `.schema('api').from(...)` call this test made. */
function apiChain(mock: ReturnType<typeof createSupabaseMock>, callIndex = 0) {
  return mock.schema.mock.results[callIndex].value.from.mock.results[0].value
}

describe('getReturningProduction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the season returning-production profile for the given team + season', async () => {
    const mock = mockClient({ apiTables: { team_returning_production: ok(createReturningProductionRow()) } })

    const result = await getReturningProduction('Ohio State', 2025)

    expect(result).toEqual(createReturningProductionRow())
    expect(result!.returning_ppa_pct).toBe(0.612)
    expect(result!.returning_rank).toBe(34)

    const chain = apiChain(mock)
    expect(mock.schema).toHaveBeenCalledWith('api')
    expect(chain.eq).toHaveBeenCalledWith('team', 'Ohio State')
    expect(chain.eq).toHaveBeenCalledWith('season', 2025)
  })

  it('returns null when no row is found (offseason build has not run yet -- not an error)', async () => {
    mockClient({ apiTables: { team_returning_production: ok(null) } })

    expect(await getReturningProduction('Directional State', 2025)).toBeNull()
  })

  it('returns null (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { team_returning_production: dbError() } })

    expect(await getReturningProduction('Ohio State', 2025)).toBeNull()
  })
})

describe('getTransferPortalImpact', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the season transfer-portal impact profile for the given team + season', async () => {
    const mock = mockClient({ apiTables: { transfer_portal_impact: ok(createTransferPortalImpactRow()) } })

    const result = await getTransferPortalImpact('Ohio State', 2025)

    expect(result).toEqual(createTransferPortalImpactRow())
    expect(result!.net_transfers).toBe(5)
    expect(result!.portal_dependency_pctl).toBe(0.42)

    const chain = apiChain(mock)
    expect(mock.schema).toHaveBeenCalledWith('api')
    expect(chain.eq).toHaveBeenCalledWith('team', 'Ohio State')
    expect(chain.eq).toHaveBeenCalledWith('season', 2025)
  })

  it('returns null when no row is found (not an error)', async () => {
    mockClient({ apiTables: { transfer_portal_impact: ok(null) } })

    expect(await getTransferPortalImpact('Directional State', 2025)).toBeNull()
  })

  it('returns null (not a throw) on PostgREST error', async () => {
    mockClient({ apiTables: { transfer_portal_impact: dbError() } })

    expect(await getTransferPortalImpact('Ohio State', 2025)).toBeNull()
  })
})
