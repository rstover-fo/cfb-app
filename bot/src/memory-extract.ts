/**
 * Long-term memory extraction: after each successful conversational turn, a
 * fire-and-forget Haiku call (same cheap tier as router.ts, same
 * not-metered-by-limits.ts precedent) decides whether the exchange revealed
 * anything durable about THE USER -- a preference, a fact, a take -- and
 * writes it through memory-store.ts. The common case is nothing.
 *
 * Failure contract mirrors router.ts: any error anywhere (missing API key,
 * network, malformed JSON, storage write) is logged and swallowed. This
 * path must never reject, throw, or delay the answer the user already got.
 * Logging follows the no-user-text rule: counts and usage only, never atom
 * content.
 */
import { z } from 'zod'
import { getAnthropicClient } from './anthropic-client.js'
import { loadConfig } from './config.js'
import { getMemoryEnabled } from './profiles.js'
import { listAtoms, applyExtraction, type ExtractedAtom } from './memory-store.js'

const EXTRACT_MAX_TOKENS = 300
/** Answers are capped at ~3000 chars by the system prompt; trim runaways so the cheap call stays cheap. */
const ANSWER_SLICE_CHARS = 1500

const EXTRACT_SYSTEM_PROMPT = [
  'You maintain long-term memory for a college-football Discord bot. You receive one Q&A exchange',
  "plus the user's existing memory atoms. Reply with STRICT JSON only, no markdown fences, matching:",
  '{"atoms":[{"content":string,"kind":"preference"|"fact"|"take","replaces":string|null}]}',
  'Rules:',
  '- Return {"atoms":[]} unless something is clearly worth remembering for months. That is the',
  '  common case: most exchanges are stats questions that reveal nothing durable.',
  '- Atoms are durable statements about THE USER only: preferences (teams/players they love or',
  '  hate, how they like answers formatted), facts (alma mater, where they live, leagues they',
  '  play in), takes (opinions they consistently hold).',
  '- NEVER store CFB trivia, scores, stats, schedules, or anything true of the world rather than',
  '  of the user. Asking about a team once is not a preference.',
  '- Max 3 atoms. Each under 120 characters, third person, present tense ("Hates Texas",',
  '  "Prefers short answers", "Went to Oklahoma State").',
  '- If a new atom updates or duplicates an existing atom, set "replaces" to that atom\'s id.',
].join('\n')

const ExtractionSchema = z.object({
  atoms: z
    .array(
      z.object({
        content: z.string().min(1).max(200),
        kind: z.enum(['preference', 'fact', 'take']),
        replaces: z.string().nullish(),
      })
    )
    .max(3),
})

/** Tolerates a model that wraps its JSON in a ```json fence despite instructions. */
function stripFence(text: string): string {
  const trimmed = text.trim()
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed)
  return match ? match[1]! : trimmed
}

/**
 * Fire-and-forget: kicks off extraction for a completed turn and returns
 * immediately. Never throws and never leaves an unhandled rejection.
 */
export function extractMemories(params: { userId: string; question: string; answer: string }): void {
  void runExtraction(params).catch(err => {
    // runExtraction catches everything itself; this is a belt-and-suspenders
    // backstop so no code path can ever surface an unhandled rejection.
    console.error('[memory-extract] unexpected rejection:', err instanceof Error ? err.message : err)
  })
}

/** Exported for tests only (deterministic awaiting); production code calls extractMemories(). */
export async function runExtraction({ userId, question, answer }: { userId: string; question: string; answer: string }): Promise<void> {
  try {
    if (!(await getMemoryEnabled(userId))) return

    const existing = await listAtoms(userId)
    // Client first: a missing ANTHROPIC_API_KEY throws here (caught below)
    // before any storage write or network attempt.
    const client = getAnthropicClient()
    const config = loadConfig()

    const existingLines =
      existing.length > 0 ? existing.map(atom => `${atom.id}: ${atom.content}`).join('\n') : '(none)'
    const content = [
      `Existing atoms (id: content):`,
      existingLines,
      '',
      `Question: ${question}`,
      '',
      `Answer: ${answer.slice(0, ANSWER_SLICE_CHARS)}`,
    ].join('\n')

    const response = await client.messages.create({
      model: config.modelRouter,
      max_tokens: EXTRACT_MAX_TOKENS,
      system: EXTRACT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    })

    const text = response.content
      .filter((block): block is Extract<(typeof response.content)[number], { type: 'text' }> => block.type === 'text')
      .map(block => block.text)
      .join('')

    const parsed = ExtractionSchema.safeParse(JSON.parse(stripFence(text)))
    if (!parsed.success) {
      console.error('[memory-extract] response failed validation, skipping')
      return
    }

    const atoms: ExtractedAtom[] = parsed.data.atoms
    const { inserted, replaced } = await applyExtraction(userId, atoms)

    console.log(
      JSON.stringify({
        evt: 'memory_extract',
        inserted,
        replaced,
        existing: existing.length,
        usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
      })
    )
  } catch (err) {
    console.error('[memory-extract] extraction failed, skipping:', err instanceof Error ? err.message : err)
  }
}
