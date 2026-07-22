import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GameDownDistance } from '../GameDownDistance'
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

describe('GameDownDistance', () => {
  const plays: GamePlay[] = [
    // 1st & short (1-3): single successful play -> success rate 1.0 -> heat-5
    play({ down: 1, distance: 2, ppa: 1 }),
    // 2nd & medium (4-6): 1 of 2 successful -> 0.5 -> heat-3
    play({ down: 2, distance: 5, ppa: 1, play_number: 2 }),
    play({ down: 2, distance: 5, ppa: -1, play_number: 3 }),
    // 3rd & long (7-10): 0 of 1 successful -> 0.0 -> heat-1
    play({ down: 3, distance: 8, ppa: -1, play_number: 4 }),
    // 4th down: no plays at all -> no-data cell
  ]

  // Heat backgrounds are inline styles, not Tailwind classes: a
  // runtime-interpolated bg-[var(--heat-N)] class never appears literally in
  // source, so Tailwind's static scan would not generate it.
  it('buckets success rate >= .60 onto heat-5', () => {
    render(<GameDownDistance plays={plays} game={game()} />)
    const cell = screen.getByText('100%').parentElement
    expect(cell).toHaveStyle({ backgroundColor: 'var(--heat-5)' })
  })

  it('buckets .40 <= success rate < .60 onto heat-3', () => {
    render(<GameDownDistance plays={plays} game={game()} />)
    const cell = screen.getByText('50%').parentElement
    expect(cell).toHaveStyle({ backgroundColor: 'var(--heat-3)' })
  })

  it('buckets success rate < .40 onto heat-1', () => {
    render(<GameDownDistance plays={plays} game={game()} />)
    const cell = screen.getByText('0%').parentElement
    expect(cell).toHaveStyle({ backgroundColor: 'var(--heat-1)' })
  })

  it('renders an em dash and the surface-alt background for cells with no data', () => {
    render(<GameDownDistance plays={plays} game={game()} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
    for (const dash of dashes) {
      expect(dash.parentElement).toHaveClass('bg-[var(--bg-surface-alt)]')
    }
  })

  it('never emits Tailwind dark: variant classes', () => {
    const { container } = render(<GameDownDistance plays={plays} game={game()} />)
    expect(container.innerHTML).not.toMatch(/dark:/)
    expect(container.innerHTML).not.toMatch(/bg-(green|yellow|red)-/)
  })
})
