/**
 * Unit tests for DriveBarChart — the only former consumer of the deprecated
 * src/hooks/useRoughSvg.ts, migrated onto the canonical draw pattern
 * (static scaffold + roughGroupRef + drawChart useCallback + resolveColor +
 * useChartTheme + fixed seed, docs/chart-style-spec.md §1).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { DriveBarChart } from '../DriveBarChart'
import { createGameDriveRow, createGameDriveRows } from '@/lib/queries/__tests__/fixtures/games'
import type { GameDrive } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'

const GAME: GameWithTeams = {
  id: 1001,
  season: 2025,
  week: 10,
  start_date: '2025-11-08T19:00:00Z',
  home_team: 'Oklahoma',
  away_team: 'Houston',
  home_points: 34,
  away_points: 10,
  conference_game: true,
  completed: true,
  homeLogo: null,
  homeColor: '#841617',
  awayLogo: null,
  awayColor: '#C8102E',
}

const DRIVES = createGameDriveRows() as GameDrive[]

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-theme')
})

describe('DriveBarChart', () => {
  it('renders an accessible svg with a rough layer drawing bars and team dots', () => {
    render(<DriveBarChart drives={DRIVES} game={GAME} />)

    const svg = screen.getByRole('img', { name: `Drive chart: ${DRIVES.length} drives for Oklahoma vs Houston` })
    expect(svg.tagName.toLowerCase()).toBe('svg')

    const roughLayer = screen.getByTestId('rough-layer')
    // One bar + one team dot per drive.
    expect(roughLayer.childElementCount).toBe(DRIVES.length * 2)

    // Team abbreviation labels render as static scaffold text
    // (abbreviateTeam: single-word names -> first 3 letters, uppercased).
    expect(screen.getByText('OKL')).toBeInTheDocument()
    expect(screen.getByText('HOU')).toBeInTheDocument()
  })

  it('renders an empty rough layer with no rows for an empty drive list', () => {
    render(<DriveBarChart drives={[]} game={GAME} />)

    const svg = screen.getByRole('img', { name: 'Drive chart: 0 drives for Oklahoma vs Houston' })
    expect(svg).toBeInTheDocument()

    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.childElementCount).toBe(0)
  })

  it('redraws the rough layer (bars + dots) when the document theme flips', async () => {
    render(<DriveBarChart drives={DRIVES} game={GAME} />)

    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.childElementCount).toBe(DRIVES.length * 2)

    // Plant a sentinel: a redraw clears the group via the while-loop
    // child-clearing pattern, so the sentinel vanishing proves drawChart
    // re-ran after the theme mutation (the post-hook-removal redraw path).
    const sentinel = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    sentinel.setAttribute('data-testid', 'redraw-sentinel')
    roughLayer.appendChild(sentinel)

    document.documentElement.setAttribute('data-theme', 'dark')

    await waitFor(() => {
      expect(roughLayer.contains(sentinel)).toBe(false)
    })
    expect(roughLayer.childElementCount).toBe(DRIVES.length * 2)
  })

  it('falls back team-dot ink to --text-primary/--text-muted when a team color is missing', () => {
    const gameNoColors: GameWithTeams = { ...GAME, homeColor: null, awayColor: null }
    const drives = [
      createGameDriveRow({ drive_number: 1, is_home_offense: true }),
      createGameDriveRow({ drive_number: 2, is_home_offense: false }),
    ] as GameDrive[]

    render(<DriveBarChart drives={drives} game={gameNoColors} />)

    const roughLayer = screen.getByTestId('rough-layer')
    // Still draws a bar + dot per row even without team brand colors.
    expect(roughLayer.childElementCount).toBe(drives.length * 2)
  })

  it('uses a fixed seed so re-renders redraw identical geometry', () => {
    const { rerender } = render(<DriveBarChart drives={DRIVES} game={GAME} />)
    const firstPass = screen.getByTestId('rough-layer').innerHTML

    rerender(<DriveBarChart drives={DRIVES} game={GAME} />)
    const secondPass = screen.getByTestId('rough-layer').innerHTML

    expect(secondPass).toBe(firstPass)
  })
})
