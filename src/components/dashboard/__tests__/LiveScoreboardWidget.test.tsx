import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import { LiveScoreboardWidget, isLiveWindow } from '../LiveScoreboardWidget'
import { fetchLiveScoreboard } from '@/app/live/actions'
import {
  createPregameScoreboardRow,
  createInProgressScoreboardRow,
  createFinalScoreboardRow,
} from '@/lib/queries/__tests__/fixtures/live'

vi.mock('@/app/live/actions', () => ({
  fetchLiveScoreboard: vi.fn(),
}))

const mockFetchLiveScoreboard = vi.mocked(fetchLiveScoreboard)

// Fixture rows are typed against LiveScoreboardRow (fixtures module); the
// widget consumes LiveScoreboardGame (actions module) -- structurally
// identical row shapes, see src/lib/queries/live.ts.
const pregame = createPregameScoreboardRow()
const inProgress = createInProgressScoreboardRow()
const final = createFinalScoreboardRow()

// Fixed reference points for isLiveWindow.
const OFF_SEASON_TUESDAY = new Date('2026-07-21T16:00:00Z') // Tue Jul 21 2026, noon ET
const IN_SEASON_SATURDAY = new Date('2025-11-29T17:00:00Z') // Sat Nov 29 2025, noon ET
const OFF_SEASON_SATURDAY = new Date('2026-03-14T17:00:00Z') // Sat Mar 14 2026 (Saturday, but off-season month)

describe('isLiveWindow', () => {
  it('is false on an off-season Tuesday with no rows', () => {
    expect(isLiveWindow(OFF_SEASON_TUESDAY, false)).toBe(false)
  })

  it('is true on any day when there are rows', () => {
    expect(isLiveWindow(OFF_SEASON_TUESDAY, true)).toBe(true)
  })

  it('is true on an in-season Saturday even with no rows', () => {
    expect(isLiveWindow(IN_SEASON_SATURDAY, false)).toBe(true)
  })

  it('is false on a Saturday outside the Aug-Jan window with no rows', () => {
    expect(isLiveWindow(OFF_SEASON_SATURDAY, false)).toBe(false)
  })
})

describe('LiveScoreboardWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(OFF_SEASON_TUESDAY)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders null when gated off (no rows, off-season day)', () => {
    const { container } = render(<LiveScoreboardWidget initialGames={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders pregame, in-progress, and final rows with their status lines', () => {
    render(<LiveScoreboardWidget initialGames={[final, inProgress, pregame]} />)

    expect(screen.getByText('Live Scoreboard')).toBeInTheDocument()

    const links = screen.getAllByRole('link')
    const getRow = (gameId: number) => {
      const link = links.find((l) => l.getAttribute('href') === `/games/${gameId}`)
      if (!link) throw new Error(`No row link for game ${gameId}`)
      return within(link)
    }

    // Pregame: away @ home, no score, start context + spread + O/U.
    const pregameRow = getRow(pregame.game_id)
    expect(pregameRow.getByText('Air Force')).toBeInTheDocument()
    expect(pregameRow.getByText('Boise State')).toBeInTheDocument()
    expect(pregameRow.getByText('Week 14 · Boise State -6.5 · O/U 51.5')).toBeInTheDocument()

    // In-progress: away/home + points, period + clock, win prob (house_live_home_wp 0.71 -> home leads).
    const inProgressRow = getRow(inProgress.game_id)
    expect(inProgressRow.getByText('Michigan')).toBeInTheDocument()
    expect(inProgressRow.getByText('10')).toBeInTheDocument()
    expect(inProgressRow.getByText('Ohio State')).toBeInTheDocument()
    expect(inProgressRow.getByText('14')).toBeInTheDocument()
    expect(inProgressRow.getByText(/Q2 08:41/)).toBeInTheDocument()
    expect(inProgressRow.getByText('· Ohio State 71%')).toBeInTheDocument()

    // Final: away/home + settled score, "Final" + winner bolded.
    const finalRow = getRow(final.game_id)
    expect(finalRow.getByText('Purdue')).toBeInTheDocument()
    expect(finalRow.getByText('14')).toBeInTheDocument()
    expect(finalRow.getByText('38')).toBeInTheDocument()
    expect(finalRow.getByText('Ohio State', { selector: 'span.font-semibold' })).toBeInTheDocument()
    expect(finalRow.getByText('Final', { exact: false })).toBeInTheDocument()
  })

  it('renders the designed empty state when visible (in-season Saturday) but no games are posted yet', () => {
    vi.setSystemTime(IN_SEASON_SATURDAY)

    render(<LiveScoreboardWidget initialGames={[]} />)

    expect(screen.getByText('Live Scoreboard')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(
      screen.getByText('No games on the board right now — check back at kickoff.')
    ).toBeInTheDocument()
  })

  it('polls fetchLiveScoreboard every 5 minutes while any row is non-final', async () => {
    mockFetchLiveScoreboard.mockResolvedValue([inProgress])

    render(<LiveScoreboardWidget initialGames={[inProgress]} />)

    expect(mockFetchLiveScoreboard).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    })

    expect(mockFetchLiveScoreboard).toHaveBeenCalledTimes(1)
  })

  it('does not poll when all rows are final', async () => {
    render(<LiveScoreboardWidget initialGames={[final]} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    })

    expect(mockFetchLiveScoreboard).not.toHaveBeenCalled()
  })

  it('does not poll when the game list is empty', async () => {
    vi.setSystemTime(IN_SEASON_SATURDAY)

    render(<LiveScoreboardWidget initialGames={[]} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    })

    expect(mockFetchLiveScoreboard).not.toHaveBeenCalled()
  })
})
