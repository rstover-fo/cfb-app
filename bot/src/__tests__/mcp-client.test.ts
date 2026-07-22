import { describe, it, expect, vi, beforeEach } from 'vitest'

const { callToolMock, connectMock, clientConstructorMock } = vi.hoisted(() => ({
  callToolMock: vi.fn(),
  connectMock: vi.fn(),
  clientConstructorMock: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    connect = connectMock
    callTool = callToolMock
    constructor(...args: unknown[]) {
      clientConstructorMock(...args)
    }
  },
}))

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {
    constructor(
      public url: unknown,
      public opts: unknown
    ) {}
  },
}))

vi.mock('../config.js', () => ({
  loadConfig: vi.fn(() => ({
    discordToken: 't',
    discordAppId: 'a',
    discordGuildId: 'g',
    mcpUrl: 'https://example.com/api/mcp',
    mcpAuthToken: 'secret-token',
    defaultSeason: 2025,
  })),
}))

import { callCfbTool, McpAuthError, McpTimeoutError, resetMcpClientForTests } from '../mcp-client.js'

function textResult(text: string) {
  return { content: [{ type: 'text', text }] }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetMcpClientForTests()
  connectMock.mockResolvedValue(undefined)
})

describe('callCfbTool', () => {
  it('parses the flat {_source,count,rows} envelope into kind: rows', async () => {
    callToolMock.mockResolvedValueOnce(
      textResult(JSON.stringify({ _source: 'api.poll_rankings', count: 1, rows: [{ rank: 1 }] }))
    )

    const result = await callCfbTool('get_rankings', { season: 2025 })
    expect(result).toEqual({ kind: 'rows', source: 'api.poll_rankings', count: 1, rows: [{ rank: 1 }] })
  })

  it('falls back to kind: message for a plain non-JSON string', async () => {
    callToolMock.mockResolvedValueOnce(textResult('No games found matching the given filters.'))

    const result = await callCfbTool('query_games', {})
    expect(result).toEqual({ kind: 'message', text: 'No games found matching the given filters.' })
  })

  it('falls back to kind: message for composite JSON that is not the flat envelope', async () => {
    const composite = JSON.stringify({
      team_detail: { _source: 'api.team_detail', count: 1, rows: [{ school: 'Oklahoma' }] },
      team_history: { _source: 'api.team_history', count: 0, rows: [] },
    })
    callToolMock.mockResolvedValueOnce(textResult(composite))

    const result = await callCfbTool('query_team', { team: 'Oklahoma' })
    expect(result).toEqual({ kind: 'message', text: composite })
  })

  it('passes the tool name and args through to callTool', async () => {
    callToolMock.mockResolvedValueOnce(textResult(JSON.stringify({ _source: 's', count: 0, rows: [] })))

    await callCfbTool('get_leaderboard', { season: 2025, metric: 'wins' })
    expect(callToolMock).toHaveBeenCalledWith(
      { name: 'get_leaderboard', arguments: { season: 2025, metric: 'wins' } },
      undefined,
      expect.objectContaining({ timeout: expect.any(Number) })
    )
  })

  it('maps a 401 error to McpAuthError without retrying', async () => {
    callToolMock.mockRejectedValueOnce(Object.assign(new Error('unauthorized'), { code: 401 }))

    await expect(callCfbTool('get_rankings', {})).rejects.toBeInstanceOf(McpAuthError)
    expect(callToolMock).toHaveBeenCalledTimes(1)
  })

  it('maps an MCP request-timeout error code to McpTimeoutError without retrying', async () => {
    callToolMock.mockRejectedValueOnce(Object.assign(new Error('timed out'), { code: -32001 }))

    await expect(callCfbTool('get_rankings', {})).rejects.toBeInstanceOf(McpTimeoutError)
    expect(callToolMock).toHaveBeenCalledTimes(1)
  })

  it('maps a message-based timeout to McpTimeoutError', async () => {
    callToolMock.mockRejectedValueOnce(new Error('Request timed out'))

    await expect(callCfbTool('get_rankings', {})).rejects.toBeInstanceOf(McpTimeoutError)
  })

  it('reconnects and retries once after a generic transport error, then succeeds', async () => {
    callToolMock
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(textResult(JSON.stringify({ _source: 'api.poll_rankings', count: 0, rows: [] })))

    const result = await callCfbTool('get_rankings', { season: 2025 })
    expect(result).toEqual({ kind: 'rows', source: 'api.poll_rankings', count: 0, rows: [] })
    expect(clientConstructorMock).toHaveBeenCalledTimes(2)
    expect(connectMock).toHaveBeenCalledTimes(2)
  })

  it('propagates the underlying error if the retry also fails', async () => {
    callToolMock.mockRejectedValue(new Error('still broken'))

    await expect(callCfbTool('get_rankings', {})).rejects.toThrow('still broken')
    expect(callToolMock).toHaveBeenCalledTimes(2)
  })

  it('maps a connect-time 401 to McpAuthError without retrying, and drops the memoized client', async () => {
    // No numeric code on purpose -- exercises the message-based 401 fallback,
    // matching how the streamable-HTTP transport reports connect rejections.
    connectMock.mockRejectedValueOnce(new Error('Error POSTing to endpoint (HTTP 401): unauthorized'))

    await expect(callCfbTool('get_rankings', {})).rejects.toBeInstanceOf(McpAuthError)
    expect(callToolMock).not.toHaveBeenCalled()

    // The rejected client promise must not stay memoized: the next call
    // attempts a fresh connect (e.g. after the server-side token is fixed).
    callToolMock.mockResolvedValueOnce(textResult(JSON.stringify({ _source: 's', count: 0, rows: [] })))
    const result = await callCfbTool('get_rankings', {})
    expect(result).toEqual({ kind: 'rows', source: 's', count: 0, rows: [] })
    expect(clientConstructorMock).toHaveBeenCalledTimes(2)
  })

  it('reuses the same client across calls until an error forces a reconnect', async () => {
    callToolMock.mockResolvedValue(textResult(JSON.stringify({ _source: 'api.poll_rankings', count: 0, rows: [] })))

    await callCfbTool('get_rankings', {})
    await callCfbTool('get_rankings', {})

    expect(clientConstructorMock).toHaveBeenCalledTimes(1)
    expect(connectMock).toHaveBeenCalledTimes(1)
  })
})
