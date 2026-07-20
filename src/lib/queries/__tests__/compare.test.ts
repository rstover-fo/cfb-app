import { describe, it, expect, vi, beforeEach } from 'vitest'

// Chainable Supabase query builder mock (matches the house style used by
// src/app/*/page.test.tsx). Supports `.schema('api')` returning itself so
// api.* views can be mocked the same way as public views.
function chainable(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const builder: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'neq', 'in', 'not', 'or', 'order', 'limit', 'range', 'lte', 'gte', 'schema']
  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder)
  }
  builder.single = vi.fn().mockResolvedValue(result)
  builder.then = (resolve: (v: unknown) => void) => resolve(result)
  return builder
}

const fromMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: (...args: unknown[]) => fromMock(...args),
    schema: vi.fn().mockReturnValue({ from: (...args: unknown[]) => fromMock(...args) }),
  }),
}))

import { resolveTeamBySlug, getAllTeams, getCompareTeamMetrics, getTeamHistory } from '../compare'
import type { Team } from '@/lib/types/database'

const TEAMS = [
  { id: 1, school: 'Oklahoma', logo: null, color: '#841617', conference: 'SEC', classification: 'fbs' },
  { id: 2, school: 'Texas', logo: null, color: '#BF5700', conference: 'SEC', classification: 'fbs' },
] as unknown as Team[]

beforeEach(() => {
  fromMock.mockReset()
})

describe('resolveTeamBySlug', () => {
  it('resolves a known school slug to its Team row', () => {
    expect(resolveTeamBySlug(TEAMS, 'oklahoma')).toEqual(TEAMS[0])
    expect(resolveTeamBySlug(TEAMS, 'texas')).toEqual(TEAMS[1])
  })

  it('returns null for an unknown slug', () => {
    expect(resolveTeamBySlug(TEAMS, 'nonexistent-team')).toBeNull()
  })

  it('returns null when slug is undefined', () => {
    expect(resolveTeamBySlug(TEAMS, undefined)).toBeNull()
  })
})

describe('getAllTeams', () => {
  it('returns teams from teams_with_logos', async () => {
    fromMock.mockReturnValue(chainable({ data: TEAMS, error: null }))

    const result = await getAllTeams()

    expect(fromMock).toHaveBeenCalledWith('teams_with_logos')
    expect(result).toEqual(TEAMS)
  })

  it('returns an empty array when the query errors', async () => {
    fromMock.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))

    const result = await getAllTeams()

    expect(result).toEqual([])
  })
})

describe('getCompareTeamMetrics', () => {
  it('fetches EPA and style metrics for a team/season in parallel', async () => {
    const epaRow = { team: 'Oklahoma', season: 2025, epa_per_play: 0.21 }
    const styleRow = { team: 'Oklahoma', season: 2025, run_rate: 0.45 }

    fromMock.mockImplementation((table: string) => {
      if (table === 'team_epa_season') return chainable({ data: epaRow, error: null })
      if (table === 'team_style_profile') return chainable({ data: styleRow, error: null })
      return chainable()
    })

    const result = await getCompareTeamMetrics('Oklahoma', 2025)

    expect(result.metrics).toEqual(epaRow)
    expect(result.style).toEqual(styleRow)
  })

  it('returns nulls when a metrics row is missing', async () => {
    fromMock.mockReturnValue(chainable({ data: null, error: null }))

    const result = await getCompareTeamMetrics('Nonexistent', 2025)

    expect(result).toEqual({ metrics: null, style: null })
  })
})

describe('getTeamHistory', () => {
  it('queries the api.team_history view and sorts ascending by season', async () => {
    const rows = [
      { team: 'Oklahoma', season: 2024, wins: 10, losses: 3, sp_rating: 15.2 },
      { team: 'Oklahoma', season: 2023, wins: 8, losses: 5, sp_rating: 9.1 },
      { team: 'Oklahoma', season: 2025, wins: 11, losses: 2, sp_rating: 20.5 }
    ]
    fromMock.mockReturnValue(chainable({ data: rows, error: null }))

    const result = await getTeamHistory('Oklahoma')

    expect(fromMock).toHaveBeenCalledWith('team_history')
    expect(result.map(r => r.season)).toEqual([2023, 2024, 2025])
  })

  it('returns an empty array on error', async () => {
    fromMock.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))

    const result = await getTeamHistory('Oklahoma')

    expect(result).toEqual([])
  })
})
