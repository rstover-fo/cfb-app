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
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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

describe('WinProbabilityChart', () => {
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
