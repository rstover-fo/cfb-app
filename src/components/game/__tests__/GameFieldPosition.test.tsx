import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GameFieldPosition } from '../GameFieldPosition'
import type { GamePlay } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'

function game(overrides: Partial<GameWithTeams> = {}): GameWithTeams {
  return {
    id: 1,
    season: 2026,
    week: 3,
    start_date: '2026-09-19T00:00:00Z',
    home_team: 'Oklahoma',
    away_team: 'Houston',
    home_points: 30,
    away_points: 10,
    conference_game: true,
    completed: true,
    homeLogo: null,
    homeColor: '#841617',
    awayLogo: null,
    awayColor: null,
    ...overrides,
  }
}

function play(overrides: Partial<GamePlay>): GamePlay {
  return {
    game_id: 1,
    drive_number: 1,
    play_number: 1,
    offense: 'Oklahoma',
    defense: 'Houston',
    period: 1,
    clock_minutes: 10,
    clock_seconds: 0,
    down: 1,
    distance: 10,
    yards_to_goal: 50,
    yards_gained: 5,
    play_type: 'Rush',
    play_text: null,
    ppa: 0,
    scoring: false,
    offense_score: 0,
    defense_score: 0,
    ...overrides,
  }
}

describe('GameFieldPosition', () => {
  const plays: GamePlay[] = [
    // Own 1-20 (yards_to_goal 81-100): 1 of 1 successful -> 1.0 -> heat-5
    play({ yards_to_goal: 90, ppa: 1 }),
    // Own 21-50 (yards_to_goal 50-80): 1 of 2 successful -> 0.5 -> heat-3
    play({ yards_to_goal: 65, ppa: 1, play_number: 2 }),
    play({ yards_to_goal: 65, ppa: -1, play_number: 3 }),
    // Opp 49-21 (yards_to_goal 21-49): 0 of 1 successful -> 0.0 -> heat-1
    play({ yards_to_goal: 30, ppa: -1, play_number: 4 }),
    // Red Zone (yards_to_goal 1-20): no plays -> no-data row
  ]

  // Inline-style assertions: heat backgrounds must not be runtime-assembled
  // Tailwind classes (invisible to the static content scan).
  it('buckets success rate >= .60 onto heat-5', () => {
    render(<GameFieldPosition plays={plays} game={game()} />)
    const cell = screen.getByText('100%')
    expect(cell).toHaveStyle({ backgroundColor: 'var(--heat-5)' })
  })

  it('buckets .40 <= success rate < .60 onto heat-3', () => {
    render(<GameFieldPosition plays={plays} game={game()} />)
    const cell = screen.getByText('50%')
    expect(cell).toHaveStyle({ backgroundColor: 'var(--heat-3)' })
  })

  it('buckets success rate < .40 onto heat-1', () => {
    render(<GameFieldPosition plays={plays} game={game()} />)
    const cell = screen.getByText('0%')
    expect(cell).toHaveStyle({ backgroundColor: 'var(--heat-1)' })
  })

  it('renders an em dash with the surface-alt background for zones with no data', () => {
    render(<GameFieldPosition plays={plays} game={game()} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
    for (const dash of dashes) {
      expect(dash).toHaveClass('bg-[var(--bg-surface-alt)]')
    }
  })

  it('never emits Tailwind dark: variant classes', () => {
    const { container } = render(<GameFieldPosition plays={plays} game={game()} />)
    expect(container.innerHTML).not.toMatch(/dark:/)
    expect(container.innerHTML).not.toMatch(/bg-(green|yellow|red)-/)
  })
})
