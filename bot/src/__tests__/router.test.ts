import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createMock, betaCreateMock, constructorMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  betaCreateMock: vi.fn(),
  constructorMock: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock }
    beta = { messages: { create: betaCreateMock } }
    constructor(...args: unknown[]) {
      constructorMock(...args)
    }
  },
}))

vi.mock('../config.js', () => ({
  loadConfig: vi.fn(() => ({
    discordToken: 't',
    discordAppId: 'a',
    discordGuildId: 'g',
    mcpUrl: 'https://example.com/api/mcp',
    mcpAuthToken: 'secret-token',
    anthropicApiKey: 'sk-ant-test',
    modelDefault: 'claude-sonnet-5',
    modelAdvisor: 'claude-opus-4-8',
    modelRouter: 'claude-haiku-4-5',
    defaultSeason: 2025,
  })),
  getDefaultSeason: vi.fn(() => 2025),
}))

import { routeQuestion } from '../router.js'
import { resetAnthropicClientForTests } from '../anthropic-client.js'

function textResponse(text: string) {
  return { content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 1 } }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetAnthropicClientForTests()
})

describe('routeQuestion', () => {
  it('classifies a "simple" verdict as simple', async () => {
    createMock.mockResolvedValueOnce(textResponse('simple'))
    await expect(routeQuestion('who is ranked #1?')).resolves.toBe('simple')
  })

  it('classifies a "gnarly" verdict as gnarly', async () => {
    createMock.mockResolvedValueOnce(textResponse('gnarly'))
    await expect(routeQuestion('who wins Ohio State vs Texas and why?')).resolves.toBe('gnarly')
  })

  it('tolerates whitespace and casing around the gnarly verdict', async () => {
    createMock.mockResolvedValueOnce(textResponse('  Gnarly\n'))
    await expect(routeQuestion('compare the whole top 10 by EPA')).resolves.toBe('gnarly')
  })

  it('routes any non-gnarly verdict to simple (fail toward the cheap default)', async () => {
    createMock.mockResolvedValueOnce(textResponse('this looks like a gnarly question'))
    await expect(routeQuestion('anything')).resolves.toBe('simple')
  })

  it('routes an empty response to simple', async () => {
    createMock.mockResolvedValueOnce({ content: [], usage: {} })
    await expect(routeQuestion('anything')).resolves.toBe('simple')
  })

  it('sends a small no-tools request on the router model', async () => {
    createMock.mockResolvedValueOnce(textResponse('simple'))

    await routeQuestion('who is ranked #1?')

    expect(createMock).toHaveBeenCalledTimes(1)
    const request = createMock.mock.calls[0]?.[0]
    expect(request.model).toBe('claude-haiku-4-5')
    expect(request.max_tokens).toBeLessThanOrEqual(50)
    expect(request).not.toHaveProperty('tools')
    expect(request).not.toHaveProperty('thinking')
    expect(request.messages).toEqual([{ role: 'user', content: 'who is ranked #1?' }])
  })

  it('includes the last topic in the prompt when given', async () => {
    createMock.mockResolvedValueOnce(textResponse('simple'))

    await routeQuestion('what about their defense?', 'Ohio State offense')

    const request = createMock.mock.calls[0]?.[0]
    expect(request.messages[0].content).toContain('Ohio State offense')
    expect(request.messages[0].content).toContain('what about their defense?')
  })

  it('returns simple and logs when the API call fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    createMock.mockRejectedValueOnce(new Error('rate limited'))

    await expect(routeQuestion('anything')).resolves.toBe('simple')
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('returns simple when the Anthropic client cannot be created (no API key)', async () => {
    const { loadConfig } = await import('../config.js')
    vi.mocked(loadConfig).mockReturnValueOnce({ anthropicApiKey: undefined } as never)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(routeQuestion('anything')).resolves.toBe('simple')
    expect(createMock).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
