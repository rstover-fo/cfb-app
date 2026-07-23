import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: rpcMock })),
}))

import { runSqlTool, validateAnalystSql } from '../tools'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('validateAnalystSql', () => {
  it('accepts a SELECT with trailing semicolon', () => {
    expect(validateAnalystSql('SELECT team FROM api.team_elo ORDER BY season_end_elo DESC LIMIT 5;')).toBeNull()
  })

  it('accepts a WITH (CTE) statement', () => {
    expect(validateAnalystSql('WITH x AS (SELECT 1) SELECT * FROM x LIMIT 1')).toBeNull()
  })

  it('rejects empty and oversized statements', () => {
    expect(validateAnalystSql('   ')).toMatch(/empty/)
    expect(validateAnalystSql(`SELECT '${'x'.repeat(4000)}'`)).toMatch(/exceeds/)
  })

  it('rejects non-SELECT statements', () => {
    expect(validateAnalystSql('EXPLAIN SELECT 1')).toMatch(/only SELECT/)
    expect(validateAnalystSql('SHOW search_path')).toMatch(/only SELECT/)
  })

  it('rejects multiple statements', () => {
    expect(validateAnalystSql('SELECT 1; SELECT 2')).toMatch(/multiple statements/)
  })

  it('rejects DML/DDL smuggled after a SELECT prefix', () => {
    expect(validateAnalystSql('WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x')).toMatch(/disallowed keyword/)
    expect(validateAnalystSql('SELECT * FROM api.team_elo; DROP TABLE t')).toMatch(/multiple statements/)
    expect(validateAnalystSql("SELECT pg_terminate_backend(1) FROM grant_all")).toMatch(/disallowed keyword/)
  })

  it('does not false-positive on ordinary analytical SQL', () => {
    // OFFSET contains "set"; created_at-style column names contain "create";
    // word-boundary matching must not flag them.
    expect(
      validateAnalystSql('SELECT team, season_end_elo FROM api.team_elo ORDER BY season OFFSET 10 LIMIT 10')
    ).toBeNull()
  })
})

describe('runSqlTool', () => {
  it('returns validation errors without any network call', async () => {
    const result = await runSqlTool({ sql: 'DELETE FROM api.team_elo' })
    expect(result).toMatch(/only SELECT/)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('wraps returned rows in the standard envelope', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ coach_name: 'Lincoln Riley', schools: 2, weaker_school_peak: 1900 }],
      error: null,
    })

    const result = await runSqlTool({ sql: 'SELECT 1 AS x LIMIT 1' })
    const parsed = JSON.parse(result)
    expect(parsed._source).toBe('public.run_analyst_query')
    expect(parsed.count).toBe(1)
    expect(parsed.rows[0].coach_name).toBe('Lincoln Riley')
    expect(rpcMock).toHaveBeenCalledWith('run_analyst_query', { query_sql: 'SELECT 1 AS x LIMIT 1' })
  })

  it('returns a friendly note for zero rows', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null })
    const result = await runSqlTool({ sql: 'SELECT 1 WHERE false' })
    expect(result).toMatch(/No rows returned/)
  })

  it('reports a missing RPC as a capability gap, not a query failure', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.run_analyst_query' },
    })
    const result = await runSqlTool({ sql: 'SELECT 1' })
    expect(result).toMatch(/not enabled on this server yet/)
  })

  it('surfaces database errors as Error strings (never throws)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: '57014', message: 'canceling statement due to statement timeout' },
    })
    const result = await runSqlTool({ sql: 'SELECT 1' })
    expect(result).toMatch(/^Error:/)
    expect(result).toMatch(/timeout/)
  })
})
