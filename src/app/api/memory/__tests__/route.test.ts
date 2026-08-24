import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { getMemoriesMock, forgetMemoriesMock, memoryConfiguredMock } = vi.hoisted(() => ({
  getMemoriesMock: vi.fn(),
  forgetMemoriesMock: vi.fn(),
  memoryConfiguredMock: vi.fn(),
}))
vi.mock('@/lib/memory/client', () => ({
  getMemories: getMemoriesMock,
  forgetMemories: forgetMemoriesMock,
  memoryConfigured: memoryConfiguredMock,
}))

import { GET, DELETE } from '../route'

const ADMIN_TOKEN = 'memory-admin-secret'
const SNOWFLAKE = '225693950378377221'

function getRequest(userId: string | null, token?: string): Request {
  const url = new URL('https://app.example/api/memory')
  if (userId !== null) url.searchParams.set('userId', userId)
  return new Request(url, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

function deleteRequest(body: unknown, token?: string): Request {
  return new Request('https://app.example/api/memory', {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MEMORY_ADMIN_TOKEN = ADMIN_TOKEN
  memoryConfiguredMock.mockReturnValue(true)
  getMemoriesMock.mockResolvedValue([])
  forgetMemoriesMock.mockResolvedValue(0)
})

afterEach(() => {
  delete process.env.MEMORY_ADMIN_TOKEN
  delete process.env.MCP_AUTH_TOKEN
})

describe('/api/memory auth (dedicated bot-only credential)', () => {
  it('fails closed when MEMORY_ADMIN_TOKEN is unset', async () => {
    delete process.env.MEMORY_ADMIN_TOKEN
    const response = await GET(getRequest(SNOWFLAKE, 'anything'))
    expect(response.status).toBe(401)
    expect(getMemoriesMock).not.toHaveBeenCalled()
  })

  it('rejects a missing credential', async () => {
    expect((await GET(getRequest(SNOWFLAKE))).status).toBe(401)
  })

  it('rejects a wrong token', async () => {
    expect((await GET(getRequest(SNOWFLAKE, 'wrong'))).status).toBe(401)
  })

  it('does NOT accept the shared MCP token: memories are gated on the dedicated secret', async () => {
    process.env.MCP_AUTH_TOKEN = 'shared-mcp-token'
    const response = await GET(getRequest(SNOWFLAKE, 'shared-mcp-token'))
    expect(response.status).toBe(401)
    expect(getMemoriesMock).not.toHaveBeenCalled()
  })
})

describe('GET /api/memory', () => {
  it('returns the user memories with the dedicated token', async () => {
    const memories = [
      { id: 'm1', kind: 'fact', content: 'Went to Oklahoma', context: null, createdAt: 't', updatedAt: 't' },
    ]
    getMemoriesMock.mockResolvedValue(memories)
    const response = await GET(getRequest(SNOWFLAKE, ADMIN_TOKEN))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ memories })
    expect(getMemoriesMock).toHaveBeenCalledWith(SNOWFLAKE)
  })

  it('rejects a non-snowflake userId', async () => {
    expect((await GET(getRequest('robert', ADMIN_TOKEN))).status).toBe(400)
  })

  it('returns 503 when memory is not configured', async () => {
    memoryConfiguredMock.mockReturnValue(false)
    expect((await GET(getRequest(SNOWFLAKE, ADMIN_TOKEN))).status).toBe(503)
  })
})

describe('DELETE /api/memory', () => {
  it('forgets one memory by id and reports the count', async () => {
    forgetMemoriesMock.mockResolvedValue(1)
    const response = await DELETE(deleteRequest({ userId: SNOWFLAKE, memoryId: 'm1' }, ADMIN_TOKEN))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleted: 1 })
    expect(forgetMemoriesMock).toHaveBeenCalledWith(SNOWFLAKE, 'm1')
  })

  it('a failed service call surfaces as 502, never as success', async () => {
    forgetMemoriesMock.mockResolvedValue(null)
    expect((await DELETE(deleteRequest({ userId: SNOWFLAKE }, ADMIN_TOKEN))).status).toBe(502)
  })

  it('rejects invalid JSON', async () => {
    const request = new Request('https://app.example/api/memory', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      body: 'not-json',
    })
    expect((await DELETE(request)).status).toBe(400)
  })
})
