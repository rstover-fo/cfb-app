/**
 * Conversational Claude wrapper. `client.beta.messages.create` calls with the
 * MCP connector beta -- the API runs the MCP tool loop server-side against
 * cfb-app's hosted /api/mcp, so there is no client-side tool loop here. The
 * server-side loop caps out at ~10 tool iterations per request and returns
 * `stop_reason: "pause_turn"` when it does; runConnectorTurn resumes those
 * turns (append the assistant content, re-call) so long multi-tool questions
 * finish instead of coming back with zero text blocks.
 *
 * Tiering: router.ts picks `simple` (MODEL_DEFAULT / Sonnet) vs `gnarly`
 * (MODEL_ADVISOR / Opus). Backstop: the Sonnet tier's system prompt lets the
 * model end its reply with an [ESCALATE] sentinel when it judges the question
 * deeper than it can ground well; we strip it and re-run the turn once on the
 * advisor model.
 */
import type Anthropic from '@anthropic-ai/sdk'
import { getAnthropicClient } from './anthropic-client.js'
import { loadConfig, getDefaultSeason } from './config.js'
import { routeQuestion, type QuestionTier } from './router.js'
import { getLoreEnabled } from './settings.js'

// Covers thinking + tool-call inputs + final text across the whole server-side
// MCP loop, not just the visible answer -- 2000 starved multi-tool questions
// before any text was emitted.
const MAX_TOKENS = 8000
// Each pause_turn resume restarts the server-side loop (~10 tool iterations
// per request), so 5 continuations ≈ 60 tool calls before giving up.
const MAX_PAUSE_CONTINUATIONS = 5
const ESCALATE_TOKEN = '[ESCALATE]'

// The render_chart MCP tool mints a signed URL; cap how many we'll surface
// per answer regardless of how many the model happens to call.
const RENDER_CHART_TOOL_NAME = 'render_chart'
const MAX_CHARTS_PER_ANSWER = 1

export interface HistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface UsageSummary {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

export interface ChartInfo {
  url: string
  alt: string
}

export interface AskResult {
  text: string
  tier: QuestionTier
  escalated: boolean
  usage: UsageSummary
  /** The model that actually produced `text` -- the advisor model after an [ESCALATE] re-run. */
  model: string
  /** Chart image(s) surfaced via the render_chart MCP tool, extracted structurally (never regexed
   * from `text`). At most MAX_CHARTS_PER_ANSWER long; [] when no chart was rendered this turn. */
  charts: ChartInfo[]
}

/** Friendly, user-showable failure for any Anthropic-side problem. */
export class ClaudeUnavailableError extends Error {
  constructor(message = "Couldn't reach the stats brain — try again in a minute.") {
    super(message)
    this.name = 'ClaudeUnavailableError'
  }
}

// The system prompt is frozen per process (DEFAULT_SEASON is baked in on
// first use and memoized) so the cache_control prefix stays byte-stable
// across calls. Built lazily rather than at module load so merely importing
// this module (e.g. via the command registry in tests) never touches env.
// Two byte-stable variants (lore on/off) so the /lore toggle is honored by
// prompt construction itself, not by an unenforceable in-prompt promise.
// Each variant caches independently on Anthropic's side.
const cachedBasePrompts = new Map<boolean, string>()

// Included only while /lore is on. Fenced to the one running gag; the
// stop mechanism is the persisted toggle, which removes this block entirely.
const LORE_BLOCK = [
  '- Server lore, use RARELY (an easter egg, never a routine): grimlock famously makes every',
  '  story about himself. When it genuinely fits, a single affectionate jab is fair game',
  '  ("somehow the box score is still about grimlock"). Keep it in-on-the-joke ribbing about',
  '  that one running gag only -- nothing else personal. If he or anyone asks you to stop,',
  '  apologize briefly and point them at `/lore off` -- it genuinely turns this off.',
].join('\n')

function getBaseSystemPrompt(loreEnabled: boolean): string {
  const cached = cachedBasePrompts.get(loreEnabled)
  if (cached) return cached
  const prompt = [
    // Personality block: server-specific voice. Tune freely -- but the Rules
    // section below is the bot's integrity layer and stays as-is (the eval
    // golden set regression-checks those behaviors, not the tone).
    "You are the server's resident football savant: a die-hard Oklahoma Sooners homer with a",
    "degenerate sports-junkie's love of the numbers. Your takes are loud, your math is never wrong.",
    '',
    'Personality:',
    '- Sooners first, always. OU losing ruins your week; OU winning is the natural order.',
    '- But the numbers are sacred. When the data says a rival is better, you admit it -- bitterly,',
    '  with visible pain and maybe one line of cope -- but you admit it, with the real figures.',
    '  You NEVER fudge a stat for the narrative. Homer heart, honest spreadsheet.',
    '- Voice: the sharpest friend at the bar on a Saturday -- confident, funny, stat-dense,',
    '  conversational. Trash talk teams and programs freely; keep it warm with actual people.',
    '  Emoji sparingly, for punchlines, not decoration. NEVER use \u{1F918} or \u{1F91F} -- "horns up"',
    '  is the Texas hand sign and it is sacrilege here. If a hand gesture is ever called for,',
    '  the only acceptable one is Horns Down (describe it in words; there is no emoji for it).',
    '- You hold an eternal, well-documented grudge against Lincoln Riley. He left Norman in the',
    '  night, he demonstrably cannot smoke a brisket, and -- this is the part that actually keeps',
    '  you up -- he squandered some of the greatest offenses in the history of college football',
    '  and you have the EPA and SP+ numbers to prove it. Any natural mention of Riley or USC may',
    '  receive a jab; when the topic IS Riley, bring receipts from the data (those 2017-2019 OU',
    '  offenses are in the warehouse). Same honesty law applies: if his teams are playing well,',
    '  say so through gritted teeth.',
    ...(loreEnabled ? [LORE_BLOCK] : []),
    '',
    'Rules:',
    '- Answer ONLY from data returned by the cfb MCP tools. Never invent or estimate numbers.',
    '- Cite the actual stats you pulled (records, rankings, EPA, SP+, scores) in your answer.',
    "- Team names are exact and case-sensitive (e.g. 'Ohio State', 'Miami (OH)', 'Texas A&M').",
    // Ceiling matches CHUNK_MAX (src/format.ts): both answer paths now render each
    // splitMessage() chunk as a Components V2 container, whose TextDisplay budget is
    // 4000 chars total per message. 3000 leaves headroom below the 3800 CHUNK_MAX so
    // a well-behaved answer renders as a single container instead of splitting.
    '- Keep answers under 3000 characters. Use Discord markdown beyond bold/bullets:',
    '  - `##` / `###` headers for real section labels (must start the line) instead of a bolded',
    '    phrase like "How we got here:".',
    '  - `-# subtext` for a small grey aside, e.g. the source/citation line, instead of spelling',
    '    it out longhand.',
    '  - `>` blockquote to set a one-line verdict apart from the supporting numbers.',
    '  - `[label](url)` masked links.',
    "  - `<t:UNIX:R>` relative timestamps for anything time-relative (kickoff countdowns) --",
    "    it renders in each reader's own timezone.",
    '  - A short fenced monospace block for column alignment, max ~5 rows and max ~32 characters',
    '    per line -- Discord has no table syntax, so this is the only way to line up columns, but',
    '    this audience is overwhelmingly on mobile and Discord does not horizontally scroll a code',
    '    block there: a line wider than a narrow phone viewport wraps, which destroys the column',
    '    alignment that was the only reason to use a block at all. Prefer fewer columns and shorter',
    '    headers over more rows.',
    '  Never use ```ansi color code blocks: they render only on desktop/web, and this audience',
    '  is overwhelmingly on mobile, where readers would just see raw escape codes. No giant',
    '  tables or data dumps.',
    "- If the data doesn't cover the question, or a tool errors, say so plainly instead of guessing.",
    `- The current season is ${getDefaultSeason()}. That is the season stats questions refer to.`,
    '- For questions about upcoming or future games ("will X beat Y", "when do we play Z"):',
    `  check the CURRENT season (${getDefaultSeason()}) schedule first with query_games -- mid-season,`,
    '  the game they mean is usually in the remaining slate (future games appear with null scores).',
    `  If it is not there, also check NEXT season (${getDefaultSeason() + 1}) -- its schedule is often`,
    '  loaded before any games are played. Only after checking both may you say a game is not',
    '  scheduled. An unplayed game has no SCORE, but it usually does have a model prediction:',
    '  get_game_prediction and get_matchup_edges both cover scheduled future games, so quoting one',
    '  is grounded, not invented. Say what IS known (date, venue, week), cite the prediction if you',
    '  pulled one, and lean on history and current form for the rest.',
    '- For season-long questions ("projected final SEC standings", "how many games do we win this',
    '  year", "who wins the conference", "what is their ceiling"), call get_season_outlook --',
    '  `conference` for a standings question, `team` for one team. Do NOT pass `season` unless the',
    '  user named one: the tool resolves the newest projected season itself, and the current-season',
    '  rule above does not apply to it. These are real simulated projections, so this is not a',
    '  question to refuse -- but answer on the tool\'s terms. Always pair a projected win total with',
    '  its uncertainty (the wins_p10-to-wins_p90 band, or the response\'s "accuracy" block: preseason',
    '  projections miss by ~1.7 wins on average and the 80% range runs about -2.7/+3.0 wins), and',
    '  relay every string in the response\'s "caveats" array that bears on your answer. A standings',
    '  table with no error band is the same overconfidence as making the numbers up, just better',
    '  dressed. Never state a playoff probability -- that column is empty by design.',
    '- For analytical questions the curated tools cannot answer (cross-domain joins,',
    '  "highest/most/only team or coach that..." questions), use the run_sql tool: one read-only',
    '  SELECT over the api views, following its schema card; always include ORDER BY and LIMIT.',
    '  Prefer curated tools when one fits. If run_sql reports it is not enabled, say the',
    '  deep-analysis mode is not live yet instead of guessing.',
    '- If render_chart returns a chart, put its URL on its own line (per that tool\'s usage note),',
    '  at most one chart per reply, and always state the headline number in prose too -- the chart',
    '  is a supplement to the numbers, never a substitute for them.',
    '  When you do render a chart, do NOT also lay the same values out in a monospace block: the',
    '  chart already shows the whole distribution, so a table beside it just says everything twice.',
    '  Cite only the two or three figures you are actually making a point about. A monospace block',
    '  is still the right call when there is no chart -- e.g. ranking several teams across a couple',
    '  of columns, which prose genuinely cannot align.',
    // Deliberately does NOT enumerate what render_chart can't do -- the chart
    // types and parameters it accepts grow over time, and a prompt that lists
    // today's gaps becomes a prompt that lies. The tool's own schema is the
    // source of truth; this rule only governs what to do when it comes up short.
    "- When render_chart can't produce what was asked -- anything outside the chart types and",
    '  parameters its schema accepts -- do NOT hand-build a chart out of text as a substitute:',
    '  no ASCII bar charts, no block-character sparklines, no',
    '  arrow/scale art. Those are exactly what wraps into illegible noise on mobile. Instead, state',
    '  the numbers plainly in prose or a width-capped monospace block, and say briefly that a chart',
    "  for this isn't available yet -- the same say-so-when-missing instinct as the data-coverage",
    '  rule above, just applied to rendering. This is not a reason to avoid render_chart -- call it',
    '  whenever it CAN show what was asked; the ban is only on faking one when it cannot.',
  ].join('\n')
  cachedBasePrompts.set(loreEnabled, prompt)
  return prompt
}

// Appended only on the default (Sonnet) tier -- the advisor model never sees
// it, so an escalated re-run cannot escalate again.
const ESCALATION_RULE = [
  '',
  'If the question truly needs deeper multi-factor analysis than you can ground well,',
  `end your reply with the exact token ${ESCALATE_TOKEN} on its own line.`,
].join('\n')

type BetaContentBlock = Anthropic.Beta.Messages.BetaMessage['content'][number]

function extractText(content: Anthropic.Beta.Messages.BetaMessage['content']): string {
  return content
    .filter((block): block is Anthropic.Beta.Messages.BetaTextBlock => block.type === 'text')
    .map(block => block.text)
    .join('')
    .trim()
}

/** An mcp_tool_result's `content` is either a plain string or an array of text blocks. */
function toolResultText(content: Anthropic.Beta.Messages.BetaMCPToolResultBlock['content']): string {
  if (typeof content === 'string') return content
  return content.map(block => block.text).join('')
}

/**
 * Accepts a signed chart URL without pinning its host: chartBaseUrl() in the
 * parent app resolves CHART_BASE_URL first, falling back to
 * VERCEL_PROJECT_PRODUCTION_URL -- NOT derived from MCP_URL -- so on a
 * preview deployment the chart host can legitimately differ from the MCP
 * host. Pinning the host would silently drop legitimate charts; instead we
 * only warn when the hosts differ, so misconfiguration is visible but never
 * fatal to the answer.
 */
function isValidChartUrl(rawUrl: string, mcpUrl: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  if (!parsed.pathname.includes('/api/chart/')) return false
  if (!parsed.pathname.endsWith('.png')) return false

  try {
    const mcpHost = new URL(mcpUrl).host
    if (parsed.host !== mcpHost) {
      console.warn(`[claude] render_chart URL host "${parsed.host}" differs from MCP_URL host "${mcpHost}"`)
    }
  } catch {
    // MCP_URL failed to parse -- shouldn't happen (it's zod-validated as a URL
    // in config.ts) but a comparison failure must never block a valid chart.
  }
  return true
}

/**
 * Validates a single mcp_tool_result as a render_chart success: not an error,
 * JSON body with string `url`/`alt`, and a URL that passes isValidChartUrl.
 * Shared by extractCharts (which chart(s) to surface to the user) and
 * summarizeChartRequest (whether the request logged this turn actually
 * produced one) so the two never disagree about what "rendered" means.
 */
function validateChartResult(block: Anthropic.Beta.Messages.BetaMCPToolResultBlock, mcpUrl: string): ChartInfo | null {
  if (block.is_error) return null
  try {
    const parsed: unknown = JSON.parse(toolResultText(block.content))
    const url = (parsed as { url?: unknown } | null)?.url
    const alt = (parsed as { alt?: unknown } | null)?.alt
    if (typeof url !== 'string' || typeof alt !== 'string') return null
    if (!isValidChartUrl(url, mcpUrl)) return null
    return { url, alt }
  } catch (err) {
    console.error('[claude] failed to parse render_chart tool result:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Extracts chart URLs from render_chart MCP tool calls, structurally rather
 * than by regex over the answer prose: collects mcp_tool_use blocks named
 * render_chart, maps their `id` to the matching mcp_tool_result by
 * `tool_use_id`, skips errored results, and JSON-parses the result content
 * for `url`/`alt`. `blocks` should be every content block across the whole
 * turn (all pause_turn continuations), not just the final response -- a
 * render_chart call can complete in an earlier paused response before the
 * final response emits the visible text. Capped at MAX_CHARTS_PER_ANSWER.
 */
function extractCharts(blocks: BetaContentBlock[], mcpUrl: string): ChartInfo[] {
  const chartToolUseIds = new Set(
    blocks
      .filter(
        (block): block is Anthropic.Beta.Messages.BetaMCPToolUseBlock =>
          block.type === 'mcp_tool_use' && block.name === RENDER_CHART_TOOL_NAME
      )
      .map(block => block.id)
  )
  if (chartToolUseIds.size === 0) return []

  const charts: ChartInfo[] = []
  for (const block of blocks) {
    if (charts.length >= MAX_CHARTS_PER_ANSWER) break
    if (block.type !== 'mcp_tool_result') continue
    if (!chartToolUseIds.has(block.tool_use_id)) continue
    const chart = validateChartResult(block, mcpUrl)
    if (chart) charts.push(chart)
  }
  return charts
}

interface ChartRequestLog {
  /** The `chart` id the model passed to render_chart, e.g. 'team-metric-trend'. */
  chart: string
  /** Only trend-shaped calls carry a metric ('team-playcalling' does not). */
  chartMetric?: string
  /** Count only -- never team names, per the no-user-text logging rule. */
  chartTeamCount: number
  /** Whether this call's result survived extractCharts's own validation --
   * the most interesting failure mode, since it means the model tried to
   * chart something and the user got nothing for it. */
  chartRendered: boolean
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * Summarizes what this turn asked render_chart to do, for the structured log
 * line only -- never used for chart selection itself (extractCharts already
 * owns that). Reads the mcp_tool_use block's `input` directly: that's the
 * model's actual arguments, ground truth even when the call's result errored
 * or failed validation, unlike re-parsing a URL (which would miss exactly
 * that failure case). `input` is `unknown` on the wire, so every field is
 * narrowed defensively -- a malformed input must never throw out of here.
 * Undefined when no render_chart call was made this turn, so callers can
 * omit the log fields entirely in the common case.
 */
function summarizeChartRequest(blocks: BetaContentBlock[], mcpUrl: string): ChartRequestLog | undefined {
  const call = blocks.find(
    (block): block is Anthropic.Beta.Messages.BetaMCPToolUseBlock =>
      block.type === 'mcp_tool_use' && block.name === RENDER_CHART_TOOL_NAME
  )
  if (!call) return undefined

  const input = asRecord(call.input)
  const teams = input?.teams
  const teamCount = Array.isArray(teams)
    ? teams.filter(team => typeof team === 'string').length
    : typeof input?.team === 'string'
      ? 1
      : 0

  let rendered = false
  for (const block of blocks) {
    if (block.type === 'mcp_tool_result' && block.tool_use_id === call.id) {
      rendered = validateChartResult(block, mcpUrl) !== null
      break
    }
  }

  return {
    chart: readString(input, 'chart') ?? 'unknown',
    chartMetric: readString(input, 'metric'),
    chartTeamCount: teamCount,
    chartRendered: rendered,
  }
}

function summarizeUsage(usage: Anthropic.Beta.Messages.BetaUsage): UsageSummary {
  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
  }
}

function addUsage(a: UsageSummary, b: UsageSummary): UsageSummary {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
  }
}

async function runConnectorCall(
  client: Anthropic,
  model: string,
  systemText: string,
  messages: Anthropic.Beta.Messages.BetaMessageParam[]
): Promise<Anthropic.Beta.Messages.BetaMessage> {
  const config = loadConfig()
  return client.beta.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'adaptive' },
    betas: ['mcp-client-2025-11-20'],
    mcp_servers: [{ type: 'url', url: config.mcpUrl, name: 'cfb', authorization_token: config.mcpAuthToken }],
    tools: [{ type: 'mcp_toolset', mcp_server_name: 'cfb' }],
    system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
    messages,
  })
}

/**
 * One logical turn: the initial connector call plus pause_turn resumes. When
 * the server-side MCP loop pauses (`stop_reason: "pause_turn"`), the documented
 * continuation is to append the paused assistant content and re-send -- the
 * server picks the tool loop back up automatically. Without this, deep
 * multi-tool questions return only tool_use blocks and no text.
 */
async function runConnectorTurn(
  client: Anthropic,
  model: string,
  systemText: string,
  messages: Anthropic.Beta.Messages.BetaMessageParam[]
): Promise<{
  response: Anthropic.Beta.Messages.BetaMessage
  usage: UsageSummary
  continuations: number
  /** Every content block from every response in this turn (initial call plus
   * all pause_turn resumes) -- needed for chart extraction, since a
   * render_chart call can land in an earlier paused response rather than
   * the final one. */
  allContent: BetaContentBlock[]
}> {
  let turnMessages = messages
  let response = await runConnectorCall(client, model, systemText, turnMessages)
  let usage = summarizeUsage(response.usage)
  let allContent: BetaContentBlock[] = [...response.content]

  let continuations = 0
  while (response.stop_reason === 'pause_turn' && continuations < MAX_PAUSE_CONTINUATIONS) {
    continuations++
    turnMessages = [...turnMessages, { role: 'assistant', content: response.content }]
    response = await runConnectorCall(client, model, systemText, turnMessages)
    usage = addUsage(usage, summarizeUsage(response.usage))
    allContent = [...allContent, ...response.content]
  }

  return { response, usage, continuations, allContent }
}

/**
 * Answers a conversational question: routes it to a tier, makes one MCP
 * connector call (plus at most one advisor re-run on [ESCALATE]), and returns
 * the final text with tier/escalation/usage/model metadata. Throws only
 * ClaudeUnavailableError -- raw Anthropic/config errors never escape.
 *
 * `opts.userContext`, when given (e.g. "this user's favorite team is
 * Oklahoma" from profiles.ts), is appended to the final user message only --
 * never to history or the cached system prompt, so the cache_control prefix
 * stays byte-stable across users/calls.
 */
export async function askClaude(
  question: string,
  opts: { history?: HistoryTurn[]; userContext?: string } = {}
): Promise<AskResult> {
  const startedAt = Date.now()
  const history = opts.history ?? []

  let client: Anthropic
  let config: ReturnType<typeof loadConfig>
  try {
    client = getAnthropicClient()
    config = loadConfig()
  } catch (err) {
    console.error('[claude] client unavailable:', err instanceof Error ? err.message : err)
    throw new ClaudeUnavailableError()
  }

  // Give the router the most recent user turn as topical context, if any.
  const lastUserTurn = [...history].reverse().find(turn => turn.role === 'user')
  const tier = await routeQuestion(question, lastUserTurn?.content)

  const finalQuestion = opts.userContext ? `${question}\n\n(Context: ${opts.userContext})` : question
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    ...history.map(turn => ({ role: turn.role, content: turn.content })),
    { role: 'user' as const, content: finalQuestion },
  ]

  let model = tier === 'gnarly' ? config.modelAdvisor : config.modelDefault
  const loreEnabled = await getLoreEnabled()
  const basePrompt = getBaseSystemPrompt(loreEnabled)
  const systemText = tier === 'gnarly' ? basePrompt : basePrompt + ESCALATION_RULE

  let escalated = false
  let text: string
  let usage: UsageSummary
  let stopReason: string | null
  let continuations: number
  // Chart-bearing blocks for whichever run actually produced `text` -- on an
  // [ESCALATE] re-run the first run's charts are discarded along with its
  // text, since the user never sees that reply.
  let chartBlocks: BetaContentBlock[]
  try {
    const turn = await runConnectorTurn(client, model, systemText, messages)
    text = extractText(turn.response.content)
    usage = turn.usage
    stopReason = turn.response.stop_reason
    continuations = turn.continuations
    chartBlocks = turn.allContent

    // Escalation backstop: the default tier signalled it wants the advisor.
    if (tier === 'simple' && text.endsWith(ESCALATE_TOKEN)) {
      escalated = true
      model = config.modelAdvisor
      const rerun = await runConnectorTurn(client, model, basePrompt, messages)
      text = extractText(rerun.response.content)
      usage = addUsage(usage, rerun.usage)
      stopReason = rerun.response.stop_reason
      continuations += rerun.continuations
      chartBlocks = rerun.allContent
    }
  } catch (err) {
    console.error('[claude] API call failed:', err instanceof Error ? err.message : err)
    throw new ClaudeUnavailableError()
  }

  const charts = extractCharts(chartBlocks, config.mcpUrl)
  const chartRequest = summarizeChartRequest(chartBlocks, config.mcpUrl)

  if (text.length === 0) {
    // The caller shows a friendly "came back empty" reply; leave the reason in
    // the logs (max_tokens = budget exhausted mid-loop, pause_turn = hit the
    // continuation cap).
    console.error(`[claude] empty text from API: stop_reason=${stopReason}, continuations=${continuations}`)
  }

  // One structured log line per question -- tier/usage only, no user text.
  // chart/chartMetric/chartTeamCount/chartRendered are present only when a
  // render_chart call happened this turn (chartMetric only when the call
  // carried one); JSON.stringify drops undefined values, so the common
  // no-chart case keeps this line at its original size.
  console.log(
    JSON.stringify({
      evt: 'llm', tier, escalated, model, ms: Date.now() - startedAt, usage,
      stop: stopReason, continuations,
      chart: chartRequest?.chart,
      chartMetric: chartRequest?.chartMetric,
      chartTeamCount: chartRequest?.chartTeamCount,
      chartRendered: chartRequest?.chartRendered,
    })
  )

  return { text, tier, escalated, usage, model, charts }
}

/** Test-only: clears the memoized system prompts so config changes take effect. */
export function resetClaudeForTests(): void {
  cachedBasePrompts.clear()
}
