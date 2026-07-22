/**
 * Unit tests for GameRedZone, including its StatBar-backed dueling bars
 * (task D1 migration) -- team hex colors pass straight through as the fill
 * color, and the away side grows right-to-left to meet the home side.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GameRedZone } from '../GameRedZone'
import type { GameDrive } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'

function game(overrides: Partial<GameWithTeams> = {}): GameWithTeams {
  return {
    id: 1,
    season: 2025,
    week: 5,
    start_date: '2025-09-27',
    home_team: 'Ohio State',
    away_team: 'Michigan',
    home_points: 30,
    away_points: 17,
    conference_game: true,
    completed: true,
    homeLogo: null,
    homeColor: '#BB0000',
    awayLogo: null,
    awayColor: '#00274C',
    ...overrides,
  }
}

function drive(overrides: Partial<GameDrive> = {}): GameDrive {
  return {
    drive_number: 1,
    offense: 'Ohio State',
    defense: 'Michigan',
    start_period: 1,
    start_yards_to_goal: 15,
    end_yards_to_goal: 0,
    plays: 5,
    yards: 15,
    drive_result: 'TD',
    scoring: true,
    start_offense_score: 0,
    end_offense_score: 7,
    start_defense_score: 0,
    end_defense_score: 0,
    start_time_minutes: 10,
    start_time_seconds: 0,
    elapsed_minutes: 2,
    elapsed_seconds: 30,
    is_home_offense: true,
    ...overrides,
  }
}

describe('GameRedZone', () => {
  it('renders a dueling StatBar pair per stat row with team hex fill colors', () => {
    const drives = [
      drive({ offense: 'Ohio State', drive_result: 'TD' }),
      drive({ offense: 'Ohio State', drive_result: 'FG', start_yards_to_goal: 18, end_yards_to_goal: 5 }),
      drive({ offense: 'Michigan', defense: 'Ohio State', drive_result: 'TD', start_yards_to_goal: 10, end_yards_to_goal: 0 }),
    ]

    const { container } = render(<GameRedZone drives={drives} game={game()} />)

    expect(screen.getByText('TD Rate')).toBeInTheDocument()
    expect(screen.getByText('Trips')).toBeInTheDocument()

    const tracks = Array.from(
      container.querySelectorAll('.bg-\\[var\\(--bg-surface-alt\\)\\].rounded-full'),
    ) as HTMLElement[]
    // 5 stat rows x 2 sides
    expect(tracks).toHaveLength(10)

    // Away (Michigan) tracks grow right-to-left.
    expect(tracks[0].className).toContain('justify-end')
    const awayFill = tracks[0].firstElementChild as HTMLElement
    expect(awayFill.style.backgroundColor).toBe('rgb(0, 39, 76)') // #00274C

    // Home (Ohio State) tracks grow left-to-right (no justify-end).
    expect(tracks[1].className).not.toContain('justify-end')
    const homeFill = tracks[1].firstElementChild as HTMLElement
    expect(homeFill.style.backgroundColor).toBe('rgb(187, 0, 0)') // #BB0000
  })

  it('falls back to the muted token when a team has no brand color', () => {
    const drives = [
      drive({ offense: 'Ohio State', drive_result: 'TD' }),
      drive({ offense: 'Michigan', defense: 'Ohio State', drive_result: 'FG', start_yards_to_goal: 12, end_yards_to_goal: 3 }),
    ]

    const { container } = render(
      <GameRedZone drives={drives} game={game({ homeColor: null, awayColor: null })} />,
    )

    const fills = Array.from(
      container.querySelectorAll('.bg-\\[var\\(--bg-surface-alt\\)\\].rounded-full > div'),
    ) as HTMLElement[]
    expect(fills.every(f => f.style.backgroundColor === 'var(--text-muted)')).toBe(true)
  })

  it('renders the no-red-zone-drives empty message when there are no red zone trips', () => {
    render(<GameRedZone drives={[]} game={game()} />)
    expect(screen.getByText('No red zone drives in this game.')).toBeInTheDocument()
  })
})
