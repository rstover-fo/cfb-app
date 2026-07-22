/**
 * Unit tests for TrajectoryChart, the canonical reference chart for the
 * shared primitives in src/lib/charts (ChartFrame, ChartTooltip,
 * ChartLegend, axes/series helpers).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { TrajectoryChart } from '../TrajectoryChart'
import type { TeamSeasonTrajectory, TrajectoryAverages } from '@/lib/types/database'

function createTrajectoryRow(overrides: Partial<TeamSeasonTrajectory> = {}): TeamSeasonTrajectory {
  return {
    team: 'Ohio State',
    season: 2021,
    wins: 8,
    win_pct: 0.667,
    epa_per_play: 0.15,
    success_rate: 0.46,
    off_epa_rank: 12,
    def_epa_rank: 8,
    recruiting_rank: 4,
    epa_delta: 0.02,
    prev_epa: 0.13,
    games: 12,
    era_code: 'day',
    era_name: 'Ryan Day era',
    ...overrides,
  }
}

function createAveragesRow(overrides: Partial<TrajectoryAverages> = {}): TrajectoryAverages {
  return {
    season: 2021,
    conf_wins: 7.2,
    conf_win_pct: 0.55,
    conf_epa_per_play: 0.05,
    conf_success_rate: 0.43,
    conf_off_epa_rank: 40,
    conf_def_epa_rank: 45,
    conf_recruiting_rank: 30,
    fbs_wins: 6.5,
    fbs_win_pct: 0.5,
    fbs_epa_per_play: 0.0,
    fbs_success_rate: 0.42,
    fbs_off_epa_rank: 65,
    fbs_def_epa_rank: 65,
    fbs_recruiting_rank: 65,
    ...overrides,
  }
}

const TRAJECTORY = [2021, 2022, 2023, 2024].map((season, i) =>
  createTrajectoryRow({ season, wins: 8 + i + (i === 3 ? 1 : 0) }), // 8, 9, 10, 12
)
const AVERAGES = [2021, 2022, 2023, 2024].map(season => createAveragesRow({ season }))

function renderChart() {
  return render(
    <TrajectoryChart
      trajectory={TRAJECTORY}
      averages={AVERAGES}
      conference="Big Ten"
      teamName="Ohio State"
    />,
  )
}

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-theme')
})

describe('TrajectoryChart', () => {
  it('renders an accessible svg inside the frame with a rough layer', () => {
    const { container } = renderChart()

    const svg = screen.getByRole('img', {
      name: /Wins by season for Ohio State from 2021 to 2024, compared to Big Ten and FBS averages/,
    })
    expect(svg.tagName.toLowerCase()).toBe('svg')

    // ChartFrame shell, not a hand-rolled wrapper
    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')

    // Seeded rough layer drew the series
    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.childElementCount).toBeGreaterThan(0)
  })

  it('shows the idle tooltip prompt with reserved height before any hover', () => {
    renderChart()

    const tooltip = screen.getByTestId('chart-tooltip')
    expect(within(tooltip).getByText('Hover a season for details')).toBeInTheDocument()
    expect(tooltip.style.minHeight).not.toBe('')
  })

  it('shows season details in the panel-below tooltip on hover', () => {
    const { container } = renderChart()

    const hoverRects = container.querySelectorAll('rect[fill="transparent"]')
    expect(hoverRects.length).toBe(4)

    fireEvent.mouseEnter(hoverRects[3])

    const tooltip = screen.getByTestId('chart-tooltip')
    expect(within(tooltip).getByText('2024')).toBeInTheDocument()
    expect(within(tooltip).getByText('Team:')).toBeInTheDocument()
    expect(within(tooltip).getByText('12.0')).toBeInTheDocument()
    expect(within(tooltip).getByText('Big Ten avg:')).toBeInTheDocument()
    expect(within(tooltip).getByText('7.2')).toBeInTheDocument()
    expect(within(tooltip).getByText('FBS avg:')).toBeInTheDocument()
    expect(within(tooltip).getByText('6.5')).toBeInTheDocument()
  })

  it('toggles series visibility via the aria-pressed legend buttons', () => {
    const { container } = renderChart()

    const teamButton = screen.getByRole('button', { name: 'Team' })
    expect(teamButton).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(teamButton)

    expect(teamButton).toHaveAttribute('aria-pressed', 'false')
    expect(teamButton.className).toContain('opacity-40')

    // Hidden series drops out of the tooltip too
    const hoverRects = container.querySelectorAll('rect[fill="transparent"]')
    fireEvent.mouseEnter(hoverRects[0])
    const tooltip = screen.getByTestId('chart-tooltip')
    expect(within(tooltip).queryByText('Team:')).not.toBeInTheDocument()
    expect(within(tooltip).getByText('Big Ten avg:')).toBeInTheDocument()
  })

  it('renders the framed EmptyState when there is no trajectory data', () => {
    const { container } = render(
      <TrajectoryChart trajectory={[]} averages={null} conference="Big Ten" teamName="Ohio State" />,
    )

    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')
    expect(screen.getByRole('status')).toHaveTextContent('No trajectory data for this team')
    expect(
      screen.getByText("Historical data publishes after a team's first FBS season."),
    ).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('redraws the rough layer with re-resolved ink when the theme flips', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })

    renderChart()

    const roughLayer = screen.getByTestId('rough-layer')
    // Tokens are unset in jsdom, so initial ink is resolveColor's fallback.
    expect(roughLayer.querySelector('path[stroke="#111111"]')).toBeNull()

    // Flip the theme with a new --color-run value; the redraw must re-resolve it.
    document.documentElement.style.setProperty('--color-run', '#111111')
    document.documentElement.setAttribute('data-theme', 'dark')

    await waitFor(() => {
      expect(roughLayer.querySelector('path[stroke="#111111"]')).not.toBeNull()
    })

    rafSpy.mockRestore()
  })
})
