import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SeasonState } from '@/lib/queries/season'

// R10: the root agent's 25-season.ts and the advisor subagent's
// instructions.ts both resolve the season per turn (getCurrentSeasonForRoute)
// and render it through seasonRulesBlock, so root and advisor never disagree
// on what "this season" means. These modules live under agent/ (outside
// src/), which eve compiles directly -- import them by relative path here so
// this suite still runs under the src/**/*.test.ts vitest include glob.

const { getCurrentSeasonForRouteMock } = vi.hoisted(() => ({
  getCurrentSeasonForRouteMock: vi.fn(),
}))

vi.mock('@/lib/queries/season', () => ({
  getCurrentSeasonForRoute: getCurrentSeasonForRouteMock,
}))

const liveState: SeasonState = { season: 2026, through_week: 2, is_live: true, source: 'games' }

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentSeasonForRouteMock.mockResolvedValue(liveState)
})

describe('agent/instructions/25-season.ts', () => {
  it('resolves the season per turn and returns content that states it', async () => {
    const mod = (await import('../../../../agent/instructions/25-season')).default
    const result = await mod.events['turn.started']!({} as never, {} as never)
    expect(getCurrentSeasonForRouteMock).toHaveBeenCalled()
    expect(result).not.toBeNull()
    expect(result!.content).toContain('2026')
    expect(result!.content).toContain('Week 2')
  })
})

describe('agent/subagents/advisor/instructions.ts', () => {
  it('folds the same season block into the advisor prompt', async () => {
    const mod = (await import('../../../../agent/subagents/advisor/instructions')).default
    const result = await mod.events['turn.started']!({} as never, {} as never)
    expect(result).not.toBeNull()
    expect(result!.content).toContain('2026')
    expect(result!.content).toContain('deep-analysis advisor')
  })
})
