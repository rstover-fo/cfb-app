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
import { resolveAndRecordPicks } from './pick-resolve.js'
import type { Pick } from './storage/backend.js'

// Bumped from 300 when the picks contract was added (~60 tokens per pick).
const EXTRACT_MAX_TOKENS = 500
/** Answers are capped at ~3000 chars by the system prompt; trim runaways so the cheap call stays cheap. */
const ANSWER_SLICE_CHARS = 1500

const EXTRACT_SYSTEM_PROMPT = [
  'You maintain long-term memory for a college-football Discord bot. You receive one Q&A exchange',
  "plus the user's existing memory atoms. Reply with STRICT JSON only, no markdown fences, matching:",
  '{"atoms":[{"content":string,"kind":"preference"|"fact"|"take","replaces":string|null}],',
  ' "picks":[{"type":"game_winner"|"ats"|"season_total","team":string,"opponent":string|null,',
  '           "direction":"win"|"cover"|"over"|"under"|null,"threshold":number|null,',
  '           "seasonRef":"current"|"next"|null,"quote":string}]}',
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
  '',
  'You ALSO maintain a public prediction ledger. Add to "picks" ONLY when the USER clearly',
  'COMMITS to a college-football prediction in their own words:',
  '- game_winner: they say a team beats a specific opponent ("we beat Texas", "OU wins the Red',
  '  River game"). Set direction "win" and name the opponent.',
  '- ats: they say a team covers or beats the spread ("Texas covers Saturday", "OU -3 is free',
  '  money"). Set direction "cover"; opponent only if they named one.',
  '- season_total: they commit to a win count ("Sooners win 10 this year" -> direction "over",',
  '  threshold 10; "no way Texas gets to 9 wins" -> direction "under", threshold 9).',
  'Pick rules:',
  '- NEVER log questions, hypotheticals, hedges, or maybes ("can OU win 10?", "if we beat',
  '  Texas...", "OU might cover"). NEVER log the ASSISTANT\'s predictions -- only user assertions.',
  '- A false pick is worse than a missed pick. When in doubt, return "picks": [].',
  '- "we"/"us" means the user\'s favorite team when their memory atoms or the context say which',
  '  team that is; otherwise skip the pick.',
  '- team/opponent: the school name as the user said it (aliases fine, e.g. "OU", "Sooners").',
  '- seasonRef: "next" only when they clearly mean next season; otherwise "current".',
  '- quote: their prediction in their own words, under 200 characters.',
  '- Max 2 picks. Most turns have no picks -- {"picks":[]} is the normal answer.',
].join('\n')

const PickCandidateSchema = z.object({
  type: z.enum(['game_winner', 'ats', 'season_total']),
  team: z.string().min(1).max(60),
  opponent: z.string().max(60).nullish(),
  direction: z.enum(['win', 'cover', 'over', 'under']).nullish(),
  threshold: z.number().min(0).max(20).nullish(),
  seasonRef: z.enum(['current', 'next']).nullish(),
  quote: z.string().min(1).max(200),
})

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
  // default([]) keeps every response without a "picks" key -- including all
  // pre-picks golden tests -- validating and behaving exactly as before.
  picks: z.array(PickCandidateSchema).max(2).default([]),
})

/** Tolerates a model that wraps its JSON in a ```json fence despite instructions. */
function stripFence(text: string): string {
  const trimmed = text.trim()
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed)
  return match ? match[1]! : trimmed
}

export interface ExtractParams {
  userId: string
  /** Guild the turn happened in; stamped onto captured picks for per-server ledgers. */
  guildId?: string
  question: string
  answer: string
  /**
   * Capture acknowledgment hook: called (fire-and-forget, errors swallowed)
   * with the picks actually stored this turn, after storage writes succeed.
   * The call site closes over its own reply handle (message reaction /
   * interaction followUp) -- extraction runs after the answer is delivered.
   */
  onPicksRecorded?: (picks: Pick[]) => Promise<void>
}

/**
 * Fire-and-forget: kicks off extraction for a completed turn and returns
 * immediately. Never throws and never leaves an unhandled rejection.
 */
export function extractMemories(params: ExtractParams): void {
  void runExtraction(params).catch(err => {
    // runExtraction catches everything itself; this is a belt-and-suspenders
    // backstop so no code path can ever surface an unhandled rejection.
    console.error('[memory-extract] unexpected rejection:', err instanceof Error ? err.message : err)
  })
}

/** Exported for tests only (deterministic awaiting); production code calls extractMemories(). */
export async function runExtraction({ userId, guildId, question, answer, onPicksRecorded }: ExtractParams): Promise<void> {
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

    const storedPicks = await resolveAndRecordPicks(userId, parsed.data.picks, guildId)
    if (storedPicks.length > 0 && onPicksRecorded) {
      try {
        await onPicksRecorded(storedPicks)
      } catch (err) {
        console.error('[memory-extract] pick acknowledgment failed:', err instanceof Error ? err.message : err)
      }
    }

    console.log(
      JSON.stringify({
        evt: 'memory_extract',
        inserted,
        replaced,
        existing: existing.length,
        picks_candidates: parsed.data.picks.length,
        picks_stored: storedPicks.length,
        usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
      })
    )
  } catch (err) {
    console.error('[memory-extract] extraction failed, skipping:', err instanceof Error ? err.message : err)
  }
}
