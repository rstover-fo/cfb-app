/**
 * Conversational Claude wrapper. One `client.beta.messages.create` call per
 * user turn with the MCP connector beta -- the API runs the entire MCP tool
 * loop server-side against cfb-app's hosted /api/mcp, so there is no
 * client-side tool loop here.
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

const MAX_TOKENS = 2000
const ESCALATE_TOKEN = '[ESCALATE]'

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

export interface AskResult {
  text: string
  tier: QuestionTier
  escalated: boolean
  usage: UsageSummary
  /** The model that actually produced `text` -- the advisor model after an [ESCALATE] re-run. */
  model: string
  /**
   * Bare MCP tool names invoked while answering (e.g. 'run_sql'), deduped,
   * first-seen order. On an [ESCALATE] re-run this is the union of both
   * calls' tools (mirrors how usage is summed).
   */
  toolsUsed: string[]
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
    '- Keep answers under 1500 characters. Use Discord markdown (bold, bullets) -- no giant tables.',
    "- If the data doesn't cover the question, or a tool errors, say so plainly instead of guessing.",
    `- The current season is ${getDefaultSeason()}. That is the season stats questions refer to.`,
    '- For questions about upcoming or future games ("will X beat Y", "when do we play Z"):',
    `  check the CURRENT season (${getDefaultSeason()}) schedule first with query_games -- mid-season,`,
    '  the game they mean is usually in the remaining slate (future games appear with null scores).',
    `  If it is not there, also check NEXT season (${getDefaultSeason() + 1}) -- its schedule is often`,
    '  loaded before any games are played. Only after checking both may you say a game is not',
    '  scheduled. Unplayed games have no scores or predictions -- say what IS known (date, venue,',
    '  week) and lean on history/current form for the outlook.',
    '- For analytical questions the curated tools cannot answer (cross-domain joins,',
    '  "highest/most/only team or coach that..." questions), use the run_sql tool: one read-only',
    '  SELECT over the api views, following its schema card; always include ORDER BY and LIMIT.',
    '  Prefer curated tools when one fits. If run_sql reports it is not enabled, say the',
    '  deep-analysis mode is not live yet instead of guessing.',
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

function extractText(content: Anthropic.Beta.Messages.BetaMessage['content']): string {
  return content
    .filter((block): block is Anthropic.Beta.Messages.BetaTextBlock => block.type === 'text')
    .map(block => block.text)
    .join('')
    .trim()
}

function extractToolNames(content: Anthropic.Beta.Messages.BetaMessage['content']): string[] {
  return content
    .filter((block): block is Anthropic.Beta.Messages.BetaMCPToolUseBlock => block.type === 'mcp_tool_use')
    .map(block => block.name)
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
  let toolsUsed: string[]
  try {
    const response = await runConnectorCall(client, model, systemText, messages)
    text = extractText(response.content)
    usage = summarizeUsage(response.usage)
    toolsUsed = [...new Set(extractToolNames(response.content))]

    // Escalation backstop: the default tier signalled it wants the advisor.
    if (tier === 'simple' && text.endsWith(ESCALATE_TOKEN)) {
      escalated = true
      model = config.modelAdvisor
      const rerun = await runConnectorCall(client, model, basePrompt, messages)
      text = extractText(rerun.content)
      usage = addUsage(usage, summarizeUsage(rerun.usage))
      toolsUsed = [...new Set([...toolsUsed, ...extractToolNames(rerun.content)])]
    }
  } catch (err) {
    console.error('[claude] API call failed:', err instanceof Error ? err.message : err)
    throw new ClaudeUnavailableError()
  }

  // One structured log line per question -- tier/usage only, no user text.
  console.log(
    JSON.stringify({ evt: 'llm', tier, escalated, model, ms: Date.now() - startedAt, usage })
  )

  return { text, tier, escalated, usage, model, toolsUsed }
}

/** Test-only: clears the memoized system prompts so config changes take effect. */
export function resetClaudeForTests(): void {
  cachedBasePrompts.clear()
}
