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

/**
 * The system prompt is a string[] joined with newlines, so any phrase can be
 * split across an array element boundary. Assertions about WHAT the prompt says
 * should survive a reflow -- match against this, not the raw text, unless the
 * line structure itself is the thing under test.
 */
function flat(text: string): string {
  return text.replace(/\s+/g, ' ')
}

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

  it('sets the character ceiling below CHUNK_MAX and forbids ANSI while allowing the wider markdown vocabulary', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))
    await askClaude('anything')

    const text = betaCreateMock.mock.calls[0]?.[0].system[0].text as string
    // 3000 sits under format.ts's 3800 CHUNK_MAX, which in turn sits under
    // Components V2's hard 4000-char-per-message text budget -- so a
    // well-behaved answer renders as one container rather than splitting.
    expect(text).toContain('under 3000 characters')
    expect(text).not.toMatch(/\b1500 characters\b/)
    expect(text).not.toMatch(/\b4000 characters\b/)
    expect(text).toContain('```ansi')
    expect(text).toMatch(/never use.*```ansi/i)
    expect(text).toContain('##')
    expect(text).toContain('-# subtext')
    expect(text).toContain('`>` blockquote')
    expect(text).toContain('[label](url)')
    expect(text).toContain('<t:UNIX:R>')
    expect(text).toMatch(/max ~5 rows/)
  })

  it('caps monospace block width for mobile, not just row count', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))
    await askClaude('anything')

    const text = betaCreateMock.mock.calls[0]?.[0].system[0].text as string
    // The live-server incident: a hand-built ASCII bar chart wrapped on mobile
    // because the old rule only capped rows ("max ~5 rows"), never width. Discord
    // doesn't horizontally scroll a code block on a phone -- it wraps, which
    // destroys column alignment. The rule must name a concrete width cap.
    expect(text).toMatch(/max ~32 characters/)
    expect(text).toMatch(/per line/)
    expect(text).toMatch(/does not horizontally scroll/)
    expect(text).toMatch(/wraps/)
  })

  it('forbids hand-built ASCII/text charts when render_chart cannot help, without discouraging render_chart', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))
    await askClaude('anything')

    const text = betaCreateMock.mock.calls[0]?.[0].system[0].text as string
    // The live-server incident: asked for a decade-long two-team SP+ defense
    // comparison, render_chart only supports one single-team single-season
    // recipe, so the model improvised an ASCII bar chart -- which is precisely
    // what wraps into illegible noise on mobile.
    expect(text).toMatch(/do NOT hand-build a/)
    expect(text).toMatch(/no ASCII bar charts/)
    expect(text).toMatch(/block-character sparklines/)
    expect(text).toMatch(/arrow\/scale art/)
    // Must stay affirmative about calling render_chart when it CAN help --
    // the failure mode to avoid is a model that stops trying to chart things.
    expect(text).toMatch(/call it/)
    expect(text).toMatch(/whenever it CAN show what was asked/)
  })

  it('tells the model not to duplicate a chart as a monospace table', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))
    await askClaude('anything')

    const text = betaCreateMock.mock.calls[0]?.[0].system[0].text as string
    // The first real chart reply in #matrix rendered the six run/pass splits
    // twice -- once as a monospace table, once as the chart -- because the
    // table rule predates charts existing. The instruction is deliberately
    // CONDITIONAL: a monospace block is still the only way to align columns
    // when there is no chart, so this must not read as a blanket ban.
    expect(text).toMatch(/do NOT also lay the same values out in a monospace block/)
    expect(text).toMatch(/still the right call when there is no chart/)
  })

  it('routes season-long questions to get_season_outlook instead of refusing them', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))
    await askClaude('anything')

    const text = betaCreateMock.mock.calls[0]?.[0].system[0].text as string
    // The bot used to decline projected-standings questions on the grounds
    // that the engine scores one scheduled game at a time. api.season_outlook
    // makes that refusal wrong, so the prompt must send the model to the tool.
    expect(text).toMatch(/call get_season_outlook/)
    expect(flat(text)).toMatch(/not a question to refuse/)
  })

  it('requires an error band on any projected win total, and forbids a playoff probability', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))
    await askClaude('anything')

    const text = betaCreateMock.mock.calls[0]?.[0].system[0].text as string
    // The whole point of enabling projections: numbers WITH their uncertainty.
    // A bare standings table is the same overconfidence as inventing one.
    expect(flat(text)).toMatch(/pair a projected win total with/)
    expect(text).toMatch(/uncertainty/)
    expect(text).toMatch(/caveats/)
    expect(text).toMatch(/Never state a playoff probability/)
  })

  it('no longer claims unplayed games have no predictions', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))
    await askClaude('anything')

    const text = betaCreateMock.mock.calls[0]?.[0].system[0].text as string
    // Every 2026 game is unplayed and every one carries a model prediction, so
    // the old blanket claim actively suppressed a grounded answer.
    expect(text).not.toMatch(/no scores or predictions/)
    expect(flat(text)).toMatch(/An unplayed game has no SCORE, but it usually does have a model prediction/)
    expect(text).toMatch(/grounded, not invented/)
  })

  it('defers to the live accuracy block instead of restating error figures', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))
    await askClaude('anything')

    const text = betaCreateMock.mock.calls[0]?.[0].system[0].text as string
    // The block is read live from api.model_backtest, so a figure baked into
    // the prompt would silently contradict the payload after any re-run.
    expect(flat(text)).toMatch(/read live and the numbers move/)
    expect(text).toMatch(/never plus-or-minus the MAE/)
    expect(flat(text)).toMatch(/say the typical error is unknown/)
    expect(text).not.toMatch(/1\.7 wins on average/)
  })

  it('does not let a total-wins ranking be reported as conference standings', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))
    await askClaude('anything')

    const text = betaCreateMock.mock.calls[0]?.[0].system[0].text as string
    // Standings are decided on conference record, which the data does not
    // carry -- so the ordering is a win ranking and must be named as one.
    expect(flat(text)).toMatch(/not a conference table/)
    expect(flat(text)).toMatch(/projected-wins order and say so/)
  })

  it('blocks the "new coach, therefore worse" reading of the first-year effect', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))
    await askClaude('anything')

    const text = betaCreateMock.mock.calls[0]?.[0].system[0].text as string
    // The effect is a penalty for an unproven hire, not for changing coaches:
    // a proven hire is a measured null, not an absence of evidence.
    expect(flat(text)).toMatch(/does NOT believe "new coach, therefore worse"/)
    expect(text).toMatch(/UNPROVEN coach/)
    expect(flat(text)).toMatch(/projects roughly as though nothing happened/)
  })

  it('does not hardcode a season into the outlook rule', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))
    await askClaude('anything')

    const text = betaCreateMock.mock.calls[0]?.[0].system[0].text as string
    // get_season_outlook resolves the newest projected season from the data.
    // A season baked into the prompt here would go stale every July and would
    // override the one part of the tool designed not to.
    expect(flat(text)).toMatch(/Do NOT pass `season` unless the/)
    expect(flat(text)).toMatch(/the tool resolves the newest projected season itself/)
  })

  it('keeps the two lore variants byte-identical except for the lore block, and stable across calls', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))
    getLoreEnabledMock.mockResolvedValueOnce(true)
    await askClaude('anything')
    const withLore = betaCreateMock.mock.calls[0]?.[0].system[0].text as string

    resetClaudeForTests()
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))
    getLoreEnabledMock.mockResolvedValueOnce(false)
    await askClaude('anything')
    const withoutLore = betaCreateMock.mock.calls[1]?.[0].system[0].text as string

    // The only allowed difference is the lore block itself (plus its blank-line
    // separator) -- strip it out and the two variants must match exactly.
    const loreBlockPattern = /- Server lore[\s\S]*?point them at `\/lore off` -- it genuinely turns this off\.\n/
    expect(withLore.replace(loreBlockPattern, '')).toBe(withoutLore)

    // Cache-stability: repeated calls with the same lore setting must return
    // the exact same string instance's content (memoized, not rebuilt).
    betaCreateMock.mockResolvedValueOnce(apiResponse('answer'))
    getLoreEnabledMock.mockResolvedValueOnce(true)
    await askClaude('anything else')
    const withLoreAgain = betaCreateMock.mock.calls[2]?.[0].system[0].text as string
    expect(withLoreAgain).toBe(withLore)
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
      charts: [],
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

// Charts are extracted STRUCTURALLY from mcp_tool_use/mcp_tool_result blocks,
// never by regex over the answer text -- see src/claude.ts's extractCharts.
const CHART_URL = 'https://example.com/api/chart/team-playcalling.png?mode=light&season=2025&team=Oklahoma&sig=v1.abc123'

function chartToolBlocks(
  toolUseId: string,
  resultJson: Record<string, unknown> | null,
  isError = false,
  input: unknown = {}
) {
  return [
    { type: 'mcp_tool_use', id: toolUseId, name: 'render_chart', input, server_name: 'cfb' },
    {
      type: 'mcp_tool_result',
      tool_use_id: toolUseId,
      is_error: isError,
      content: [{ type: 'text', text: resultJson ? JSON.stringify(resultJson) : 'boom' }],
    },
  ]
}

const VALID_CHART_JSON = { _source: 'chart-renderer', chart: 'team-playcalling', url: CHART_URL, alt: 'Oklahoma playcalling chart' }

describe('askClaude chart extraction', () => {
  it('extracts a chart from a render_chart tool result in the final response', async () => {
    betaCreateMock.mockResolvedValueOnce({
      content: [...chartToolBlocks('t1', VALID_CHART_JSON), { type: 'text', text: 'Here you go.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    })

    const result = await askClaude('show me a chart')
    expect(result.charts).toEqual([{ url: CHART_URL, alt: 'Oklahoma playcalling chart' }])
  })

  it('accumulates chart blocks across a paused turn (chart lands in a non-final response)', async () => {
    betaCreateMock
      .mockResolvedValueOnce({
        content: [...chartToolBlocks('t1', VALID_CHART_JSON)],
        stop_reason: 'pause_turn',
        usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      })
      .mockResolvedValueOnce(apiResponse('Final answer, no more tool calls.'))

    const result = await askClaude('deep question with a chart')
    expect(result.charts).toEqual([{ url: CHART_URL, alt: 'Oklahoma playcalling chart' }])
  })

  it('discards the first run\'s chart on [ESCALATE] -- only the advisor rerun\'s chart survives', async () => {
    betaCreateMock
      .mockResolvedValueOnce({
        content: [...chartToolBlocks('t1', VALID_CHART_JSON), { type: 'text', text: 'Partial.\n[ESCALATE]' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      })
      .mockResolvedValueOnce(apiResponse('Advisor-grade answer, no chart this time.'))

    const result = await askClaude('sneaky-deep question with a chart')
    expect(result.escalated).toBe(true)
    expect(result.charts).toEqual([])
  })

  it('ignores an is_error mcp_tool_result even when it names render_chart', async () => {
    betaCreateMock.mockResolvedValueOnce({
      content: [...chartToolBlocks('t1', null, true), { type: 'text', text: 'Chart tool failed.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    })

    const result = await askClaude('question')
    expect(result.charts).toEqual([])
  })

  it('rejects a URL that is not under /api/chart/ or does not end in .png', async () => {
    const badUrls = [
      'https://example.com/api/other/team-playcalling.png',
      'https://example.com/api/chart/team-playcalling.jpg',
      'http://example.com/api/chart/team-playcalling.png', // not https
    ]
    for (const url of badUrls) {
      betaCreateMock.mockResolvedValueOnce({
        content: [...chartToolBlocks('t1', { url, alt: 'alt' }), { type: 'text', text: 'answer' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      })
      const result = await askClaude('question')
      expect(result.charts).toEqual([])
    }
  })

  it('accepts a chart URL on a foreign host but logs a warning (chartBaseUrl need not match MCP_URL)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const foreignUrl = 'https://charts.other-host.example/api/chart/team-playcalling.png?sig=v1.xyz'
    betaCreateMock.mockResolvedValueOnce({
      content: [...chartToolBlocks('t1', { url: foreignUrl, alt: 'alt' }), { type: 'text', text: 'answer' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    })

    const result = await askClaude('question')
    expect(result.charts).toEqual([{ url: foreignUrl, alt: 'alt' }])
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('other-host.example'))
    warnSpy.mockRestore()
  })

  it('caps more than one render_chart call at one chart', async () => {
    const secondUrl = 'https://example.com/api/chart/team-defense.png?sig=v1.def456'
    betaCreateMock.mockResolvedValueOnce({
      content: [
        ...chartToolBlocks('t1', VALID_CHART_JSON),
        ...chartToolBlocks('t2', { url: secondUrl, alt: 'Defense chart' }),
        { type: 'text', text: 'answer' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    })

    const result = await askClaude('question')
    expect(result.charts).toHaveLength(1)
    expect(result.charts[0]).toEqual({ url: CHART_URL, alt: 'Oklahoma playcalling chart' })
  })

  it('produces an empty charts array when no render_chart call was made', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('a plain answer'))
    const result = await askClaude('question')
    expect(result.charts).toEqual([])
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

  // Chart usage is folded into the same line (never a second console.log) so
  // that chart-shape counts can be derived from the existing per-question
  // logs -- see summarizeChartRequest in claude.ts.
  function loggedLlmLine(): Record<string, unknown> {
    const line = logSpy.mock.calls
      .map((call: unknown[]) => call[0])
      .find((l: unknown): l is string => typeof l === 'string' && l.includes('"evt":"llm"'))
    return JSON.parse(line as string) as Record<string, unknown>
  }

  it('includes chart fields, read structurally from the tool-use input, when render_chart was called and produced a chart', async () => {
    betaCreateMock.mockResolvedValueOnce({
      content: [
        ...chartToolBlocks('t1', VALID_CHART_JSON, false, {
          chart: 'team-metric-trend',
          metric: 'wins',
          teams: ['Oklahoma', 'Texas'],
        }),
        { type: 'text', text: 'Here you go.' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    })

    await askClaude('question')

    const parsed = loggedLlmLine()
    expect(parsed.chart).toBe('team-metric-trend')
    expect(parsed.chartMetric).toBe('wins')
    expect(parsed.chartTeamCount).toBe(2)
    expect(parsed.chartRendered).toBe(true)
  })

  it('counts a single `team` field (team-playcalling shape) as one team and omits chartMetric', async () => {
    betaCreateMock.mockResolvedValueOnce({
      content: [
        ...chartToolBlocks('t1', VALID_CHART_JSON, false, { chart: 'team-playcalling', team: 'Oklahoma' }),
        { type: 'text', text: 'Here you go.' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    })

    await askClaude('question')

    const parsed = loggedLlmLine()
    expect(parsed.chart).toBe('team-playcalling')
    expect(parsed.chartTeamCount).toBe(1)
    expect('chartMetric' in parsed).toBe(false)
  })

  it('omits every chart field when no render_chart call was made this turn', async () => {
    betaCreateMock.mockResolvedValueOnce(apiResponse('a plain answer'))

    await askClaude('question')

    const parsed = loggedLlmLine()
    expect('chart' in parsed).toBe(false)
    expect('chartMetric' in parsed).toBe(false)
    expect('chartTeamCount' in parsed).toBe(false)
    expect('chartRendered' in parsed).toBe(false)
  })

  it('logs chartRendered:false when render_chart was called but the result failed validation -- the interesting failure case', async () => {
    betaCreateMock.mockResolvedValueOnce({
      content: [
        ...chartToolBlocks('t1', null, true, { chart: 'team-metric-trend', metric: 'wins', teams: ['Oklahoma'] }),
        { type: 'text', text: 'Chart tool failed.' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    })

    await askClaude('question')

    const parsed = loggedLlmLine()
    expect(parsed.chart).toBe('team-metric-trend')
    expect(parsed.chartRendered).toBe(false)
  })

  it('never throws on a malformed render_chart input and falls back to safe defaults', async () => {
    const malformedInputs: unknown[] = ['not-an-object', null, 42, ['chart', 'team-metric-trend'], { teams: 'Oklahoma' }]

    for (const input of malformedInputs) {
      betaCreateMock.mockResolvedValueOnce({
        content: [...chartToolBlocks('t1', VALID_CHART_JSON, false, input), { type: 'text', text: 'answer' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      })

      await expect(askClaude('question')).resolves.toBeDefined()
      const parsed = loggedLlmLine()
      expect(parsed.chart).toBe('unknown')
      expect(parsed.chartTeamCount).toBe(0)
      expect('chartMetric' in parsed).toBe(false)
    }
  })

  it('describes the rerun, not the discarded first run, after an [ESCALATE] -- consistent with chartBlocks reassignment', async () => {
    betaCreateMock
      .mockResolvedValueOnce({
        content: [
          ...chartToolBlocks('t1', VALID_CHART_JSON, false, { chart: 'team-metric-trend', metric: 'wins', teams: ['Oklahoma'] }),
          { type: 'text', text: 'Partial.\n[ESCALATE]' },
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      })
      .mockResolvedValueOnce(apiResponse('Advisor-grade answer, no chart this time.'))

    await askClaude('question')

    const parsed = loggedLlmLine()
    expect(parsed.escalated).toBe(true)
    expect('chart' in parsed).toBe(false)
    expect('chartRendered' in parsed).toBe(false)
  })
})
