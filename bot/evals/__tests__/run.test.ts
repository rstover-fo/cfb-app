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
  type JudgeFn,
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
    expect(golden.length).toBeGreaterThanOrEqual(25)
  })

  it('every id is unique', async () => {
    const golden = await loadGoldenSet(REAL_GOLDEN_PATH)
    const ids = golden.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('matches the plan distribution: 8 simple, 8 gnarly, 4 exact-name traps, 5 must-admit-missing', async () => {
    const golden = await loadGoldenSet(REAL_GOLDEN_PATH)
    const simple = golden.filter(e => e.expect.tier === 'simple')
    const gnarly = golden.filter(e => e.expect.tier === 'gnarly')
    const traps = golden.filter(e => e.expect.judge === 'uses the correct exact team')
    const missing = golden.filter(e => e.expect.judge === 'plainly admits the data is unavailable rather than inventing')

    expect(simple).toHaveLength(8)
    expect(gnarly).toHaveLength(8)
    expect(traps).toHaveLength(4)
    expect(missing).toHaveLength(5)
  })
})

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe('parseArgs', () => {
  it('defaults to no --only and dryRun false', () => {
    expect(parseArgs([])).toEqual({ only: undefined, dryRun: false })
  })

  it('parses --only <id>', () => {
    expect(parseArgs(['--only', 'simple-ap-top5'])).toEqual({ only: 'simple-ap-top5', dryRun: false })
  })

  it('parses --dry-run', () => {
    expect(parseArgs(['--dry-run'])).toEqual({ only: undefined, dryRun: true })
  })

  it('parses both flags together, order-independent', () => {
    expect(parseArgs(['--dry-run', '--only', 'trap-utsa'])).toEqual({ only: 'trap-utsa', dryRun: true })
    expect(parseArgs(['--only', 'trap-utsa', '--dry-run'])).toEqual({ only: 'trap-utsa', dryRun: true })
  })
})

// ---------------------------------------------------------------------------
// evaluateDeterministic
// ---------------------------------------------------------------------------

function entry(expectation: GoldenEntry['expect']): GoldenEntry {
  return { id: 'fixture', question: 'q?', expect: expectation }
}

describe('evaluateDeterministic', () => {
  it('passes when no assertions are configured', () => {
    const result = evaluateDeterministic(entry({}), { text: 'Oklahoma is 8-2.', tier: 'simple' })
    expect(result).toEqual({ pass: true, failures: [] })
  })

  it('fails on a tier mismatch', () => {
    const result = evaluateDeterministic(entry({ tier: 'gnarly' }), { text: 'answer', tier: 'simple' })
    expect(result.pass).toBe(false)
    expect(result.failures[0]).toContain('tier')
  })

  it('passes on a tier match', () => {
    const result = evaluateDeterministic(entry({ tier: 'simple' }), { text: 'answer', tier: 'simple' })
    expect(result.pass).toBe(true)
  })

  it('fails when the answer exceeds the default maxChars (2000)', () => {
    const result = evaluateDeterministic(entry({}), { text: 'x'.repeat(2001), tier: 'simple' })
    expect(result.pass).toBe(false)
    expect(result.failures[0]).toContain('maxChars')
  })

  it('respects a custom maxChars', () => {
    const short = evaluateDeterministic(entry({ maxChars: 10 }), { text: 'x'.repeat(11), tier: 'simple' })
    expect(short.pass).toBe(false)
    const ok = evaluateDeterministic(entry({ maxChars: 10 }), { text: 'x'.repeat(10), tier: 'simple' })
    expect(ok.pass).toBe(true)
  })

  it('passes mustMatchAny when at least one pattern matches, case-insensitively', () => {
    const result = evaluateDeterministic(entry({ mustMatchAny: ['oklahoma', 'texas'] }), {
      text: 'Oklahoma is 8-2.',
      tier: 'simple',
    })
    expect(result.pass).toBe(true)
  })

  it('fails mustMatchAny when none of the patterns match', () => {
    const result = evaluateDeterministic(entry({ mustMatchAny: ['Georgia', 'Alabama'] }), {
      text: 'Oklahoma is 8-2.',
      tier: 'simple',
    })
    expect(result.pass).toBe(false)
    expect(result.failures[0]).toContain('mustMatchAny')
  })

  it('fails mustNotMatch when a forbidden pattern matches', () => {
    const result = evaluateDeterministic(entry({ mustNotMatch: ['Miami(?!\\s*\\(OH\\))'] }), {
      text: 'Miami is 6-4 this season.',
      tier: 'simple',
    })
    expect(result.pass).toBe(false)
    expect(result.failures[0]).toContain('mustNotMatch')
  })

  it('passes mustNotMatch when the forbidden pattern is absent', () => {
    const result = evaluateDeterministic(entry({ mustNotMatch: ['Georgia'] }), {
      text: 'Miami (OH) is 6-4 this season.',
      tier: 'simple',
    })
    expect(result.pass).toBe(true)
  })

  it('combines multiple failures', () => {
    const result = evaluateDeterministic(entry({ tier: 'gnarly', mustMatchAny: ['Georgia'] }), {
      text: 'Oklahoma is 8-2.',
      tier: 'simple',
    })
    expect(result.pass).toBe(false)
    expect(result.failures).toHaveLength(2)
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
    })

    const { row } = await runEntry(entry({ judge: 'cites a number' }), judgeFn)

    expect(row.judge).toBe('fail')
  })

  it('sums askClaude usage cost and judge usage cost into spend', async () => {
    askClaudeMock.mockResolvedValue(fixtureAnswer({ usage: { input_tokens: 1_000_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } })) // $3 on sonnet
    const judgeFn: JudgeFn = vi.fn().mockResolvedValue({
      verdict: { pass: true, reason: 'ok' },
      usage: { input_tokens: 1_000_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, // $1 on haiku
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
})
