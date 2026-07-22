import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlayerGameLog } from '../PlayerGameLog'
import type { PlayerGameLogEntry } from '@/app/players/[id]/actions'

function entry(overrides: Partial<PlayerGameLogEntry> = {}): PlayerGameLogEntry {
  return {
    game_id: 1,
    season: 2025,
    team: 'Oklahoma',
    player_name: 'Jackson Arnold',
    play_category: 'passing',
    plays: 30,
    total_epa: 8.2,
    epa_per_play: 0.27,
    success_rate: 0.5,
    explosive_plays: 4,
    total_yards: 280,
    week: 3,
    opponent: 'Tennessee',
    home_away: 'home',
    result: 'W',
    over_under: null,
    ou_result: null,
    ...overrides,
  }
}

describe('PlayerGameLog O/U column', () => {
  it('renders "Ov <line>" when the result is over', () => {
    render(<PlayerGameLog gameLog={[entry({ over_under: 61.5, ou_result: 'over' })]} />)
    expect(screen.getByText('Ov 61.5')).toBeInTheDocument()
  })

  it('renders "Un <line>" when the result is under', () => {
    render(<PlayerGameLog gameLog={[entry({ over_under: 48.5, ou_result: 'under' })]} />)
    expect(screen.getByText('Un 48.5')).toBeInTheDocument()
  })

  it('renders "Push" when the result is a push', () => {
    render(<PlayerGameLog gameLog={[entry({ over_under: 55, ou_result: 'push' })]} />)
    expect(screen.getByText('Push')).toBeInTheDocument()
  })

  it('renders an em-dash when over_under/ou_result are null', () => {
    render(<PlayerGameLog gameLog={[entry({ over_under: null, ou_result: null })]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
