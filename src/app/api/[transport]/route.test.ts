/**
 * Route-wiring regression tests for the MCP endpoint.
 *
 * auth.test.ts covers checkAuth/tokensMatch in isolation; these tests assert
 * the route module's actual HTTP exports are gated, so a future unguarded
 * export (e.g. `export { mcpHandler as DELETE }`) fails the suite instead of
 * shipping an auth bypass.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as route from './route'

const ORIGINAL_TOKEN = process.env.MCP_AUTH_TOKEN

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/mcp', { method: 'POST', headers })
}

describe('MCP route wiring', () => {
  beforeEach(() => {
    delete process.env.MCP_AUTH_TOKEN
  })

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.MCP_AUTH_TOKEN
    else process.env.MCP_AUTH_TOKEN = ORIGINAL_TOKEN
  })

  it('exports only GET and POST handlers', () => {
    const httpVerbs = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']
    const exported = httpVerbs.filter(verb => verb in route)
    expect(exported).toEqual(['GET', 'POST'])
  })

  it.each(['GET', 'POST'] as const)(
    '%s fails closed with 401 when MCP_AUTH_TOKEN is unset',
    async verb => {
      const handler = route[verb] as (r: Request) => Promise<Response>
      const res = await handler(req())
      expect(res.status).toBe(401)
      const body = await res.text()
      expect(body).toContain('MCP_AUTH_TOKEN')
    }
  )

  it.each(['GET', 'POST'] as const)('%s returns 401 for a wrong token', async verb => {
    process.env.MCP_AUTH_TOKEN = 'correct-token'
    const handler = route[verb] as (r: Request) => Promise<Response>
    const res = await handler(req({ authorization: 'Bearer wrong-token' }))
    expect(res.status).toBe(401)
  })

  it('accepts a lowercase "bearer" scheme at the auth layer (RFC 6750)', async () => {
    // Asserted against checkAuth directly: a request that passes auth proceeds
    // into the real MCP transport, which cannot complete in a unit context.
    process.env.MCP_AUTH_TOKEN = 'correct-token'
    const { checkAuth } = await import('@/lib/mcp/auth')
    expect(checkAuth(req({ authorization: 'bearer correct-token' })).ok).toBe(true)
    expect(checkAuth(req({ authorization: 'BEARER correct-token' })).ok).toBe(true)
  })
})

describe('query-param token (claude.ai connector compatibility)', () => {
  beforeEach(() => {
    process.env.MCP_AUTH_TOKEN = 'correct-token'
  })

  afterEach(() => {
    delete process.env.MCP_AUTH_TOKEN
  })

  it('accepts ?token= at the auth layer', async () => {
    const { checkAuth } = await import('@/lib/mcp/auth')
    const r = new Request('http://localhost/api/mcp?token=correct-token', { method: 'POST' })
    expect(checkAuth(r).ok).toBe(true)
  })

  it('rejects a wrong ?token= via the route', async () => {
    const res = await (route.POST as (r: Request) => Promise<Response>)(
      new Request('http://localhost/api/mcp?token=wrong', { method: 'POST' })
    )
    expect(res.status).toBe(401)
  })

  it('header takes precedence: wrong header + right param still rejects', async () => {
    const { checkAuth } = await import('@/lib/mcp/auth')
    const r = new Request('http://localhost/api/mcp?token=correct-token', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong' },
    })
    expect(checkAuth(r).ok).toBe(false)
  })
})
