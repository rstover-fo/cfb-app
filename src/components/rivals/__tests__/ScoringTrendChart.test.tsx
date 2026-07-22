/**
 * Smoke tests for ScoringTrendChart after its migration onto the shared
 * chart primitives (docs/chart-style-spec.md).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { ScoringTrendChart } from '../ScoringTrendChart'
import type { MatchupGame } from '@/lib/queries/matchups'

const TEAM_A = { name: 'Oklahoma', logo: null, color: '#841617' }
const TEAM_B = { name: 'Texas', logo: null, color: '#BF5700' }

function game(overrides: Partial<MatchupGame> = {}): MatchupGame {
  return {
    gameId: 1,
    season: 2024,
    week: 6,
    seasonType: 'regular',
    startDate: '2024-10-12',
    neutralSite: true,
    teamAScore: 3,
    teamBScore: 34,
    teamAHome: false,
    winner: 'Texas',
    result: 'L',
    venue: null,
    ...overrides,
  }
}

// getMatchupGames returns most-recent-first.
const GAMES = [
  game({ gameId: 3, season: 2024, teamAScore: 3, teamBScore: 34 }),
  game({ gameId: 2, season: 2023, teamAScore: 34, teamBScore: 30 }),
  game({ gameId: 1, season: 2022, teamAScore: 49, teamBScore: 0 }),
]

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-theme')
})

describe('ScoringTrendChart', () => {
  it('renders an accessible svg inside the frame with a rough layer', () => {
    const { container } = render(
      <ScoringTrendChart games={GAMES} teamAMeta={TEAM_A} teamBMeta={TEAM_B} />,
    )

    const svg = screen.getByRole('img', {
      name: 'Points scored by Oklahoma and Texas in each meeting',
    })
    expect(svg.tagName.toLowerCase()).toBe('svg')

    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')

    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.childElementCount).toBeGreaterThan(0)
  })

  it('renders the HTML legend with both team swatches', () => {
    render(<ScoringTrendChart games={GAMES} teamAMeta={TEAM_A} teamBMeta={TEAM_B} />)

    expect(screen.getByText('Oklahoma')).toBeInTheDocument()
    expect(screen.getByText('Texas')).toBeInTheDocument()
  })

  it('shows the idle tooltip prompt with reserved height before any hover', () => {
    render(<ScoringTrendChart games={GAMES} teamAMeta={TEAM_A} teamBMeta={TEAM_B} />)

    const tooltip = screen.getByTestId('chart-tooltip')
    expect(within(tooltip).getByText('Hover a meeting for details')).toBeInTheDocument()
    expect(tooltip.style.minHeight).not.toBe('')
  })

  it('shows both team scores in the panel-below tooltip on hover', () => {
    const { container } = render(
      <ScoringTrendChart games={GAMES} teamAMeta={TEAM_A} teamBMeta={TEAM_B} />,
    )

    const hoverRects = container.querySelectorAll('rect[fill="transparent"]')
    expect(hoverRects.length).toBe(3)

    // Series is reversed to chronological order: oldest meeting (2022) first.
    fireEvent.mouseEnter(hoverRects[0])

    const tooltip = screen.getByTestId('chart-tooltip')
    expect(within(tooltip).getByText('2022')).toBeInTheDocument()
    expect(within(tooltip).getByText('Oklahoma:')).toBeInTheDocument()
    expect(within(tooltip).getByText('49')).toBeInTheDocument()
    expect(within(tooltip).getByText('Texas:')).toBeInTheDocument()
    expect(within(tooltip).getByText('0')).toBeInTheDocument()
  })

  it('renders the framed EmptyState when there are no games', () => {
    render(<ScoringTrendChart games={[]} teamAMeta={TEAM_A} teamBMeta={TEAM_B} />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Not enough scoring data to chart this matchup',
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('falls back to token ink when a team has no brand color', () => {
    const noColorTeam = { name: 'Rice', logo: null, color: null }
    render(<ScoringTrendChart games={GAMES} teamAMeta={noColorTeam} teamBMeta={TEAM_B} />)

    // Legend swatch falls back to the --text-primary token, not a raw hex.
    const legendLabel = screen.getByText('Rice')
    const swatch = legendLabel.parentElement?.querySelector('span[aria-hidden="true"]')
    expect(swatch).toHaveStyle({ backgroundColor: 'var(--text-primary)' })
  })

  it('redraws the rough layer with re-resolved ink when the theme flips', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })

    const noColorTeam = { name: 'Rice', logo: null, color: null }
    render(<ScoringTrendChart games={GAMES} teamAMeta={noColorTeam} teamBMeta={TEAM_B} />)

    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.querySelector('path[stroke="#333333"]')).toBeNull()

    document.documentElement.style.setProperty('--text-primary', '#333333')
    document.documentElement.setAttribute('data-theme', 'dark')

    await waitFor(() => {
      expect(roughLayer.querySelector('path[stroke="#333333"]')).not.toBeNull()
    })

    rafSpy.mockRestore()
  })
})
