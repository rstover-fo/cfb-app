/**
 * Unit tests for WinProbabilityChart's two rendering paths:
 *  - server-data path: api.game_win_probability rows (CFBD's in-game model),
 *    threaded in as the `serverWP` prop, drive the chart when >= 2 usable
 *    rows are present.
 *  - heuristic fallback: the pre-existing score-based
 *    computeWinProbability/buildWPData path, used when serverWP is missing,
 *    empty, or has fewer than 2 usable rows.
 *
 * Fixture shapes mirror api.game_win_probability
 * (/workspace/cfb-database/src/schemas/api/033_game_win_probability.sql).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import { WinProbabilityChart } from '../WinProbabilityChart'
import type { GameDrive, GameWinProbability, LineScores } from '@/lib/types/database'
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

const lineScores: LineScores = {
  home: [7, 7, 7, 7],
  away: [0, 7, 0, 7],
}

const drives: GameDrive[] = [
  {
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
  },
]

function wpRow(overrides: Partial<GameWinProbability> = {}): GameWinProbability {
  return {
    play_id: '1',
    home_win_probability: 0.5,
    period: 1,
    clock_minutes: 15,
    clock_seconds: 0,
    ...overrides,
  }
}

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-theme')
})

describe('WinProbabilityChart', () => {
  it('renders inside the ChartFrame shell with a seeded rough layer', () => {
    const { container } = render(<WinProbabilityChart drives={drives} lineScores={lineScores} game={game} />)

    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')

    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.childElementCount).toBeGreaterThan(0)
  })

  it('renders an HTML legend below the svg and drops the native advantage-area fills', () => {
    const { container } = render(<WinProbabilityChart drives={drives} lineScores={lineScores} game={game} />)

    const svg = screen.getByRole('img')
    // Retired: native <path fill={teamColor}> advantage bands and <rect> legend chips.
    expect(svg.querySelectorAll('path[fill="#841617"]').length).toBe(0)
    expect(svg.querySelectorAll('rect').length).toBe(0)

    const legend = container.querySelector('.border-t')
    expect(legend).not.toBeNull()
    expect(within(legend as HTMLElement).getByText('Oklahoma')).toBeInTheDocument()
    expect(within(legend as HTMLElement).getByText('Houston')).toBeInTheDocument()
  })

  it('renders the framed EmptyState when win probability never leaves 50/50', () => {
    const tiedGame: LineScores = { home: [0, 0, 0, 0], away: [0, 0, 0, 0] }
    const { container } = render(
      <WinProbabilityChart drives={[]} lineScores={tiedGame} game={game} />,
    )

    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')
    expect(screen.getByRole('status')).toHaveTextContent('No win probability swing to show')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('redraws the rough layer with re-resolved ink when the theme flips (fallback ink)', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })

    const noTeamColors: GameWithTeams = { ...game, homeColor: null, awayColor: null }
    render(<WinProbabilityChart drives={drives} lineScores={lineScores} game={noTeamColors} />)

    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.querySelector('path[stroke="#111111"]')).toBeNull()

    document.documentElement.style.setProperty('--text-primary', '#111111')
    document.documentElement.setAttribute('data-theme', 'dark')

    await waitFor(() => {
      expect(roughLayer.querySelector('path[stroke="#111111"]')).not.toBeNull()
    })

    rafSpy.mockRestore()
  })

  it('renders the server-data path when given >= 2 usable win probability rows', () => {
    const serverWP: GameWinProbability[] = [
      wpRow({ play_id: '1', home_win_probability: 0.5, period: 1, clock_minutes: 15, clock_seconds: 0 }),
      wpRow({ play_id: '2', home_win_probability: 0.6, period: 1, clock_minutes: 10, clock_seconds: 0 }),
      wpRow({ play_id: '3', home_win_probability: 0.75, period: 4, clock_minutes: 1, clock_seconds: 0 }),
    ]

    render(<WinProbabilityChart drives={drives} lineScores={lineScores} game={game} serverWP={serverWP} />)

    expect(screen.getByRole('img', { name: /CFBD win probability model/ })).toBeInTheDocument()
    expect(screen.getByText('Source: CFBD win probability model')).toBeInTheDocument()
  })

  it('falls back to the heuristic path when serverWP is undefined', () => {
    render(<WinProbabilityChart drives={drives} lineScores={lineScores} game={game} />)

    expect(screen.getByRole('img', { name: /estimated from scores/ })).toBeInTheDocument()
    expect(
      screen.getByText('Estimated from scores (CFBD win probability data unavailable for this game)')
    ).toBeInTheDocument()
  })

  it('falls back to the heuristic path when serverWP is empty', () => {
    render(<WinProbabilityChart drives={drives} lineScores={lineScores} game={game} serverWP={[]} />)

    expect(screen.getByRole('img', { name: /estimated from scores/ })).toBeInTheDocument()
  })

  it('falls back to the heuristic path when serverWP has only 1 usable row', () => {
    const serverWP: GameWinProbability[] = [wpRow({ play_id: '1', home_win_probability: 0.5 })]

    render(<WinProbabilityChart drives={drives} lineScores={lineScores} game={game} serverWP={serverWP} />)

    expect(screen.getByRole('img', { name: /estimated from scores/ })).toBeInTheDocument()
  })

  it('falls back to the heuristic path when every row has a null home_win_probability', () => {
    const serverWP: GameWinProbability[] = [
      wpRow({ play_id: '1', home_win_probability: null }),
      wpRow({ play_id: '2', home_win_probability: null }),
    ]

    render(<WinProbabilityChart drives={drives} lineScores={lineScores} game={game} serverWP={serverWP} />)

    expect(screen.getByRole('img', { name: /estimated from scores/ })).toBeInTheDocument()
  })

  it('renders OT period labels on the server-data path when period 5+ rows are present', () => {
    const serverWP: GameWinProbability[] = [
      wpRow({ play_id: '1', home_win_probability: 0.5, period: 4, clock_minutes: 1, clock_seconds: 0 }),
      // Untimed OT downs: period known, clock null -- interpolated by play index within the period.
      wpRow({ play_id: '2', home_win_probability: 0.55, period: 5, clock_minutes: null, clock_seconds: null }),
      wpRow({ play_id: '3', home_win_probability: 0.62, period: 5, clock_minutes: null, clock_seconds: null }),
    ]

    render(<WinProbabilityChart drives={drives} lineScores={lineScores} game={game} serverWP={serverWP} />)

    expect(screen.getByText('OT1')).toBeInTheDocument()
  })
})
