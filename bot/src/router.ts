/**
 * Model triage: one tiny Haiku call classifies a question as `simple`
 * (cheap lookup -> Sonnet tier) vs `gnarly` (real analysis -> Opus advisor
 * tier). Deliberately fail-open toward quality: any response that isn't
 * exactly "simple" -- and any router error at all -- routes to `gnarly`.
 */
import { getAnthropicClient } from './anthropic-client.js'
import { loadConfig } from './config.js'

export type QuestionTier = 'simple' | 'gnarly'

const ROUTER_MAX_TOKENS = 50

const ROUTER_SYSTEM_PROMPT = [
  'You classify college-football questions for a stats bot. Reply with exactly one word:',
  '"simple" -- a lookup: rankings, scores, a single stat, schedules, records, one team/player fact.',
  '"gnarly" -- analysis: who-wins-and-why, multi-team or scheme comparisons, predictions, trends,',
  'anything needing synthesis across several stats.',
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

    // Anything that is not exactly "simple" fails toward quality.
    return text === 'simple' ? 'simple' : 'gnarly'
  } catch (err) {
    console.error('[router] classification failed, defaulting to gnarly:', err instanceof Error ? err.message : err)
    return 'gnarly'
  }
}
