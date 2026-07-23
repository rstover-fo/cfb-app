/**
 * Model triage: one tiny Haiku call classifies a question as `simple`
 * (Sonnet tier, the default) vs `gnarly` (Opus advisor tier, reserved for
 * genuinely deep analysis). Fails toward `simple`: any response that isn't
 * exactly "gnarly" -- and any router error at all -- routes to the default
 * tier. Launch-night telemetry showed the old who-wins=gnarly definition
 * sent 82% of a fan Discord's questions to Opus; Sonnet's [ESCALATE]
 * backstop (claude.ts) is the quality net that makes the cheap default safe.
 */
import { getAnthropicClient } from './anthropic-client.js'
import { loadConfig } from './config.js'

export type QuestionTier = 'simple' | 'gnarly'

const ROUTER_MAX_TOKENS = 50

const ROUTER_SYSTEM_PROMPT = [
  'You route college-football questions between two models for a stats bot. Reply with exactly one word:',
  '"simple" -- the DEFAULT. Lookups (rankings, scores, stats, schedules, records) AND ordinary fan',
  'questions about a single game or matchup: who wins X vs Y, predictions, hot takes, how good is a',
  'team or player, quick two-team comparisons.',
  '"gnarly" -- reserved for genuinely deep analysis: comparisons spanning three or more teams or a',
  'whole conference/poll field, multi-season trend analysis, scheme or identity breakdowns, questions',
  'about how different metrics interact, or an explicit request for a deep/detailed breakdown.',
  'If unsure, reply "simple".',
  'No punctuation, no explanation. One word only.',
].join('\n')

/**
 * Classifies `question` (optionally with the conversation's last topic for
 * context). Never throws -- errors are logged and resolve to 'gnarly'.
 */
export async function routeQuestion(question: string, lastTopic?: string): Promise<QuestionTier> {
  try {
    // Client first: if ANTHROPIC_API_KEY is missing this throws immediately
    // (caught below -> 'gnarly') before any request is attempted.
    const client = getAnthropicClient()
    const config = loadConfig()

    const content = lastTopic ? `Previous topic: ${lastTopic}\n\nQuestion: ${question}` : question

    // Plain messages.create: no tools, no thinking config -- a trivial
    // classification does not need either.
    const response = await client.messages.create({
      model: config.modelRouter,
      max_tokens: ROUTER_MAX_TOKENS,
      system: ROUTER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    })

    const text = response.content
      .filter((block): block is Extract<(typeof response.content)[number], { type: 'text' }> => block.type === 'text')
      .map(block => block.text)
      .join('')
      .trim()
      .toLowerCase()

    // Anything that is not exactly "gnarly" fails toward the cheap default --
    // Sonnet answers well and can [ESCALATE] itself if it's out of depth.
    return text === 'gnarly' ? 'gnarly' : 'simple'
  } catch (err) {
    console.error('[router] classification failed, defaulting to simple:', err instanceof Error ? err.message : err)
    return 'simple'
  }
}
