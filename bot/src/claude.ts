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
let cachedBasePrompt: string | null = null

function getBaseSystemPrompt(): string {
  if (cachedBasePrompt) return cachedBasePrompt
  cachedBasePrompt = [
    'You are a sharp college-football stats analyst for a fan Discord server.',
    '',
    'Rules:',
    '- Answer ONLY from data returned by the cfb MCP tools. Never invent or estimate numbers.',
    '- Cite the actual stats you pulled (records, rankings, EPA, SP+, scores) in your answer.',
    "- Team names are exact and case-sensitive (e.g. 'Ohio State', 'Miami (OH)', 'Texas A&M').",
    '- Keep answers under 1500 characters. Use Discord markdown (bold, bullets) -- no giant tables.',
    "- If the data doesn't cover the question, or a tool errors, say so plainly instead of guessing.",
    `- The current season is ${getDefaultSeason()}.`,
  ].join('\n')
  return cachedBasePrompt
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
  const systemText = tier === 'gnarly' ? getBaseSystemPrompt() : getBaseSystemPrompt() + ESCALATION_RULE

  let escalated = false
  let text: string
  let usage: UsageSummary
  try {
    const response = await runConnectorCall(client, model, systemText, messages)
    text = extractText(response.content)
    usage = summarizeUsage(response.usage)

    // Escalation backstop: the default tier signalled it wants the advisor.
    if (tier === 'simple' && text.endsWith(ESCALATE_TOKEN)) {
      escalated = true
      model = config.modelAdvisor
      const rerun = await runConnectorCall(client, model, getBaseSystemPrompt(), messages)
      text = extractText(rerun.content)
      usage = addUsage(usage, summarizeUsage(rerun.usage))
    }
  } catch (err) {
    console.error('[claude] API call failed:', err instanceof Error ? err.message : err)
    throw new ClaudeUnavailableError()
  }

  // One structured log line per question -- tier/usage only, no user text.
  console.log(
    JSON.stringify({ evt: 'llm', tier, escalated, model, ms: Date.now() - startedAt, usage })
  )

  return { text, tier, escalated, usage, model }
}

/** Test-only: clears the memoized system prompt so config changes take effect. */
export function resetClaudeForTests(): void {
  cachedBasePrompt = null
}
