/**
 * Golden-question eval harness. Manual only -- never run in CI, and never
 * imported by the app itself (bot/ is inert to the Vercel build, and this
 * file makes real Anthropic network calls). Run it before deploys and after
 * any prompt/router change:
 *
 *   npm run eval                  -- full run against golden.json (real network)
 *   npm run eval -- --only <id>   -- run a single entry
 *   npm run eval -- --dry-run     -- validate golden.json against the schema, no network
 *
 * For each entry: call askClaude() for real, apply the deterministic
 * assertions (tier match, mustMatchAny/mustNotMatch regexes, maxChars), then
 * -- if the entry has a `judge` criterion -- one Haiku call that grades the
 * answer against that criterion and returns strict {pass, reason} JSON.
 * Prints a per-entry table plus pass-rate/spend totals.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type Anthropic from '@anthropic-ai/sdk'
import { askClaude, type UsageSummary } from '../src/claude.js'
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
}

export function parseArgs(argv: string[]): RunArgs {
  let only: string | undefined
  let dryRun = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') {
      only = argv[i + 1]
      i++
    } else if (argv[i] === '--dry-run') {
      dryRun = true
    }
  }
  return { only, dryRun }
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

/** Applies tier/mustMatchAny/mustNotMatch/maxChars against an answer. Pure/sync -- no network. */
export function evaluateDeterministic(entry: GoldenEntry, answer: { text: string; tier: string }): DeterministicVerdict {
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

  return { pass: failures.length === 0, failures }
}

// ---------------------------------------------------------------------------
// Haiku judge
// ---------------------------------------------------------------------------

export interface JudgeVerdict {
  pass: boolean
  reason: string
}

export type JudgeFn = (entry: GoldenEntry, answerText: string) => Promise<{ verdict: JudgeVerdict; usage: UsageSummary }>

const JUDGE_SYSTEM_PROMPT =
  'You are a strict grader for a college-football stats bot eval harness. ' +
  'Given a question, its answer, and a pass/fail criterion, decide whether the answer meets the ' +
  'criterion. Respond with ONLY a JSON object of the exact shape {"pass": boolean, "reason": string} -- ' +
  'no markdown, no code fences, no other text.'

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
  return async (entry, answerText) => {
    const prompt = [`Question: ${entry.question}`, `Answer: ${answerText}`, `Criterion: ${entry.expect.judge}`].join('\n\n')

    const response = await client.messages.create({
      model,
      max_tokens: 200,
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

    return { verdict: parseJudgeVerdict(text), usage }
  }
}

// ---------------------------------------------------------------------------
// Per-entry run + reporting
// ---------------------------------------------------------------------------

export interface ResultRow {
  id: string
  tier: string
  escalated: boolean
  deterministic: 'pass' | 'fail'
  judge: 'pass' | 'fail' | 'n/a'
  costUsd: string
}

/**
 * Runs one golden entry: a real askClaude() call, deterministic assertions,
 * and (if the entry has a judge criterion) one judgeFn call. `judgeFn` is
 * injected so tests can exercise this without an Anthropic client.
 */
export async function runEntry(entry: GoldenEntry, judgeFn: JudgeFn): Promise<{ row: ResultRow; spend: number }> {
  const answer = await askClaude(entry.question)
  const det = evaluateDeterministic(entry, answer)
  if (!det.pass) {
    console.log(`  [${entry.id}] deterministic failures: ${det.failures.join('; ')}`)
  }

  let spend = costUsd(answer.usage, answer.model)
  let judge: ResultRow['judge'] = 'n/a'

  if (entry.expect.judge) {
    const { verdict, usage } = await judgeFn(entry, answer.text)
    spend += costUsd(usage, 'claude-haiku-4-5')
    judge = verdict.pass ? 'pass' : 'fail'
    if (!verdict.pass) {
      console.log(`  [${entry.id}] judge failure: ${verdict.reason}`)
    }
  }

  return {
    row: {
      id: entry.id,
      tier: answer.tier,
      escalated: answer.escalated,
      deterministic: det.pass ? 'pass' : 'fail',
      judge,
      costUsd: spend.toFixed(4),
    },
    spend,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  loadEnvFileIfPresent()
  const { only, dryRun } = parseArgs(process.argv.slice(2))
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
    return
  }

  const config = loadConfig()
  const client = getAnthropicClient()
  const judgeFn = makeJudgeFn(client, config.modelRouter)

  const rows: ResultRow[] = []
  let totalSpend = 0
  for (const entry of entries) {
    const { row, spend } = await runEntry(entry, judgeFn)
    rows.push(row)
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
}

const isEntryPoint = process.argv[1] != null && import.meta.url === `file://${process.argv[1]}`
if (isEntryPoint) {
  main().catch(err => {
    console.error('[eval] fatal error:', err)
    process.exitCode = 1
  })
}
