import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { loadConfigMock } = vi.hoisted(() => ({ loadConfigMock: vi.fn() }))
vi.mock('../config.js', () => ({ loadConfig: loadConfigMock }))

import { checkAllowance, recordUsage, refusalMessage, costUsd, resetLimitsForTests } from '../limits.js'
import type { UsageSummary } from '../claude.js'

const BASE_CONFIG = {
  cooldownSeconds: 20,
  userDailyLimit: 10,
  dailyBudgetUsd: 10,
}

let now = Date.UTC(2026, 0, 15, 12, 0, 0) // 2026-01-15T12:00:00Z
function clock(): number {
  return now
}

function usage(overrides: Partial<UsageSummary> = {}): UsageSummary {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    ...overrides,
  }
}

let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  loadConfigMock.mockReturnValue(BASE_CONFIG)
  now = Date.UTC(2026, 0, 15, 12, 0, 0)
  resetLimitsForTests(clock)
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}) as ReturnType<typeof vi.spyOn>
})

afterEach(() => {
  logSpy.mockRestore()
})

describe('checkAllowance cooldown', () => {
  it('allows the first call for a user', () => {
    expect(checkAllowance('user-1')).toEqual({ ok: true })
  })

  it('refuses a second call within the cooldown window', () => {
    recordUsage('user-1', usage(), 'claude-sonnet-5')
    now += 5_000 // 5s later, cooldown is 20s

    const result = checkAllowance('user-1')
    expect(result).toEqual({ ok: false, reason: 'cooldown', retryAfterSec: 15 })
  })

  it('allows again once the cooldown has elapsed', () => {
    recordUsage('user-1', usage(), 'claude-sonnet-5')
    now += 20_000

    expect(checkAllowance('user-1')).toEqual({ ok: true })
  })

  it('logs a hashed-userId JSON line on cooldown refusal', () => {
    recordUsage('user-1', usage(), 'claude-sonnet-5')
    now += 1_000

    checkAllowance('user-1')

    const line = logSpy.mock.calls.map((c: unknown[]) => c[0]).find((l: unknown): l is string => typeof l === 'string')
    const parsed = JSON.parse(line as string)
    expect(parsed).toMatchObject({ evt: 'limit', reason: 'cooldown' })
    expect(parsed.userId).not.toBe('user-1')
    expect(parsed.userId).toMatch(/^[0-9a-f]{12}$/)
  })

  it('keeps cooldowns independent per user', () => {
    recordUsage('user-1', usage(), 'claude-sonnet-5')
    now += 1_000
    expect(checkAllowance('user-2')).toEqual({ ok: true })
  })
})

describe('checkAllowance user_cap', () => {
  it('refuses once the daily count reaches the limit', () => {
    for (let i = 0; i < BASE_CONFIG.userDailyLimit; i++) {
      recordUsage('user-1', usage(), 'claude-sonnet-5')
      now += 25_000 // clear the cooldown between calls
    }

    expect(checkAllowance('user-1')).toEqual({ ok: false, reason: 'user_cap' })
  })

  it('allows a fresh user under the cap', () => {
    for (let i = 0; i < BASE_CONFIG.userDailyLimit - 1; i++) {
      recordUsage('user-1', usage(), 'claude-sonnet-5')
      now += 25_000
    }
    expect(checkAllowance('user-1')).toEqual({ ok: true })
  })
})

describe('checkAllowance budget', () => {
  it('refuses once global spend reaches the daily budget', () => {
    // Big usage on an expensive model to cross the $10 budget in one call.
    recordUsage('user-1', usage({ input_tokens: 1_000_000, output_tokens: 200_000 }), 'claude-opus-4-8')
    now += 25_000

    expect(checkAllowance('user-1')).toEqual({ ok: false, reason: 'budget' })
  })

  it('budget refusal applies across different users (shared global budget)', () => {
    recordUsage('user-1', usage({ input_tokens: 1_000_000, output_tokens: 200_000 }), 'claude-opus-4-8')

    expect(checkAllowance('user-2')).toEqual({ ok: false, reason: 'budget' })
  })
})

describe('checkAllowance UTC-midnight reset', () => {
  it('resets a user daily count after UTC midnight', () => {
    for (let i = 0; i < BASE_CONFIG.userDailyLimit; i++) {
      recordUsage('user-1', usage(), 'claude-sonnet-5')
      now += 25_000
    }
    expect(checkAllowance('user-1')).toEqual({ ok: false, reason: 'user_cap' })

    now = Date.UTC(2026, 0, 16, 0, 0, 1) // just past UTC midnight
    expect(checkAllowance('user-1')).toEqual({ ok: true })
  })

  it('resets the global budget after UTC midnight', () => {
    recordUsage('user-1', usage({ input_tokens: 1_000_000, output_tokens: 200_000 }), 'claude-opus-4-8')
    expect(checkAllowance('user-2')).toEqual({ ok: false, reason: 'budget' })

    now = Date.UTC(2026, 0, 16, 0, 0, 1)
    expect(checkAllowance('user-2')).toEqual({ ok: true })
  })
})

describe('costUsd', () => {
  it('prices sonnet input/output tokens at $3 / $15 per million', () => {
    const cost = costUsd(usage({ input_tokens: 1_000_000, output_tokens: 1_000_000 }), 'claude-sonnet-5')
    expect(cost).toBeCloseTo(3 + 15, 6)
  })

  it('prices opus input/output tokens at $5 / $25 per million', () => {
    const cost = costUsd(usage({ input_tokens: 1_000_000, output_tokens: 1_000_000 }), 'claude-opus-4-8')
    expect(cost).toBeCloseTo(5 + 25, 6)
  })

  it('prices haiku input/output tokens at $1 / $5 per million', () => {
    const cost = costUsd(usage({ input_tokens: 1_000_000, output_tokens: 1_000_000 }), 'claude-haiku-4-5')
    expect(cost).toBeCloseTo(1 + 5, 6)
  })

  it('prices an unknown model as opus (fail conservative)', () => {
    const cost = costUsd(usage({ input_tokens: 1_000_000, output_tokens: 1_000_000 }), 'claude-some-future-model')
    expect(cost).toBeCloseTo(5 + 25, 6)
  })

  it('matches a versioned/dated model string by prefix', () => {
    const cost = costUsd(usage({ input_tokens: 1_000_000, output_tokens: 0 }), 'claude-sonnet-5-20261001')
    expect(cost).toBeCloseTo(3, 6)
  })

  it('prices cache_creation_input_tokens at 1.25x the input rate', () => {
    const cost = costUsd(usage({ cache_creation_input_tokens: 1_000_000 }), 'claude-sonnet-5')
    expect(cost).toBeCloseTo(3 * 1.25, 6)
  })

  it('prices cache_read_input_tokens at 0.1x the input rate', () => {
    const cost = costUsd(usage({ cache_read_input_tokens: 1_000_000 }), 'claude-sonnet-5')
    expect(cost).toBeCloseTo(3 * 0.1, 6)
  })

  it('sums all four usage components', () => {
    const cost = costUsd(
      usage({ input_tokens: 500_000, output_tokens: 100_000, cache_creation_input_tokens: 200_000, cache_read_input_tokens: 1_000_000 }),
      'claude-sonnet-5'
    )
    const expected = 500_000 * (3 / 1e6) + 100_000 * (15 / 1e6) + 200_000 * (3 / 1e6) * 1.25 + 1_000_000 * (3 / 1e6) * 0.1
    expect(cost).toBeCloseTo(expected, 6)
  })
})

describe('recordUsage accumulation', () => {
  it('accumulates cost across multiple calls toward the shared budget', () => {
    recordUsage('user-1', usage({ input_tokens: 500_000, output_tokens: 0 }), 'claude-sonnet-5') // $1.50
    now += 25_000
    recordUsage('user-1', usage({ input_tokens: 0, output_tokens: 500_000 }), 'claude-sonnet-5') // $7.50, total $9
    now += 25_000

    expect(checkAllowance('user-1')).toEqual({ ok: true }) // under $10

    recordUsage('user-1', usage({ input_tokens: 500_000, output_tokens: 0 }), 'claude-sonnet-5') // +$1.50 = $10.50
    now += 25_000
    expect(checkAllowance('user-1')).toEqual({ ok: false, reason: 'budget' })
  })
})

describe('refusalMessage', () => {
  it('describes a cooldown refusal with the retry time', () => {
    expect(refusalMessage({ ok: false, reason: 'cooldown', retryAfterSec: 12 })).toContain('12s')
  })

  it('describes a user_cap refusal', () => {
    const message = refusalMessage({ ok: false, reason: 'user_cap' })
    expect(message).toContain("today's question limit")
    expect(message).toContain('slash commands still work')
  })

  it('describes a budget refusal', () => {
    const message = refusalMessage({ ok: false, reason: 'budget' })
    expect(message).toContain('budget')
    expect(message).toContain('/rankings')
  })
})
