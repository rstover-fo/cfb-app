import { describe, it, expect } from 'vitest'
import { RULES_CONTENT, seasonRulesBlock } from '../prompts'
import type { SeasonState } from '@/lib/queries/season'

// R10: the eve agent's system prompt states the resolved season and week at
// prompt-build time, not a compiled constant. RULES_CONTENT must no longer
// carry a hard-coded season year, and seasonRulesBlock renders the
// season-dependent slice from a SeasonState instead.

describe('RULES_CONTENT', () => {
  it('no longer contains a hard-coded four-digit season year', () => {
    expect(RULES_CONTENT).not.toMatch(/\b(19|20)\d{2}\b/)
  })
})

describe('seasonRulesBlock', () => {
  const liveState: SeasonState = {
    season: 2026,
    through_week: 2,
    is_live: true,
    source: 'games',
  }

  it('states the current season and through-week', () => {
    const block = seasonRulesBlock(liveState)
    expect(block).toContain('2026')
    expect(block).toContain('Week 2')
  })

  it('names next season for the schedule-check rule', () => {
    const block = seasonRulesBlock(liveState)
    expect(block).toContain('2027')
  })

  it('omits the through-week clause when through_week is null', () => {
    const block = seasonRulesBlock({ ...liveState, through_week: null })
    expect(block).not.toContain('through Week')
  })

  it('renders without throwing and includes a caveat when source is fallback', () => {
    const fallback: SeasonState = { season: 2026, through_week: null, is_live: false, source: 'fallback' }
    expect(() => seasonRulesBlock(fallback)).not.toThrow()
    const block = seasonRulesBlock(fallback)
    expect(block).toContain('2026')
    expect(block.toLowerCase()).toContain('could not be confirmed')
  })

  it('does not add the fallback caveat for a confirmed source', () => {
    const block = seasonRulesBlock(liveState)
    expect(block.toLowerCase()).not.toContain('could not be confirmed')
  })
})
