/**
 * Smoke tests for GameTrendChart after its migration onto the shared chart
 * primitives (docs/chart-style-spec.md).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { GameTrendChart } from '../GameTrendChart'
import type { PlayerGameLogEntry } from '@/lib/types/database'

function entry(overrides: Partial<PlayerGameLogEntry> = {}): PlayerGameLogEntry {
  return {
    game_id: 1,
    season: 2025,
    team: 'Oklahoma',
    player_name: 'Jackson Arnold',
    play_category: 'passing',
    plays: 30,
    total_epa: 8.2,
    epa_per_play: 0.27,
    success_rate: 0.5,
    explosive_plays: 4,
    total_yards: 280,
    week: 1,
    opponent: 'Tennessee',
    home_away: 'home',
    result: 'W 35-14',
    over_under: null,
    ou_result: null,
    ...overrides,
  }
}

const GAME_LOG = [
  entry({ game_id: 1, week: 1, opponent: 'Tennessee', epa_per_play: 0.27 }),
  entry({ game_id: 2, week: 2, opponent: 'Alabama', epa_per_play: 0.12 }),
  entry({ game_id: 3, week: 3, opponent: 'Auburn', epa_per_play: 0.35 }),
]

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-theme')
})

describe('GameTrendChart', () => {
  it('renders an accessible svg inside the frame with a rough layer', () => {
    const { container } = render(<GameTrendChart gameLog={GAME_LOG} />)

    const svg = screen.getByRole('img', { name: /Game-by-game EPA \/ Play trend over the season/ })
    expect(svg.tagName.toLowerCase()).toBe('svg')

    // ChartFrame shell, not a hand-rolled wrapper
    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')

    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.childElementCount).toBeGreaterThan(0)
  })

  it('shows the idle tooltip prompt with reserved height before any hover', () => {
    render(<GameTrendChart gameLog={GAME_LOG} />)

    const tooltip = screen.getByTestId('chart-tooltip')
    expect(within(tooltip).getByText('Hover a game for details')).toBeInTheDocument()
    expect(tooltip.style.minHeight).not.toBe('')
  })

  it('shows game details in the panel-below tooltip on hover, with an in-SVG crosshair', () => {
    const { container } = render(<GameTrendChart gameLog={GAME_LOG} />)

    const hoverRects = container.querySelectorAll('rect[fill="transparent"]')
    expect(hoverRects.length).toBe(3)

    fireEvent.mouseEnter(hoverRects[1])

    const tooltip = screen.getByTestId('chart-tooltip')
    expect(within(tooltip).getByText('Week 2 vs Alabama')).toBeInTheDocument()
    expect(within(tooltip).getByText('EPA / Play:')).toBeInTheDocument()
    expect(within(tooltip).getByText('0.120')).toBeInTheDocument()

    expect(container.querySelector('line[stroke-dasharray="4 2"]')).toBeInTheDocument()
  })

  it('renders the framed EmptyState when there is no game log data', () => {
    render(<GameTrendChart gameLog={[]} />)

    expect(screen.getByRole('status')).toHaveTextContent('No game log data available')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('redraws the rough layer with re-resolved ink when the theme flips', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })

    render(<GameTrendChart gameLog={GAME_LOG} />)

    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.querySelector('path[stroke="#222222"]')).toBeNull()

    document.documentElement.style.setProperty('--color-run', '#222222')
    document.documentElement.setAttribute('data-theme', 'dark')

    await waitFor(() => {
      expect(roughLayer.querySelector('path[stroke="#222222"]')).not.toBeNull()
    })

    rafSpy.mockRestore()
  })
})
