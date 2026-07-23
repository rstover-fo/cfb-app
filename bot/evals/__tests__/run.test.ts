import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { askClaudeMock } = vi.hoisted(() => ({ askClaudeMock: vi.fn() }))
vi.mock('../../src/claude.js', () => ({ askClaude: askClaudeMock }))

import { GoldenEntrySchema, GoldenSetSchema, type GoldenEntry } from '../schema.js'
import {
  parseArgs,
  loadGoldenSet,
  evaluateDeterministic,
  parseJudgeVerdict,
  runEntry,
  buildReport,
  type JudgeFn,
  type EvalRecord,
} from '../run.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REAL_GOLDEN_PATH = path.join(__dirname, '..', 'golden.json')

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('GoldenEntrySchema', () => {
  it('accepts a minimal valid entry (expect can be empty)', () => {
    const result = GoldenEntrySchema.safeParse({ id: 'x', question: 'q?', expect: {} })
    expect(result.success).toBe(true)
  })

  it('accepts a fully-populated entry', () => {
    const result = GoldenEntrySchema.safeParse({
      id: 'x',
      question: 'q?',
      expect: { tier: 'gnarly', mustMatchAny: ['a'], mustNotMatch: ['b'], maxChars: 500, judge: 'criterion' },
    })
    expect(result.success).toBe(true)
  })

  it('accepts priorTurns and expectedTools/forbidTools', () => {
    const result = GoldenEntrySchema.safeParse({
      id: 'x',
      priorTurns: ['first question?'],
      question: 'q?',
      expect: { expectedTools: ['run_sql'], forbidTools: ['get_live_scoreboard'] },
    })
    expect(result.success).toBe(true)
  })

  it('rejects an empty-string prior turn', () => {
    const result = GoldenEntrySchema.safeParse({
      id: 'x',
      priorTurns: ['ok', ''],
      question: 'q?',
      expect: {},
    })
    expect(result.success).toBe(false)
  })

  it('rejects an empty priorTurns array', () => {
    const result = GoldenEntrySchema.safeParse({
      id: 'x',
      priorTurns: [],
      question: 'q?',
      expect: {},
    })
    expect(result.success).toBe(false)
  })

  it('rejects an empty-string tool name in expectedTools/forbidTools', () => {
    expect(GoldenEntrySchema.safeParse({ id: 'x', question: 'q?', expect: { expectedTools: [''] } }).success).toBe(false)
    expect(GoldenEntrySchema.safeParse({ id: 'x', question: 'q?', expect: { forbidTools: [''] } }).success).toBe(false)
  })

  it('rejects a missing id', () => {
    expect(GoldenEntrySchema.safeParse({ question: 'q?', expect: {} }).success).toBe(false)
  })

  it('rejects an empty question', () => {
    expect(GoldenEntrySchema.safeParse({ id: 'x', question: '', expect: {} }).success).toBe(false)
  })

  it('rejects an invalid tier value', () => {
    expect(GoldenEntrySchema.safeParse({ id: 'x', question: 'q?', expect: { tier: 'medium' } }).success).toBe(false)
  })

  it('rejects a non-positive maxChars', () => {
    expect(GoldenEntrySchema.safeParse({ id: 'x', question: 'q?', expect: { maxChars: 0 } }).success).toBe(false)
  })
})

describe('GoldenSetSchema', () => {
  it('rejects an empty array', () => {
    expect(GoldenSetSchema.safeParse([]).success).toBe(false)
  })

  it('rejects non-array input', () => {
    expect(GoldenSetSchema.safeParse({ id: 'x' }).success).toBe(false)
  })
})

describe('loadGoldenSet against the real golden.json', () => {
  it('parses the real file with at least the original 25 entries', async () => {
    const golden = await loadGoldenSet(REAL_GOLDEN_PATH)
    // A floor, not an exact count: the golden set grows as live failures
    // (e.g. future-season-schedule) get pinned as regression entries.
    expect(golden.length).toBeGreaterThanOrEqual(33)
  })

  it('keeps a floor of multi-turn and tool-pinned entries', async () => {
    const golden = await loadGoldenSet(REAL_GOLDEN_PATH)
    const multiTurn = golden.filter(e => e.priorTurns)
    const toolPinned = golden.filter(e => e.expect.expectedTools)
    expect(multiTurn.length).toBeGreaterThanOrEqual(3)
    expect(toolPinned.length).toBeGreaterThanOrEqual(3)
  })

  it('every id is unique', async () => {
    const golden = await loadGoldenSet(REAL_GOLDEN_PATH)
    const ids = golden.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps every question category represented', async () => {
    // Floors, not exact counts: entries get added (pinned live regressions)
    // and re-tiered (the router-policy retune moved single-matchup who-wins
    // questions to the simple tier). What matters is that each category
    // keeps meaningful coverage.
    const golden = await loadGoldenSet(REAL_GOLDEN_PATH)
    const simple = golden.filter(e => e.expect.tier === 'simple')
    const gnarly = golden.filter(e => e.expect.tier === 'gnarly')
    const traps = golden.filter(e => e.expect.judge === 'uses the correct exact team')
    const missing = golden.filter(e => e.expect.judge === 'plainly admits the data is unavailable rather than inventing')

    expect(simple.length).toBeGreaterThanOrEqual(8)
    expect(gnarly.length).toBeGreaterThanOrEqual(5)
    expect(traps.length).toBeGreaterThanOrEqual(4)
    expect(missing.length).toBeGreaterThanOrEqual(5)
  })
})

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe('parseArgs', () => {
  it('defaults to no --only and dryRun false', () => {
    expect(parseArgs([])).toEqual({ only: undefined, dryRun: false, out: undefined, strict: false })
  })

  it('parses --only <id>', () => {
    expect(parseArgs(['--only', 'simple-ap-top5'])).toEqual({
      only: 'simple-ap-top5',
      dryRun: false,
      out: undefined,
      strict: false,
    })
  })

  it('parses --dry-run', () => {
    expect(parseArgs(['--dry-run'])).toEqual({ only: undefined, dryRun: true, out: undefined, strict: false })
  })

  it('parses --out <path>', () => {
    expect(parseArgs(['--out', 'evals/results/report.json'])).toEqual({
      only: undefined,
      dryRun: false,
      out: 'evals/results/report.json',
      strict: false,
    })
  })

  it('parses --strict', () => {
    expect(parseArgs(['--strict'])).toEqual({ only: undefined, dryRun: false, out: undefined, strict: true })
  })

  it('parses both flags together, order-independent', () => {
    expect(parseArgs(['--dry-run', '--only', 'trap-utsa'])).toEqual({
      only: 'trap-utsa',
      dryRun: true,
      out: undefined,
      strict: false,
    })
    expect(parseArgs(['--only', 'trap-utsa', '--dry-run'])).toEqual({
      only: 'trap-utsa',
      dryRun: true,
      out: undefined,
      strict: false,
    })
  })

  it('parses --out and --strict combined with other flags', () => {
    expect(parseArgs(['--only', 'trap-utsa', '--out', 'report.json', '--strict'])).toEqual({
      only: 'trap-utsa',
      dryRun: false,
      out: 'report.json',
      strict: true,
    })
  })
})

// ---------------------------------------------------------------------------
// evaluateDeterministic
// ---------------------------------------------------------------------------

function entry(expectation: GoldenEntry['expect']): GoldenEntry {
  return { id: 'fixture', question: 'q?', expect: expectation }
}

/** Minimal deterministic-check answer fixture; toolsUsed defaults to empty. */
function ans(text: string, tier = 'simple', toolsUsed: string[] = []): { text: string; tier: string; toolsUsed: string[] } {
  return { text, tier, toolsUsed }
}

describe('evaluateDeterministic', () => {
  it('passes when no assertions are configured', () => {
    const result = evaluateDeterministic(entry({}), ans('Oklahoma is 8-2.'))
    expect(result).toEqual({ pass: true, failures: [] })
  })

  it('fails on a tier mismatch', () => {
    const result = evaluateDeterministic(entry({ tier: 'gnarly' }), ans('answer'))
    expect(result.pass).toBe(false)
    expect(result.failures[0]).toContain('tier')
  })

  it('passes on a tier match', () => {
    const result = evaluateDeterministic(entry({ tier: 'simple' }), ans('answer'))
    expect(result.pass).toBe(true)
  })

  it('fails when the answer exceeds the default maxChars (2000)', () => {
    const result = evaluateDeterministic(entry({}), ans('x'.repeat(2001)))
    expect(result.pass).toBe(false)
    expect(result.failures[0]).toContain('maxChars')
  })

  it('respects a custom maxChars', () => {
    const short = evaluateDeterministic(entry({ maxChars: 10 }), ans('x'.repeat(11)))
    expect(short.pass).toBe(false)
    const ok = evaluateDeterministic(entry({ maxChars: 10 }), ans('x'.repeat(10)))
    expect(ok.pass).toBe(true)
  })

  it('passes mustMatchAny when at least one pattern matches, case-insensitively', () => {
    const result = evaluateDeterministic(entry({ mustMatchAny: ['oklahoma', 'texas'] }), ans('Oklahoma is 8-2.'))
    expect(result.pass).toBe(true)
  })

  it('fails mustMatchAny when none of the patterns match', () => {
    const result = evaluateDeterministic(entry({ mustMatchAny: ['Georgia', 'Alabama'] }), ans('Oklahoma is 8-2.'))
    expect(result.pass).toBe(false)
    expect(result.failures[0]).toContain('mustMatchAny')
  })

  it('fails mustNotMatch when a forbidden pattern matches', () => {
    const result = evaluateDeterministic(entry({ mustNotMatch: ['Miami(?!\\s*\\(OH\\))'] }), ans('Miami is 6-4 this season.'))
    expect(result.pass).toBe(false)
    expect(result.failures[0]).toContain('mustNotMatch')
  })

  it('passes mustNotMatch when the forbidden pattern is absent', () => {
    const result = evaluateDeterministic(entry({ mustNotMatch: ['Georgia'] }), ans('Miami (OH) is 6-4 this season.'))
    expect(result.pass).toBe(true)
  })

  it('combines multiple failures', () => {
    const result = evaluateDeterministic(entry({ tier: 'gnarly', mustMatchAny: ['Georgia'] }), ans('Oklahoma is 8-2.'))
    expect(result.pass).toBe(false)
    expect(result.failures).toHaveLength(2)
  })

  it('passes expectedTools when every pinned tool appears in the trajectory', () => {
    const result = evaluateDeterministic(entry({ expectedTools: ['run_sql'] }), ans('answer', 'simple', ['run_sql', 'query_games']))
    expect(result.pass).toBe(true)
  })

  it('fails expectedTools when a pinned tool is missing, with both lists in the message', () => {
    const result = evaluateDeterministic(entry({ expectedTools: ['run_sql', 'query_games'] }), ans('answer', 'simple', ['run_sql']))
    expect(result.pass).toBe(false)
    expect(result.failures[0]).toContain('expectedTools')
    expect(result.failures[0]).toContain('query_games')
    expect(result.failures[0]).toContain('run_sql')
  })

  it('passes forbidTools when the forbidden tool never appears', () => {
    const result = evaluateDeterministic(entry({ forbidTools: ['run_sql'] }), ans('answer', 'simple', ['query_games']))
    expect(result.pass).toBe(true)
  })

  it('fails forbidTools when the forbidden tool was invoked', () => {
    const result = evaluateDeterministic(entry({ forbidTools: ['run_sql'] }), ans('answer', 'simple', ['run_sql']))
    expect(result.pass).toBe(false)
    expect(result.failures[0]).toContain('forbidTools')
    expect(result.failures[0]).toContain('run_sql')
  })

  it('combines expectedTools/forbidTools failures with other failure types', () => {
    const result = evaluateDeterministic(
      entry({ tier: 'gnarly', expectedTools: ['run_sql'], forbidTools: ['query_games'] }),
      ans('Oklahoma is 8-2.', 'simple', ['query_games'])
    )
    expect(result.pass).toBe(false)
    expect(result.failures).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// parseJudgeVerdict
// ---------------------------------------------------------------------------

describe('parseJudgeVerdict', () => {
  it('parses a plain JSON verdict', () => {
    expect(parseJudgeVerdict('{"pass": true, "reason": "cites SP+ rating"}')).toEqual({
      pass: true,
      reason: 'cites SP+ rating',
    })
  })

  it('parses a verdict wrapped in a ```json fenced block', () => {
    const text = '```json\n{"pass": false, "reason": "no numbers cited"}\n```'
    expect(parseJudgeVerdict(text)).toEqual({ pass: false, reason: 'no numbers cited' })
  })

  it('parses a verdict wrapped in a plain ``` fenced block', () => {
    const text = '```\n{"pass": true, "reason": "ok"}\n```'
    expect(parseJudgeVerdict(text)).toEqual({ pass: true, reason: 'ok' })
  })

  it('fails closed (pass: false) on unparseable text', () => {
    const result = parseJudgeVerdict('not json at all')
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('not valid JSON')
  })

  it('fails closed when the JSON is missing the pass/reason fields', () => {
    const result = parseJudgeVerdict('{"verdict": "yes"}')
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('missing pass/reason')
  })
})

// ---------------------------------------------------------------------------
// runEntry (mocked askClaude + injected judgeFn)
// ---------------------------------------------------------------------------

function fixtureAnswer(overrides: Record<string, unknown> = {}) {
  return {
    text: 'Oklahoma is 8-2, SP+ rank 14.',
    tier: 'simple' as const,
    escalated: false,
    usage: { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    model: 'claude-sonnet-5',
    toolsUsed: [] as string[],
    ...overrides,
  }
}

describe('runEntry', () => {
  it('skips the judge call and reports n/a when the entry has no judge criterion', async () => {
    askClaudeMock.mockResolvedValue(fixtureAnswer())
    const judgeFn: JudgeFn = vi.fn()

    const { row } = await runEntry(entry({ mustMatchAny: ['Oklahoma'] }), judgeFn)

    expect(judgeFn).not.toHaveBeenCalled()
    expect(row.judge).toBe('n/a')
    expect(row.deterministic).toBe('pass')
  })

  it('calls the judge and reports pass/fail from its verdict', async () => {
    askClaudeMock.mockResolvedValue(fixtureAnswer())
    const judgeFn: JudgeFn = vi.fn().mockResolvedValue({
      verdict: { pass: true, reason: 'cites SP+' },
      usage: { input_tokens: 50, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      model: 'claude-haiku-4-5',
    })

    const { row } = await runEntry(entry({ judge: 'cites a number' }), judgeFn)

    expect(judgeFn).toHaveBeenCalledTimes(1)
    expect(row.judge).toBe('pass')
  })

  it('reports judge fail when the verdict fails', async () => {
    askClaudeMock.mockResolvedValue(fixtureAnswer())
    const judgeFn: JudgeFn = vi.fn().mockResolvedValue({
      verdict: { pass: false, reason: 'no numbers' },
      usage: { input_tokens: 50, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      model: 'claude-haiku-4-5',
    })

    const { row } = await runEntry(entry({ judge: 'cites a number' }), judgeFn)

    expect(row.judge).toBe('fail')
  })

  it('sums askClaude usage cost and judge usage cost into spend', async () => {
    askClaudeMock.mockResolvedValue(fixtureAnswer({ usage: { input_tokens: 1_000_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } })) // $3 on sonnet
    const judgeFn: JudgeFn = vi.fn().mockResolvedValue({
      verdict: { pass: true, reason: 'ok' },
      usage: { input_tokens: 1_000_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, // $1 on haiku
      model: 'claude-haiku-4-5',
    })

    const { spend } = await runEntry(entry({ judge: 'x' }), judgeFn)

    expect(spend).toBeCloseTo(4, 6)
  })

  it('reports the tier/escalated fields from the askClaude result', async () => {
    askClaudeMock.mockResolvedValue(fixtureAnswer({ tier: 'gnarly', escalated: true, model: 'claude-opus-4-8' }))
    const judgeFn: JudgeFn = vi.fn()

    const { row } = await runEntry(entry({}), judgeFn)

    expect(row.tier).toBe('gnarly')
    expect(row.escalated).toBe(true)
  })

  it('reports deterministic fail without throwing when assertions fail', async () => {
    askClaudeMock.mockResolvedValue(fixtureAnswer({ text: 'Texas is 8-2.' }))
    const judgeFn: JudgeFn = vi.fn()

    const { row } = await runEntry(entry({ mustMatchAny: ['Georgia'] }), judgeFn)

    expect(row.deterministic).toBe('fail')
  })

  it('reports the tools column and record.toolsUsed from the final answer', async () => {
    askClaudeMock.mockResolvedValue(fixtureAnswer({ toolsUsed: ['run_sql', 'query_games'] }))
    const judgeFn: JudgeFn = vi.fn()

    const { row, record } = await runEntry(entry({}), judgeFn)

    expect(row.tools).toBe('run_sql, query_games')
    expect(record.toolsUsed).toEqual(['run_sql', 'query_games'])
    expect(record.turns).toBe(1)
    expect(record.judge).toBeNull()
  })

  it('threads priorTurns as real askClaude calls with history, and grades the full transcript', async () => {
    askClaudeMock
      .mockResolvedValueOnce(fixtureAnswer({ text: 'A1', toolsUsed: ['tool_a'] }))
      .mockResolvedValueOnce(fixtureAnswer({ text: 'A2', toolsUsed: ['tool_b'] }))
      .mockResolvedValueOnce(fixtureAnswer({ text: 'A3 final', toolsUsed: ['tool_c'] }))

    const judgeFn: JudgeFn = vi.fn().mockResolvedValue({
      verdict: { pass: true, reason: 'ok' },
      usage: { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      // A non-Haiku model, to prove the old hardcoded 'claude-haiku-4-5' spend line is gone.
      model: 'claude-opus-4-8',
    })

    const multiTurnEntry: GoldenEntry = {
      id: 'fixture-multi',
      priorTurns: ['Q1', 'Q2'],
      question: 'Q3',
      expect: { judge: 'grades the final answer' },
    }

    const { record, spend } = await runEntry(multiTurnEntry, judgeFn)

    // priorTurns.length + 1 real askClaude calls.
    expect(askClaudeMock).toHaveBeenCalledTimes(3)
    expect(askClaudeMock.mock.calls[0]).toEqual(['Q1', { history: [] }])
    // Second call is threaded with the first turn's Q/A pair.
    expect(askClaudeMock.mock.calls[1]).toEqual(['Q2', { history: [{ role: 'user', content: 'Q1' }, { role: 'assistant', content: 'A1' }] }])
    expect(askClaudeMock.mock.calls[2]).toEqual([
      'Q3',
      {
        history: [
          { role: 'user', content: 'Q1' },
          { role: 'assistant', content: 'A1' },
          { role: 'user', content: 'Q2' },
          { role: 'assistant', content: 'A2' },
        ],
      },
    ])

    // The judge gets the full transcript, final answer included.
    expect(judgeFn).toHaveBeenCalledWith(multiTurnEntry, [
      { question: 'Q1', answer: 'A1' },
      { question: 'Q2', answer: 'A2' },
      { question: 'Q3', answer: 'A3 final' },
    ])

    expect(record.turns).toBe(3)
    expect(record.toolsUsed).toEqual(['tool_c']) // final answer's trajectory only
    expect(record.judge).toEqual({ pass: true, reason: 'ok' })

    // 3 askClaude turns @ $0.0045 (sonnet: 1000 in + 100 out) + judge @ $0.0075 (opus: 1000 in + 100 out).
    expect(spend).toBeCloseTo(3 * 0.0045 + 0.0075, 6)
  })
})

// ---------------------------------------------------------------------------
// buildReport
// ---------------------------------------------------------------------------

function record(overrides: Partial<EvalRecord> = {}): EvalRecord {
  return {
    id: 'fixture',
    turns: 1,
    tier: 'simple',
    escalated: false,
    model: 'claude-sonnet-5',
    toolsUsed: [],
    deterministic: { pass: true, failures: [] },
    judge: null,
    costUsd: 0.01,
    ...overrides,
  }
}

describe('buildReport', () => {
  it('produces the report shape with the given timestamp', () => {
    const report = buildReport([record()], '2026-07-23T00:00:00.000Z')
    expect(report.timestamp).toBe('2026-07-23T00:00:00.000Z')
    expect(report.results).toEqual([record()])
  })

  it('computes totals: entries, deterministicPass, judged (excluding null judges), judgePass, totalCostUsd', () => {
    const records = [
      record({ id: 'a', deterministic: { pass: true, failures: [] }, judge: null, costUsd: 0.01 }),
      record({ id: 'b', deterministic: { pass: false, failures: ['x'] }, judge: { pass: true, reason: 'ok' }, costUsd: 0.02 }),
      record({ id: 'c', deterministic: { pass: true, failures: [] }, judge: { pass: false, reason: 'no' }, costUsd: 0.03 }),
    ]

    const report = buildReport(records, '2026-07-23T00:00:00.000Z')

    expect(report.totals).toEqual({
      entries: 3,
      deterministicPass: 2,
      judged: 2, // excludes the null-judge entry
      judgePass: 1,
      totalCostUsd: 0.06,
    })
  })

  it('sets judge to null in totals.judged for entries without a criterion', () => {
    const report = buildReport([record({ judge: null }), record({ judge: null })], 't')
    expect(report.totals.judged).toBe(0)
    expect(report.totals.judgePass).toBe(0)
  })
})
