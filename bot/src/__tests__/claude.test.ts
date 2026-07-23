import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { betaCreateMock, routerCreateMock, routeQuestionMock, loadConfigMock } = vi.hoisted(() => ({
  betaCreateMock: vi.fn(),
  routerCreateMock: vi.fn(),
  routeQuestionMock: vi.fn(),
  loadConfigMock: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: routerCreateMock }
    beta = { messages: { create: betaCreateMock } }
  },
}))

vi.mock('../router.js', () => ({ routeQuestion: routeQuestionMock }))

const VALID_CONFIG = {
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
}

vi.mock('../config.js', () => ({
  loadConfig: loadConfigMock,
  getDefaultSeason: vi.fn(() => 2025),
}))

// Lore toggle on by default in tests; settings.ts touches the filesystem, so
// it's mocked out entirely here (its own persistence has settings.test.ts).
const { getLoreEnabledMock } = vi.hoisted(() => ({ getLoreEnabledMock: vi.fn(async () => true) }))
vi.mock('../settings.js', () => ({ getLoreEnabled: getLoreEnabledMock }))

import { askClaude, ClaudeUnavailableError, resetClaudeForTests } from '../claude.js'
import { resetAnthropicClientForTests } from '../anthropic-client.js'

function apiResponse(
  text: string,
  usage: Partial<Record<'input_tokens' | 'output_tokens' | 'cache_creation_input_tokens' | 'cache_read_input_tokens', number>> = {}
) {
  return {
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: {
      input_tokens: usage.input_tokens ?? 100,
      output_tokens: usage.output_tokens ?? 50,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    },
  }
}

/** A response whose server-side MCP tool loop paused before emitting any text. */
function pausedResponse(outputTokens = 500) {
  return {
    content: [
      { type: 'thinking', thinking: '' },
      { type: 'mcp_tool_use', id: 't1', name: 'run_sql', input: { sql: 'SELECT 1' } },
      { type: 'mcp_tool_result', tool_use_id: 't1', content: [] },
    ],
    stop_reason: 'pause_turn',
    usage: {
      input_tokens: 100,
      output_tokens: outputTokens,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  }
}

let logSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  resetClaudeForTests()
  resetAnthropicClientForTests()
  loadConfigMock.mockReturnValue(VALID_CONFIG)
  routeQuestionMock.mockResolvedValue('simple')
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}) as ReturnType<typeof vi.spyOn>
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}) as ReturnType<typeof vi.spyOn>
})

afterEach(() => {
  logSpy.mockRestore()
  errorSpy.mockRestore()
})

describe('askClaude request shape', () => {
  it('includes the server-lore block only while /lore is on', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))
    await askClaude('anything')
    expect(betaCreateMock.mock.calls[0]?.[0].system[0].text).toContain('grimlock')

    // Toggle off: the block must vanish from the wire request entirely --
    // this is the enforcement mechanism behind the /lore promise.
    getLoreEnabledMock.mockResolvedValueOnce(false)
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))
    await askClaude('anything')
    expect(betaCreateMock.mock.calls[1]?.[0].system[0].text).not.toContain('grimlock')
  })

  it('sends one MCP-connector beta call on the default model for a simple question', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('Ohio State is ranked #1.'))

    const result = await askClaude('who is #1?')

    expect(betaCreateMock).toHaveBeenCalledTimes(1)
    const request = betaCreateMock.mock.calls[0]?.[0]
    expect(request.model).toBe('claude-sonnet-5')
    expect(request.max_tokens).toBe(8000)
    expect(request.thinking).toEqual({ type: 'adaptive' })
    expect(request.betas).toEqual(['mcp-client-2025-11-20'])
    expect(request.mcp_servers).toEqual([
      {
        type: 'url',
        url: 'https://example.com/api/mcp',
        name: 'cfb',
        authorization_token: 'secret-token',
      },
    ])
    expect(request.tools).toEqual([{ type: 'mcp_toolset', mcp_server_name: 'cfb' }])
    expect(request.system).toHaveLength(1)
    expect(request.system[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(request.system[0].text).toContain('current season is 2025')
    expect(request.system[0].text).toContain('[ESCALATE]') // Sonnet tier gets the escalation rule
    expect(request.messages).toEqual([{ role: 'user', content: 'who is #1?' }])

    expect(result).toEqual({
      text: 'Ohio State is ranked #1.',
      tier: 'simple',
      escalated: false,
      usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      model: 'claude-sonnet-5',
    })
  })

  it('uses the advisor model without the escalation rule for a gnarly question', async () => {
    routeQuestionMock.mockResolvedValue('gnarly')
    betaCreateMock.mockResolvedValueOnce(apiResponse('Deep analysis here.'))

    const result = await askClaude('who wins X vs Y and why?')

    const request = betaCreateMock.mock.calls[0]?.[0]
    expect(request.model).toBe('claude-opus-4-8')
    expect(request.system[0].text).not.toContain('[ESCALATE]')
    expect(result.tier).toBe('gnarly')
    expect(result.escalated).toBe(false)
    expect(result.model).toBe('claude-opus-4-8')
  })

  it('appends userContext to the final user message only, not to history', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))
    const history = [
      { role: 'user' as const, content: 'tell me about Ohio State' },
      { role: 'assistant' as const, content: 'They are 8-0.' },
    ]

    await askClaude('what about their defense?', { history, userContext: "this user's favorite team is Oklahoma" })

    const request = betaCreateMock.mock.calls[0]?.[0]
    expect(request.messages).toEqual([
      { role: 'user', content: 'tell me about Ohio State' },
      { role: 'assistant', content: 'They are 8-0.' },
      {
        role: 'user',
        content: "what about their defense?\n\n(Context: this user's favorite team is Oklahoma)",
      },
    ])
  })

  it('omits the context suffix entirely when userContext is not given', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))

    await askClaude('plain question')

    const request = betaCreateMock.mock.calls[0]?.[0]
    expect(request.messages).toEqual([{ role: 'user', content: 'plain question' }])
  })

  it('prepends history turns and passes the last user turn to the router as topic', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))
    const history = [
      { role: 'user' as const, content: 'tell me about Ohio State' },
      { role: 'assistant' as const, content: 'They are 8-0.' },
    ]

    await askClaude('what about their defense?', { history })

    expect(routeQuestionMock).toHaveBeenCalledWith('what about their defense?', 'tell me about Ohio State')
    const request = betaCreateMock.mock.calls[0]?.[0]
    expect(request.messages).toEqual([
      { role: 'user', content: 'tell me about Ohio State' },
      { role: 'assistant', content: 'They are 8-0.' },
      { role: 'user', content: 'what about their defense?' },
    ])
  })
})

describe('askClaude text extraction', () => {
  it('concatenates text blocks and skips thinking/tool blocks', async () => {
    betaCreateMock.mockResolvedValueOnce({
      content: [
        { type: 'thinking', thinking: 'internal reasoning' },
        { type: 'mcp_tool_use', id: 't1', name: 'get_rankings', input: {} },
        { type: 'mcp_tool_result', tool_use_id: 't1', content: [] },
        { type: 'text', text: 'First part. ' },
        { type: 'text', text: 'Second part.' },
      ],
      usage: { input_tokens: 1, output_tokens: 2, cache_creation_input_tokens: 3, cache_read_input_tokens: 4 },
    })

    const result = await askClaude('question')
    expect(result.text).toBe('First part. Second part.')
    expect(result.usage).toEqual({
      input_tokens: 1,
      output_tokens: 2,
      cache_creation_input_tokens: 3,
      cache_read_input_tokens: 4,
    })
  })
})

describe('askClaude pause_turn continuation', () => {
  it('resumes a paused server-side tool loop by appending the assistant turn', async () => {
    betaCreateMock
      .mockResolvedValueOnce(pausedResponse(500))
      .mockResolvedValueOnce(apiResponse('Elo was the better predictor.', { output_tokens: 300 }))

    const result = await askClaude('deep multi-tool question')

    expect(betaCreateMock).toHaveBeenCalledTimes(2)
    // The resume request carries the full prior conversation plus the paused
    // assistant content -- the server picks the tool loop back up from there.
    const resume = betaCreateMock.mock.calls[1]?.[0]
    expect(resume.messages).toEqual([
      { role: 'user', content: 'deep multi-tool question' },
      { role: 'assistant', content: pausedResponse().content },
    ])

    expect(result.text).toBe('Elo was the better predictor.')
    // Usage summed across the paused call and the resume
    expect(result.usage.output_tokens).toBe(800)
    expect(result.usage.input_tokens).toBe(200)
  })

  it('gives up after the continuation cap instead of looping forever', async () => {
    // 1 initial + 5 continuations, all paused (queued Once so nothing leaks
    // into later tests -- clearAllMocks does not remove persistent values)
    for (let i = 0; i < 6; i++) betaCreateMock.mockResolvedValueOnce(pausedResponse())

    const result = await askClaude('question that never finishes')

    // 1 initial call + 5 continuations
    expect(betaCreateMock).toHaveBeenCalledTimes(6)
    expect(result.text).toBe('')
    // The empty result is diagnosable from the logs
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('stop_reason=pause_turn'))
  })

  it('logs the stop reason when the token budget is exhausted before any text', async () => {
    betaCreateMock.mockResolvedValueOnce({
      content: [{ type: 'thinking', thinking: '' }],
      stop_reason: 'max_tokens',
      usage: { input_tokens: 100, output_tokens: 8000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    })

    const result = await askClaude('question')

    expect(result.text).toBe('')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('stop_reason=max_tokens'))
  })
})

describe('askClaude escalation backstop', () => {
  it('re-runs once on the advisor model when the simple tier ends with [ESCALATE]', async () => {
    betaCreateMock
      .mockResolvedValueOnce(
        apiResponse('Partial answer.\n[ESCALATE]', { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 5 })
      )
      .mockResolvedValueOnce(
        apiResponse('Advisor-grade answer.', { input_tokens: 200, output_tokens: 40, cache_creation_input_tokens: 7 })
      )

    const result = await askClaude('sneaky-deep question')

    expect(betaCreateMock).toHaveBeenCalledTimes(2)
    const rerun = betaCreateMock.mock.calls[1]?.[0]
    expect(rerun.model).toBe('claude-opus-4-8')
    expect(rerun.system[0].text).not.toContain('[ESCALATE]') // advisor never sees the rule
    expect(rerun.messages).toEqual([{ role: 'user', content: 'sneaky-deep question' }])

    expect(result.text).toBe('Advisor-grade answer.')
    expect(result.text).not.toContain('[ESCALATE]')
    expect(result.tier).toBe('simple')
    expect(result.escalated).toBe(true)
    expect(result.model).toBe('claude-opus-4-8')
    // Usage summed across both calls
    expect(result.usage).toEqual({
      input_tokens: 300,
      output_tokens: 50,
      cache_creation_input_tokens: 7,
      cache_read_input_tokens: 5,
    })
  })

  it('does not re-run when a gnarly-tier answer happens to contain the token', async () => {
    routeQuestionMock.mockResolvedValue('gnarly')
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer\n[ESCALATE]'))

    await askClaude('question')
    expect(betaCreateMock).toHaveBeenCalledTimes(1)
  })
})

describe('askClaude errors', () => {
  it('wraps API errors in ClaudeUnavailableError with a friendly message', async () => {
    betaCreateMock.mockRejectedValueOnce(new Error('529 overloaded'))

    await expect(askClaude('question')).rejects.toBeInstanceOf(ClaudeUnavailableError)
    await expect(
      askClaude('question').catch((err: Error) => err.message)
    ).resolves.toContain("Couldn't reach the stats brain")
  })

  it('throws ClaudeUnavailableError when ANTHROPIC_API_KEY is missing', async () => {
    loadConfigMock.mockReturnValue({ ...VALID_CONFIG, anthropicApiKey: undefined })

    await expect(askClaude('question')).rejects.toBeInstanceOf(ClaudeUnavailableError)
    expect(betaCreateMock).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled() // the clear underlying reason is logged
  })

  it('wraps an [ESCALATE] re-run failure in ClaudeUnavailableError', async () => {
    betaCreateMock
      .mockResolvedValueOnce(apiResponse('partial\n[ESCALATE]'))
      .mockRejectedValueOnce(new Error('boom'))

    await expect(askClaude('question')).rejects.toBeInstanceOf(ClaudeUnavailableError)
  })
})

describe('askClaude logging', () => {
  it('logs one JSON line with tier/model/usage and no user text', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))

    await askClaude('my very identifiable question')

    const llmLines = logSpy.mock.calls
      .map((call: unknown[]) => call[0])
      .filter((line: unknown): line is string => typeof line === 'string' && line.includes('"evt":"llm"'))
    expect(llmLines).toHaveLength(1)
    const parsed = JSON.parse(llmLines[0]!)
    expect(parsed).toMatchObject({
      evt: 'llm',
      tier: 'simple',
      escalated: false,
      model: 'claude-sonnet-5',
      usage: { input_tokens: 100, output_tokens: 50 },
    })
    expect(typeof parsed.ms).toBe('number')
    expect(llmLines[0]).not.toContain('identifiable')
  })

  it('logs the advisor model after an escalation', async () => {
    betaCreateMock
      .mockResolvedValueOnce(apiResponse('partial\n[ESCALATE]'))
      .mockResolvedValueOnce(apiResponse('advisor answer'))

    await askClaude('question')

    const line = logSpy.mock.calls
      .map((call: unknown[]) => call[0])
      .find((l: unknown) => typeof l === 'string' && l.includes('"evt":"llm"'))
    const parsed = JSON.parse(line as string)
    expect(parsed.escalated).toBe(true)
    expect(parsed.model).toBe('claude-opus-4-8')
  })
})
