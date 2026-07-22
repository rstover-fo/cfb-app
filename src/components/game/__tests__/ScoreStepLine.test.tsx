/**
 * Smoke tests for ScoreStepLine: render + empty-state + theme-flip, per the
 * shared-primitives migration in docs/chart-style-spec.md.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import { ScoreStepLine } from '../ScoreStepLine'
import type { GameDrive, LineScores } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'

const game: GameWithTeams = {
  id: 1001,
  season: 2024,
  week: 1,
  start_date: '2024-08-30T00:00:00Z',
  home_team: 'Oklahoma',
  away_team: 'Houston',
  home_points: 28,
  away_points: 14,
  conference_game: true,
  completed: true,
  homeLogo: null,
  homeColor: '#841617',
  awayLogo: null,
  awayColor: '#666666',
}

function drive(overrides: Partial<GameDrive> = {}): GameDrive {
  return {
    drive_number: 1,
    offense: 'Oklahoma',
    defense: 'Houston',
    start_period: 1,
    start_yards_to_goal: 75,
    end_yards_to_goal: 0,
    plays: 8,
    yards: 75,
    drive_result: 'TD',
    scoring: true,
    start_offense_score: 0,
    end_offense_score: 7,
    start_defense_score: 0,
    end_defense_score: 0,
    start_time_minutes: 15,
    start_time_seconds: 0,
    elapsed_minutes: 4,
    elapsed_seconds: 30,
    is_home_offense: true,
    ...overrides,
  }
}

const lineScores: LineScores = {
  home: [7, 7, 7, 7],
  away: [0, 7, 0, 7],
}

const drives: GameDrive[] = [drive()]

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-theme')
})

describe('ScoreStepLine', () => {
  it('renders an accessible svg inside the frame with a seeded rough layer', () => {
    const { container } = render(<ScoreStepLine drives={drives} lineScores={lineScores} game={game} />)

    const svg = screen.getByRole('img', { name: /Score flow: Oklahoma 28, Houston 14/ })
    expect(svg.tagName.toLowerCase()).toBe('svg')

    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')

    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.childElementCount).toBeGreaterThan(0)
  })

  it('renders the HTML legend with both team names, not an in-SVG legend', () => {
    render(<ScoreStepLine drives={drives} lineScores={lineScores} game={game} />)

    const svg = screen.getByRole('img')
    // Retired: in-SVG legend chips.
    expect(within(svg).queryByText('Oklahoma')).not.toBeInTheDocument()
    expect(within(svg).queryByText('Houston')).not.toBeInTheDocument()

    expect(screen.getByText('Oklahoma')).toBeInTheDocument()
    expect(screen.getByText('Houston')).toBeInTheDocument()
  })

  it('renders the framed EmptyState when there are no scoring plays', () => {
    const scorelessGame: LineScores = { home: [0, 0, 0, 0], away: [0, 0, 0, 0] }
    const { container } = render(
      <ScoreStepLine drives={[drive({ scoring: false })]} lineScores={scorelessGame} game={game} />,
    )

    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')
    expect(screen.getByRole('status')).toHaveTextContent('No scoring plays recorded yet')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('redraws the rough layer with re-resolved ink when the theme flips (fallback ink)', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })

    const noTeamColors: GameWithTeams = { ...game, homeColor: null, awayColor: null }
    render(<ScoreStepLine drives={drives} lineScores={lineScores} game={noTeamColors} />)

    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.querySelector('path[stroke="#111111"]')).toBeNull()

    document.documentElement.style.setProperty('--text-primary', '#111111')
    document.documentElement.setAttribute('data-theme', 'dark')

    await waitFor(() => {
      expect(roughLayer.querySelector('path[stroke="#111111"]')).not.toBeNull()
    })

    rafSpy.mockRestore()
  })
})
