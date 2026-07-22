/**
 * Unit tests for DriveFieldOverlay's primitives conformance
 * (docs/chart-style-spec.md): ChartFrame shell + built-in EmptyState,
 * ChartLegend (HTML, outside the SVG) instead of the hand-rolled legend,
 * and the canonical rough-draw pattern (roughGroupRef + drawChart +
 * useChartTheme + fixed seed) drawing over the untouched FootballField.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { DriveFieldOverlay } from '../DriveFieldOverlay'
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

describe('DriveFieldOverlay', () => {
  it('renders inside the ChartFrame shell with the field, a rough layer, and an HTML legend', () => {
    const { container } = render(<DriveFieldOverlay drives={DRIVES} game={GAME} />)

    // ChartFrame shell, not the old hand-rolled wrapper.
    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')
    expect(shell.className).toContain('rounded-lg')

    // FootballField carries its own role/aria-label (spec §2) — untouched.
    const svg = screen.getByRole('img', {
      name: `Field view of ${DRIVES.length} drives for Oklahoma vs Houston, plotted by starting and ending field position`,
    })
    expect(svg.tagName.toLowerCase()).toBe('svg')

    // One line + one arrowhead per drive in the rough layer.
    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.childElementCount).toBe(DRIVES.length * 2)

    // Legend is HTML, outside the SVG (ChartLegend), not the retired
    // in-SVG/hand-rolled swatch chips.
    expect(roughLayer.querySelector('text')).toBeNull()
    expect(screen.getByText('TD')).toBeInTheDocument()
    expect(screen.getByText('FG')).toBeInTheDocument()
    expect(screen.getByText('Punt')).toBeInTheDocument()
  })

  it('renders the framed EmptyState instead of the field when there are no drives', () => {
    const { container } = render(<DriveFieldOverlay drives={[]} game={GAME} />)

    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')
    expect(screen.getByRole('status')).toHaveTextContent('No drives to plot')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByText('TD')).not.toBeInTheDocument()
  })

  it('redraws the rough layer (lines + arrowheads) when the document theme flips', async () => {
    render(<DriveFieldOverlay drives={DRIVES} game={GAME} />)

    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.childElementCount).toBe(DRIVES.length * 2)

    // Plant a sentinel: a redraw clears the group via the while-loop
    // child-clearing pattern, so the sentinel vanishing proves drawChart
    // re-ran after the theme mutation.
    const sentinel = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    sentinel.setAttribute('data-testid', 'redraw-sentinel')
    roughLayer.appendChild(sentinel)

    document.documentElement.setAttribute('data-theme', 'dark')

    await waitFor(() => {
      expect(roughLayer.contains(sentinel)).toBe(false)
    })
    expect(roughLayer.childElementCount).toBe(DRIVES.length * 2)
  })

  it('draws a single drive centered in its swim lane without dividing by zero', () => {
    const singleHomeDrive = [createGameDriveRow({ drive_number: 1, is_home_offense: true })] as GameDrive[]

    render(<DriveFieldOverlay drives={singleHomeDrive} game={GAME} />)

    const roughLayer = screen.getByTestId('rough-layer')
    // One line + one arrowhead for the lone drive.
    expect(roughLayer.childElementCount).toBe(2)
  })
})
