import { describe, it, expect, beforeEach } from 'vitest'
import { getHistory, appendTurns, clearMemoryForTests } from '../memory.js'

let now = 0
function clock(): number {
  return now
}

beforeEach(() => {
  now = 1_000_000
  clearMemoryForTests(clock)
})

describe('getHistory', () => {
  it('returns [] for a channel with no history', () => {
    expect(getHistory('chan-1')).toEqual([])
  })

  it('returns stored turns in order', () => {
    appendTurns('chan-1', 'question one', 'answer one')
    expect(getHistory('chan-1')).toEqual([
      { role: 'user', content: 'question one' },
      { role: 'assistant', content: 'answer one' },
    ])
  })
})

describe('appendTurns pair cap', () => {
  it('keeps only the last 6 user/assistant pairs (12 turns)', () => {
    for (let i = 0; i < 8; i++) {
      appendTurns('chan-1', `q${i}`, `a${i}`)
    }
    const history = getHistory('chan-1')
    expect(history).toHaveLength(12)
    expect(history[0]).toEqual({ role: 'user', content: 'q2' })
    expect(history[1]).toEqual({ role: 'assistant', content: 'a2' })
    expect(history[history.length - 2]).toEqual({ role: 'user', content: 'q7' })
    expect(history[history.length - 1]).toEqual({ role: 'assistant', content: 'a7' })
  })
})

describe('TTL expiry', () => {
  it('expires history after >30 minutes of inactivity', () => {
    appendTurns('chan-1', 'q', 'a')
    now += 30 * 60 * 1000 + 1
    expect(getHistory('chan-1')).toEqual([])
  })

  it('does not expire at exactly 30 minutes', () => {
    appendTurns('chan-1', 'q', 'a')
    now += 30 * 60 * 1000
    expect(getHistory('chan-1')).toHaveLength(2)
  })

  it('deletes the stale entry so a later append starts fresh (not just re-hidden)', () => {
    appendTurns('chan-1', 'old question', 'old answer')
    now += 30 * 60 * 1000 + 1
    expect(getHistory('chan-1')).toEqual([]) // triggers the delete

    appendTurns('chan-1', 'new question', 'new answer')
    expect(getHistory('chan-1')).toEqual([
      { role: 'user', content: 'new question' },
      { role: 'assistant', content: 'new answer' },
    ])
  })

  it('a fresh append resets the TTL clock', () => {
    appendTurns('chan-1', 'q1', 'a1')
    now += 20 * 60 * 1000
    appendTurns('chan-1', 'q2', 'a2')
    now += 20 * 60 * 1000 // 40 min after q1, but only 20 min after q2
    expect(getHistory('chan-1')).toHaveLength(4)
  })
})

describe('per-channel isolation', () => {
  it('keeps separate channels independent', () => {
    appendTurns('chan-1', 'q1', 'a1')
    appendTurns('chan-2', 'q2', 'a2')

    expect(getHistory('chan-1')).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ])
    expect(getHistory('chan-2')).toEqual([
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2' },
    ])
  })

  it('expiring one channel does not affect another', () => {
    appendTurns('chan-1', 'q1', 'a1')
    now += 10 * 60 * 1000
    appendTurns('chan-2', 'q2', 'a2')
    now += 25 * 60 * 1000 // chan-1 now 35min stale, chan-2 only 25min

    expect(getHistory('chan-1')).toEqual([])
    expect(getHistory('chan-2')).toHaveLength(2)
  })
})
