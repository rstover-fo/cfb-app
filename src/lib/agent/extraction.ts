/**
 * Post-turn extraction for the eve agent: after a completed conversational
 * turn, one cheap Haiku call decides whether anything durable about THE USER
 * was revealed -- a preference, a fact, a take -- and whether the user
 * committed to a college-football prediction. Ported from the Discord bot's
 * bot/src/memory-extract.ts (system prompt, schema, failure contract) and
 * bot/src/pick-resolve.ts (now src/lib/agent/pick-resolve.ts), retargeted at
 * the graph memory service (src/lib/memory/client.ts) instead of the bot's
 * JSON/Supabase StorageBackend, and at src/lib/agent/picks-store.ts for the
 * ledger instead of the bot's pick-store.ts.
 *
 * Failure contract mirrors the bot: any error anywhere (missing API key,
 * network, malformed JSON, storage write) is logged and swallowed -- this
 * must never throw or delay whatever called it. Logging follows the
 * no-user-text rule: counts and usage only, never atom or pick content.
 *
 * eve's post-turn hook is at-least-once, unlike the bot's single fire per
 * Discord turn, so pick capture carries an idempotency guard here that the
 * bot didn't need: before inserting, recently-created picks for the user are
 * read back and any candidate whose statement matches one is skipped. Atom
 * writes need no equivalent guard -- the graph memory service dedups atoms
 * itself, and (per the porting brief) the bot's 20-atom-per-user cap does
 * not carry over here either.
 */
import { z } from 'zod'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { getUserProfile } from '@/lib/agent/bot-data'
import { getMemories, rememberMemory, forgetMemories } from '@/lib/memory/client'
import { resolvePickCandidates, type PickCandidate } from './pick-resolve'
import { recordPick, listPicks } from './picks-store'

const EXTRACT_MODEL = 'claude-haiku-4-5'
// Bumped from 300 (the bot's pre-picks value) when the picks contract was added (~60 tokens/pick).
const EXTRACT_MAX_TOKENS = 500
/** Answers are capped at ~3000 chars by the persona; trim runaways so the cheap call stays cheap. */
const ANSWER_SLICE_CHARS = 1500
/** eve's post-turn hook is at-least-once; a re-delivered turn must not double-post the same pick. */
const PICK_DEDUP_WINDOW_MS = 15 * 60 * 1000

const EXTRACT_SYSTEM_PROMPT = [
  'You maintain long-term memory for a college-football assistant. You receive one Q&A exchange',
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
  // default([]) keeps every response without a "picks" key -- including any
  // pre-picks golden tests -- validating and behaving exactly as before.
  picks: z.array(PickCandidateSchema).max(2).default([]),
})

type ExtractedAtom = z.infer<typeof ExtractionSchema>['atoms'][number]

/** Tolerates a model that wraps its JSON in a ```json fence despite instructions. */
function stripFence(text: string): string {
  const trimmed = text.trim()
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed)
  return match ? match[1]! : trimmed
}

export interface TurnExtractionParams {
  userId: string
  /** Guild/surface the turn happened in; stamped onto captured picks for scoped ledgers. */
  guildId?: string
  question: string
  answer: string
}

/**
 * Applies one extraction result's atoms: the new content is remembered FIRST,
 * and only a successful write forgets the atom it `replaces` -- the memory
 * client nulls failed writes instead of throwing, so forget-first would
 * silently destroy the old atom with nothing stored in its place. The forget
 * is also skipped when the service's dedup merged the new content onto the
 * very node being replaced (same id), which would delete what was just
 * stored. An unknown/absent `replaces` id is a plain insert. No per-user cap
 * (the porting brief drops the bot's 20-atom cap -- the graph dedups instead).
 */
async function applyAtoms(
  userId: string,
  atoms: ExtractedAtom[],
  existingIds: ReadonlySet<string>
): Promise<{ inserted: number; replaced: number }> {
  let inserted = 0
  let replaced = 0
  for (const atom of atoms) {
    const stored = await rememberMemory({ userId, kind: atom.kind, content: atom.content })
    if (!stored) continue
    inserted++
    if (atom.replaces && existingIds.has(atom.replaces) && stored.id !== atom.replaces) {
      const deleted = await forgetMemories(userId, atom.replaces)
      if (deleted) replaced += deleted
    }
  }
  return { inserted, replaced }
}

/**
 * Stores resolved picks through recordPick (the ported ledger policy:
 * same-bet supersede, identical-repeat dedup, open cap), after skipping any
 * whose statement matches a pick the user already has on the ledger from
 * within the last PICK_DEDUP_WINDOW_MS -- the guard eve's at-least-once
 * post-turn delivery needs that the bot's single-fire-per-turn model didn't
 * (it also catches a re-delivery whose earlier copy was already settled,
 * which recordPick's open-picks-only dedup would miss).
 */
async function applyPicks(
  userId: string,
  candidates: PickCandidate[],
  guildId?: string
): Promise<{ stored: number; superseded: number }> {
  const resolved = await resolvePickCandidates(userId, candidates, guildId)
  if (resolved.length === 0) return { stored: 0, superseded: 0 }

  const since = new Date(Date.now() - PICK_DEDUP_WINDOW_MS).toISOString()
  const recent = await listPicks(userId, { createdAfter: since })
  const recentStatements = new Set(recent.map(pick => pick.statement))

  let stored = 0
  let superseded = 0
  for (const pick of resolved) {
    if (recentStatements.has(pick.statement)) continue
    const result = await recordPick(pick)
    if (result.outcome === 'stored') stored++
    superseded += result.superseded
  }
  return { stored, superseded }
}

/**
 * Runs the full post-turn pipeline for one completed turn: memory-off check,
 * one Haiku extraction call, atom apply, pick resolve + idempotent store,
 * one structured log line. Never throws -- every failure is caught, logged,
 * and treated as a no-op so a post-turn hook can call this unconditionally
 * without special-casing missing config (e.g. no ANTHROPIC_API_KEY) as
 * anything other than the normal caught-and-logged path.
 */
export async function runTurnExtraction({ userId, guildId, question, answer }: TurnExtractionParams): Promise<void> {
  try {
    // Fail closed on 'unknown' too: an unverifiable opt-out must not be
    // treated as consent to store (same rule as the capture hook).
    const profile = await getUserProfile(userId)
    if (profile.memoryEnabled !== true) return

    const existing = await getMemories(userId)
    const existingIds = new Set(existing.map(memory => memory.id))
    const existingLines =
      existing.length > 0 ? existing.map(memory => `${memory.id}: ${memory.content}`).join('\n') : '(none)'
    const content = [
      'Existing atoms (id: content):',
      existingLines,
      '',
      `Question: ${question}`,
      '',
      `Answer: ${answer.slice(0, ANSWER_SLICE_CHARS)}`,
    ].join('\n')

    const result = await generateText({
      model: anthropic(EXTRACT_MODEL),
      system: EXTRACT_SYSTEM_PROMPT,
      prompt: content,
      maxOutputTokens: EXTRACT_MAX_TOKENS,
    })

    const parsed = ExtractionSchema.safeParse(JSON.parse(stripFence(result.text)))
    if (!parsed.success) {
      console.error('[agent/extraction] response failed validation, skipping')
      return
    }

    const { inserted, replaced } = await applyAtoms(userId, parsed.data.atoms, existingIds)
    const picks = await applyPicks(userId, parsed.data.picks, guildId)

    console.log(
      JSON.stringify({
        evt: 'memory_extract',
        inserted,
        replaced,
        existing: existing.length,
        picks_candidates: parsed.data.picks.length,
        picks_stored: picks.stored,
        picks_superseded: picks.superseded,
        usage: {
          input_tokens: result.usage.inputTokens ?? 0,
          output_tokens: result.usage.outputTokens ?? 0,
        },
      })
    )
  } catch (err) {
    console.error('[agent/extraction] extraction failed, skipping:', err instanceof Error ? err.message : err)
  }
}
