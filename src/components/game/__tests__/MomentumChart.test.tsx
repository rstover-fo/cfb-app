/**
 * Smoke tests for MomentumChart: render + empty-state + theme-flip, per the
 * shared-primitives migration in docs/chart-style-spec.md.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import { MomentumChart } from '../MomentumChart'
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

const lineScores: LineScores = {
  home: [7, 7, 7, 7],
  away: [0, 7, 0, 7],
}

// drives is accepted only for interface compatibility with ScoringTimeline's tabs.
const drives: GameDrive[] = []

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-theme')
})

describe('MomentumChart', () => {
  it('renders an accessible svg inside the frame with a seeded rough layer', () => {
    const { container } = render(<MomentumChart drives={drives} lineScores={lineScores} game={game} />)

    const svg = screen.getByRole('img', { name: /Quarter scoring momentum: Oklahoma 28, Houston 14/ })
    expect(svg.tagName.toLowerCase()).toBe('svg')

    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')

    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.childElementCount).toBeGreaterThan(0)
  })

  it('renders an HTML legend below the svg, not in-SVG legend chips', () => {
    const { container } = render(<MomentumChart drives={drives} lineScores={lineScores} game={game} />)

    const svg = screen.getByRole('img')
    // Retired: in-SVG <rect> legend swatches.
    expect(svg.querySelectorAll('rect').length).toBe(0)

    const legend = container.querySelector('.border-t')
    expect(legend).not.toBeNull()
    expect(within(legend as HTMLElement).getByText('Oklahoma')).toBeInTheDocument()
    expect(within(legend as HTMLElement).getByText('Houston')).toBeInTheDocument()
  })

  it('renders the framed EmptyState when every quarter is tied', () => {
    const tiedLineScores: LineScores = { home: [3, 3, 3, 3], away: [3, 3, 3, 3] }
    const { container } = render(<MomentumChart drives={drives} lineScores={tiedLineScores} game={game} />)

    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')
    expect(screen.getByRole('status')).toHaveTextContent('No quarter-by-quarter swing to show')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('redraws the rough layer with re-resolved ink when the theme flips (fallback ink)', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })

    const noTeamColors: GameWithTeams = { ...game, homeColor: null, awayColor: null }
    render(<MomentumChart drives={drives} lineScores={lineScores} game={noTeamColors} />)

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
