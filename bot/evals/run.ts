/**
 * Golden-question eval harness. Manual only -- never run in CI, and never
 * imported by the app itself (bot/ is inert to the Vercel build, and this
 * file makes real Anthropic network calls). Run it before deploys and after
 * any prompt/router change:
 *
 *   npm run eval                    -- full run against golden.json (real network)
 *   npm run eval -- --only <id>     -- run a single entry
 *   npm run eval -- --dry-run       -- validate golden.json against the schema, no network
 *   npm run eval -- --out <path>    -- write a JSON report to <path> (no-op under --dry-run)
 *   npm run eval -- --strict        -- exit 1 if any entry fails deterministic/judge checks (no-op under --dry-run)
 *
 * For each entry: run any scripted `priorTurns` for real, threading each
 * turn's answer back into history for the next call, then call askClaude()
 * for the final `question`. Deterministic assertions (tier match,
 * mustMatchAny/mustNotMatch, maxChars, expectedTools/forbidTools trajectory
 * checks) run against the final answer, then -- if the entry has a `judge`
 * criterion -- one Haiku call grades the final answer, given the full
 * conversation transcript, against that criterion and returns strict
 * {reason, pass} JSON. Prints a per-entry table plus pass-rate/spend totals.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type Anthropic from '@anthropic-ai/sdk'
import { askClaude, type UsageSummary, type HistoryTurn } from '../src/claude.js'
import { getAnthropicClient } from '../src/anthropic-client.js'
import { loadConfig } from '../src/config.js'
import { loadEnvFileIfPresent } from '../src/env.js'
import { costUsd } from '../src/limits.js'
import { GoldenSetSchema, DEFAULT_MAX_CHARS, type GoldenEntry, type GoldenSet } from './schema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GOLDEN_PATH = path.join(__dirname, 'golden.json')

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

export interface RunArgs {
  only?: string
  dryRun: boolean
  out?: string
  strict: boolean
}

export function parseArgs(argv: string[]): RunArgs {
  let only: string | undefined
  let dryRun = false
  let out: string | undefined
  let strict = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') {
      only = argv[i + 1]
      i++
    } else if (argv[i] === '--dry-run') {
      dryRun = true
    } else if (argv[i] === '--out') {
      out = argv[i + 1]
      i++
    } else if (argv[i] === '--strict') {
      strict = true
    }
  }
  return { only, dryRun, out, strict }
}

// ---------------------------------------------------------------------------
// golden.json loading + validation
// ---------------------------------------------------------------------------

export async function loadGoldenSet(filePath: string = GOLDEN_PATH): Promise<GoldenSet> {
  const raw = await readFile(filePath, 'utf-8')
  const parsed: unknown = JSON.parse(raw)
  return GoldenSetSchema.parse(parsed)
}

// ---------------------------------------------------------------------------
// Deterministic assertions
// ---------------------------------------------------------------------------

export interface DeterministicVerdict {
  pass: boolean
  failures: string[]
}

/** Applies tier/mustMatchAny/mustNotMatch/maxChars/expectedTools/forbidTools against an answer. Pure/sync -- no network. */
export function evaluateDeterministic(
  entry: GoldenEntry,
  answer: { text: string; tier: string; toolsUsed: string[] }
): DeterministicVerdict {
  const failures: string[] = []
  const { expect } = entry

  if (expect.tier && expect.tier !== answer.tier) {
    failures.push(`tier: expected "${expect.tier}", got "${answer.tier}"`)
  }

  const maxChars = expect.maxChars ?? DEFAULT_MAX_CHARS
  if (answer.text.length > maxChars) {
    failures.push(`length ${answer.text.length} exceeds maxChars ${maxChars}`)
  }

  if (expect.mustMatchAny && expect.mustMatchAny.length > 0) {
    const matched = expect.mustMatchAny.some(pattern => new RegExp(pattern, 'i').test(answer.text))
    if (!matched) {
      failures.push(`mustMatchAny: none of [${expect.mustMatchAny.join(', ')}] matched the answer`)
    }
  }

  for (const pattern of expect.mustNotMatch ?? []) {
    if (new RegExp(pattern, 'i').test(answer.text)) {
      failures.push(`mustNotMatch: "${pattern}" matched the answer`)
    }
  }

  if (expect.expectedTools && expect.expectedTools.length > 0) {
    const missing = expect.expectedTools.filter(tool => !answer.toolsUsed.includes(tool))
    if (missing.length > 0) {
      failures.push(`expectedTools: missing [${missing.join(', ')}]; trajectory was [${answer.toolsUsed.join(', ')}]`)
    }
  }

  for (const tool of expect.forbidTools ?? []) {
    if (answer.toolsUsed.includes(tool)) {
      failures.push(`forbidTools: "${tool}" was invoked`)
    }
  }

  return { pass: failures.length === 0, failures }
}

// ---------------------------------------------------------------------------
// Haiku judge
// ---------------------------------------------------------------------------

export interface JudgeVerdict {
  pass: boolean
  reason: string
}

/** One user-turn/bot-answer pair in a graded conversation transcript. */
export interface TranscriptPair {
  question: string
  answer: string
}

export type JudgeFn = (
  entry: GoldenEntry,
  transcript: TranscriptPair[]
) => Promise<{ verdict: JudgeVerdict; usage: UsageSummary; model: string }>

const JUDGE_SYSTEM_PROMPT = [
  'You are an impartial grader for the eval harness of a college-football stats',
  "Discord bot. Your only job is to decide whether the bot's FINAL answer",
  'satisfies one specific pass/fail criterion.',
  '',
  'Grading procedure — follow these steps in order:',
  '1. Read the criterion carefully. It is the ONLY standard you grade against.',
  '2. Read the conversation transcript and the final answer.',
  '3. Write "reason": 1-3 sentences stating what the criterion demands and',
  '   whether the final answer delivers it, quoting the specific evidence',
  '   (numbers, team names, phrases) that decides the verdict.',
  '4. Only after writing the reason, set "pass".',
  '',
  'Rules:',
  '- Grade ONLY against the criterion. Ignore style, tone, personality, length,',
  '  formatting, and confidence. A short blunt answer that meets the criterion',
  '  passes; a long polished answer that misses it fails.',
  '- Do not use your own football knowledge to fact-check the stats. Grade',
  '  whether the answer does what the criterion demands (cites concrete figures,',
  '  names the exact team, admits missing data, etc.), not whether the figures',
  '  match your priors.',
  '- Confidence is not evidence. An assertive answer lacking the substance the',
  '  criterion demands fails.',
  '- Partial credit does not exist: an answer that only partly meets the',
  '  criterion fails. When genuinely uncertain, fail — this harness treats a',
  '  false pass as worse than a false failure.',
  '',
  'Respond with ONLY a JSON object of the exact shape',
  '{"reason": string, "pass": boolean} — reason first, then pass. No markdown,',
  'no code fences, no other text.',
].join('\n')

/** Renders the transcript + criterion into the judge's user-turn prompt. */
function buildJudgePrompt(entry: GoldenEntry, transcript: TranscriptPair[]): string {
  if (transcript.length <= 1) {
    const pair = transcript[0]
    return [`Question: ${pair?.question ?? ''}`, `Answer: ${pair?.answer ?? ''}`, `Criterion: ${entry.expect.judge}`].join(
      '\n\n'
    )
  }

  const lines: string[] = ['Conversation transcript:', '']
  transcript.forEach((turn, i) => {
    const turnNum = i + 1
    const isFinal = i === transcript.length - 1
    lines.push(`[Turn ${turnNum}] User: ${turn.question}`)
    lines.push(`[Turn ${turnNum}] Bot${isFinal ? ' (FINAL ANSWER — grade this)' : ''}: ${turn.answer}`)
  })
  lines.push('')
  lines.push(`Criterion: ${entry.expect.judge}`)
  return lines.join('\n')
}

/** Parses a judge response into {pass, reason}, tolerating a ```json fenced block around the JSON. */
export function parseJudgeVerdict(text: string): JudgeVerdict {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
  try {
    const parsed: unknown = JSON.parse(stripped)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).pass === 'boolean' &&
      typeof (parsed as Record<string, unknown>).reason === 'string'
    ) {
      return { pass: (parsed as { pass: boolean }).pass, reason: (parsed as { reason: string }).reason }
    }
    return { pass: false, reason: `judge response missing pass/reason fields: ${text}` }
  } catch {
    return { pass: false, reason: `judge response was not valid JSON: ${text}` }
  }
}

/** Builds a JudgeFn bound to a real Anthropic client + model (the router/Haiku model). */
export function makeJudgeFn(client: Anthropic, model: string): JudgeFn {
  return async (entry, transcript) => {
    const prompt = buildJudgePrompt(entry, transcript)

    const response = await client.messages.create({
      model,
      max_tokens: 300,
      system: JUDGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content
      .filter((block): block is Extract<(typeof response.content)[number], { type: 'text' }> => block.type === 'text')
      .map(block => block.text)
      .join('')

    const usage: UsageSummary = {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
    }

    return { verdict: parseJudgeVerdict(text), usage, model }
  }
}

// ---------------------------------------------------------------------------
// Per-entry run + reporting
// ---------------------------------------------------------------------------

export interface ResultRow {
  id: string
  tier: string
  escalated: boolean
  tools: string
  deterministic: 'pass' | 'fail'
  judge: 'pass' | 'fail' | 'n/a'
  costUsd: string
}

/** One entry's full outcome, as persisted into the --out JSON report. */
export interface EvalRecord {
  id: string
  turns: number
  tier: string
  escalated: boolean
  model: string
  toolsUsed: string[]
  deterministic: DeterministicVerdict
  judge: JudgeVerdict | null
  costUsd: number
}

/**
 * Runs one golden entry: any scripted `priorTurns` for real (threading
 * history), then a real askClaude() call for the final `question`,
 * deterministic assertions, and (if the entry has a judge criterion) one
 * judgeFn call over the full transcript. `judgeFn` is injected so tests can
 * exercise this without an Anthropic client.
 */
export async function runEntry(
  entry: GoldenEntry,
  judgeFn: JudgeFn
): Promise<{ row: ResultRow; spend: number; record: EvalRecord }> {
  // Rebuilt (not mutated) each turn so each askClaude call captures its own
  // history snapshot -- mutating one shared array in place would leave every
  // earlier call's recorded `opts.history` pointing at the same, later-mutated
  // array.
  let history: HistoryTurn[] = []
  const transcript: TranscriptPair[] = []
  let spend = 0

  for (const turn of entry.priorTurns ?? []) {
    const a = await askClaude(turn, { history })
    spend += costUsd(a.usage, a.model)
    history = [...history, { role: 'user', content: turn }, { role: 'assistant', content: a.text }]
    transcript.push({ question: turn, answer: a.text })
  }

  const answer = await askClaude(entry.question, { history })
  spend += costUsd(answer.usage, answer.model)
  transcript.push({ question: entry.question, answer: answer.text })

  const det = evaluateDeterministic(entry, answer)
  if (!det.pass) {
    console.log(`  [${entry.id}] deterministic failures: ${det.failures.join('; ')}`)
  }

  let judge: ResultRow['judge'] = 'n/a'
  let judgeVerdict: JudgeVerdict | null = null

  if (entry.expect.judge) {
    const { verdict, usage, model } = await judgeFn(entry, transcript)
    spend += costUsd(usage, model)
    judge = verdict.pass ? 'pass' : 'fail'
    judgeVerdict = verdict
    if (!verdict.pass) {
      console.log(`  [${entry.id}] judge failure: ${verdict.reason}`)
    }
  }

  return {
    row: {
      id: entry.id,
      tier: answer.tier,
      escalated: answer.escalated,
      tools: answer.toolsUsed.join(', '),
      deterministic: det.pass ? 'pass' : 'fail',
      judge,
      costUsd: spend.toFixed(4),
    },
    spend,
    record: {
      id: entry.id,
      turns: (entry.priorTurns?.length ?? 0) + 1,
      tier: answer.tier,
      escalated: answer.escalated,
      model: answer.model,
      toolsUsed: answer.toolsUsed,
      deterministic: det,
      judge: judgeVerdict,
      costUsd: spend,
    },
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface EvalReport {
  timestamp: string
  totals: {
    entries: number
    deterministicPass: number
    judged: number
    judgePass: number
    totalCostUsd: number
  }
  results: EvalRecord[]
}

/** Pure: aggregates per-entry records into the --out JSON report shape. */
export function buildReport(records: EvalRecord[], timestamp: string): EvalReport {
  const deterministicPass = records.filter(r => r.deterministic.pass).length
  const judged = records.filter(r => r.judge !== null)
  const judgePass = judged.filter(r => r.judge?.pass).length
  const totalCostUsd = records.reduce((sum, r) => sum + r.costUsd, 0)

  return {
    timestamp,
    totals: {
      entries: records.length,
      deterministicPass,
      judged: judged.length,
      judgePass,
      totalCostUsd,
    },
    results: records,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  loadEnvFileIfPresent()
  const { only, dryRun, out, strict } = parseArgs(process.argv.slice(2))
  const golden = await loadGoldenSet()

  let entries = golden
  if (only) {
    entries = golden.filter(e => e.id === only)
    if (entries.length === 0) {
      console.error(`No golden entry with id "${only}". Known ids: ${golden.map(e => e.id).join(', ')}`)
      process.exitCode = 1
      return
    }
  }

  if (dryRun) {
    const byTier = { simple: 0, gnarly: 0, unspecified: 0 }
    for (const entry of golden) {
      const tier = entry.expect.tier ?? 'unspecified'
      byTier[tier] += 1
    }
    console.log(`golden.json is valid: ${golden.length} entries`)
    console.log(`  tiers -- simple: ${byTier.simple}, gnarly: ${byTier.gnarly}, unspecified: ${byTier.unspecified}`)
    console.log(`  with judge criterion: ${golden.filter(e => e.expect.judge).length}`)
    console.log(`  multi-turn (priorTurns): ${golden.filter(e => e.priorTurns).length}`)
    console.log(`  with expectedTools/forbidTools pins: ${golden.filter(e => e.expect.expectedTools || e.expect.forbidTools).length}`)
    return
  }

  const config = loadConfig()
  const client = getAnthropicClient()
  const judgeFn = makeJudgeFn(client, config.modelRouter)

  const rows: ResultRow[] = []
  const records: EvalRecord[] = []
  let totalSpend = 0
  for (const entry of entries) {
    const { row, spend, record } = await runEntry(entry, judgeFn)
    rows.push(row)
    records.push(record)
    totalSpend += spend
  }

  console.table(rows)

  const detPassCount = rows.filter(r => r.deterministic === 'pass').length
  const judged = rows.filter(r => r.judge !== 'n/a')
  const judgePassCount = judged.filter(r => r.judge === 'pass').length

  console.log(`Deterministic pass rate: ${detPassCount}/${rows.length}`)
  if (judged.length > 0) {
    console.log(`Judge pass rate: ${judgePassCount}/${judged.length}`)
  }
  console.log(`Total spend: $${totalSpend.toFixed(4)}`)

  if (out) {
    const report = buildReport(records, new Date().toISOString())
    await mkdir(path.dirname(out), { recursive: true })
    await writeFile(out, JSON.stringify(report, null, 2) + '\n')
    console.log(`Report written to ${out}`)
  }

  if (strict) {
    const anyDetFail = rows.some(r => r.deterministic === 'fail')
    const anyJudgeFail = rows.some(r => r.judge === 'fail')
    if (anyDetFail || anyJudgeFail) {
      console.error('Strict mode: at least one entry failed deterministic or judge checks.')
      process.exitCode = 1
    }
  }
}

const isEntryPoint = process.argv[1] != null && import.meta.url === `file://${process.argv[1]}`
if (isEntryPoint) {
  main().catch(err => {
    console.error('[eval] fatal error:', err)
    process.exitCode = 1
  })
}
