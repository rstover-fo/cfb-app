import { describe, it, expect } from 'vitest'
import { buildSeasonRows, formatRecord, formatRating } from '../CompareHistorySection'
import type { TeamHistoryRow } from '@/lib/queries/compare'

function historyRow(overrides: Partial<TeamHistoryRow>): TeamHistoryRow {
  return {
    team: 'Oklahoma',
    season: 2025,
    conference: 'SEC',
    games: 13,
    wins: 10,
    losses: 3,
    conf_wins: 6,
    conf_losses: 2,
    ppg: 34.2,
    opp_ppg: 18.1,
    avg_margin: 16.1,
    sp_rating: 15.2,
    sp_rank: 12,
    elo: 1800,
    fpi: 10.5,
    epa_per_play: 0.21,
    epa_tier: 'elite',
    success_rate: 0.48,
    explosiveness: 1.3,
    total_plays: 900,
    recruiting_rank: 5,
    recruiting_points: 250.1,
    ...overrides
  }
}

describe('buildSeasonRows', () => {
  it('merges two teams onto a union of seasons, most recent first', () => {
    const history1 = [historyRow({ season: 2023 }), historyRow({ season: 2024 })]
    const history2 = [historyRow({ team: 'Texas', season: 2024 }), historyRow({ team: 'Texas', season: 2025 })]

    const rows = buildSeasonRows(history1, history2)

    expect(rows.map(r => r.season)).toEqual([2025, 2024, 2023])
  })

  it('leaves a null row for a season a team has no data for', () => {
    const history1 = [historyRow({ season: 2024 })]
    const history2 = [historyRow({ team: 'Texas', season: 2023 })]

    const rows = buildSeasonRows(history1, history2)

    const row2024 = rows.find(r => r.season === 2024)
    const row2023 = rows.find(r => r.season === 2023)

    expect(row2024?.row1).not.toBeNull()
    expect(row2024?.row2).toBeNull()
    expect(row2023?.row1).toBeNull()
    expect(row2023?.row2).not.toBeNull()
  })

  it('returns an empty array when both histories are empty', () => {
    expect(buildSeasonRows([], [])).toEqual([])
  })
})

describe('formatRecord', () => {
  it('formats wins-losses', () => {
    expect(formatRecord(historyRow({ wins: 11, losses: 2 }))).toBe('11-2')
  })

  it('renders an em dash for a missing row', () => {
    expect(formatRecord(null)).toBe('—')
  })

  it('defaults missing wins/losses to 0', () => {
    expect(formatRecord(historyRow({ wins: null, losses: null }))).toBe('0-0')
  })
})

describe('formatRating', () => {
  it('formats sp_rating to one decimal', () => {
    expect(formatRating(historyRow({ sp_rating: 15.234 }))).toBe('15.2')
  })

  it('renders an em dash for a missing row', () => {
    expect(formatRating(null)).toBe('—')
  })

  it('renders an em dash when sp_rating is null', () => {
    expect(formatRating(historyRow({ sp_rating: null }))).toBe('—')
  })
})
