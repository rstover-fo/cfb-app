import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { checkAuth, unauthorizedResponse, tokensMatch } from '../auth'

const ORIGINAL_TOKEN = process.env.MCP_AUTH_TOKEN

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/mcp', { headers })
}

describe('tokensMatch', () => {
  it('returns true for identical tokens', () => {
    expect(tokensMatch('abc123', 'abc123')).toBe(true)
  })

  it('returns false for different tokens of the same length', () => {
    expect(tokensMatch('abc123', 'abc124')).toBe(false)
  })

  it('returns false for tokens of different lengths (no throw)', () => {
    expect(tokensMatch('short', 'a-much-longer-token-value')).toBe(false)
  })

  it('returns false for empty vs non-empty', () => {
    expect(tokensMatch('', 'nonempty')).toBe(false)
  })
})

describe('checkAuth', () => {
  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.MCP_AUTH_TOKEN
    else process.env.MCP_AUTH_TOKEN = ORIGINAL_TOKEN
  })

  describe('MCP_AUTH_TOKEN unset (fail closed)', () => {
    beforeEach(() => {
      delete process.env.MCP_AUTH_TOKEN
    })

    it('refuses a request with no Authorization header at all', () => {
      const result = checkAuth(req())
      expect(result.ok).toBe(false)
      expect(result.status).toBe(401)
      expect(result.message).toMatch(/MCP_AUTH_TOKEN is not set/)
    })

    it('refuses a request even with a well-formed bearer token', () => {
      const result = checkAuth(req({ Authorization: 'Bearer anything-at-all' }))
      expect(result.ok).toBe(false)
      expect(result.message).toMatch(/MCP_AUTH_TOKEN is not set/)
    })

    it('refuses a request even when the empty string would "match" an empty expected token', () => {
      // Guards against a subtle fail-open bug: an unset env var must never be
      // treated as an empty-string token that a blank/missing header could satisfy.
      const result = checkAuth(req({ Authorization: 'Bearer ' }))
      expect(result.ok).toBe(false)
    })
  })

  describe('MCP_AUTH_TOKEN set', () => {
    beforeEach(() => {
      process.env.MCP_AUTH_TOKEN = 'correct-horse-battery-staple'
    })

    it('accepts the correct bearer token', () => {
      const result = checkAuth(req({ Authorization: 'Bearer correct-horse-battery-staple' }))
      expect(result).toEqual({ ok: true, status: 200 })
    })

    it('rejects a missing Authorization header', () => {
      const result = checkAuth(req())
      expect(result.ok).toBe(false)
      expect(result.status).toBe(401)
      expect(result.message).toMatch(/Missing or malformed/)
    })

    it('rejects a header without the Bearer prefix', () => {
      const result = checkAuth(req({ Authorization: 'correct-horse-battery-staple' }))
      expect(result.ok).toBe(false)
      expect(result.message).toMatch(/Missing or malformed/)
    })

    it('rejects the wrong token', () => {
      const result = checkAuth(req({ Authorization: 'Bearer wrong-token' }))
      expect(result.ok).toBe(false)
      expect(result.status).toBe(401)
      expect(result.message).toMatch(/Invalid bearer token/)
    })

    it('rejects an empty bearer token', () => {
      const result = checkAuth(req({ Authorization: 'Bearer ' }))
      expect(result.ok).toBe(false)
    })

    it('is case-sensitive on the token value', () => {
      const result = checkAuth(req({ Authorization: 'Bearer CORRECT-HORSE-BATTERY-STAPLE' }))
      expect(result.ok).toBe(false)
    })
  })
})

describe('unauthorizedResponse', () => {
  it('builds a JSON 401 response with the failure message and a WWW-Authenticate header', async () => {
    const response = unauthorizedResponse({ ok: false, status: 401, message: 'nope' })
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
    expect(response.headers.get('content-type')).toBe('application/json')
    const body = await response.json()
    expect(body).toEqual({ error: 'nope' })
  })

  it('falls back to a generic message when none is provided', async () => {
    const response = unauthorizedResponse({ ok: false, status: 401 })
    const body = await response.json()
    expect(body).toEqual({ error: 'Unauthorized' })
  })
})
