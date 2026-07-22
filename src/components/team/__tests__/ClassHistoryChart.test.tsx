/**
 * Smoke tests for ClassHistoryChart's B6 sweep migration onto the shared
 * chart primitives (docs/chart-style-spec.md): ChartFrame shell (title slot
 * replacing the hand-rolled <section>/<h2>), the panel-below ChartTooltip
 * replacing the SVG-drawn rect/text tooltip, the HTML ChartLegend replacing
 * the opacity-swatch legend, and the framed EmptyState.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { ClassHistoryChart } from '../ClassHistoryChart'
import type { RecruitingClassHistory } from '@/lib/types/database'

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-theme')
})

function historyRow(overrides: Partial<RecruitingClassHistory> = {}): RecruitingClassHistory {
  return {
    year: 2021,
    rank: 10,
    points: 250.5,
    five_stars: 1,
    four_stars: 10,
    three_stars: 12,
    two_stars: 2,
    total_commits: 25,
    ...overrides,
  }
}

const DATA = [2021, 2022, 2023].map(year => historyRow({ year, rank: 25 - year + 2021 }))

function renderChart(overrides: Partial<{ data: RecruitingClassHistory[]; currentSeason: number; teamColor: string | null }> = {}) {
  return render(
    <ClassHistoryChart
      data={overrides.data ?? DATA}
      currentSeason={overrides.currentSeason ?? 2023}
      teamColor={overrides.teamColor ?? '#841617'}
    />,
  )
}

describe('ClassHistoryChart', () => {
  it('renders inside the ChartFrame shell with a title slot and a seeded rough layer', () => {
    const { container } = renderChart()

    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')
    expect(screen.getByRole('heading', { name: 'Recruiting Class History' })).toBeInTheDocument()

    const svg = screen.getByRole('img', { name: /Recruiting class history from 2021 to 2023/ })
    expect(svg.tagName.toLowerCase()).toBe('svg')

    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.childElementCount).toBeGreaterThan(0)
  })

  it('shows the idle tooltip prompt with reserved height before any hover', () => {
    renderChart()

    const tooltip = screen.getByTestId('chart-tooltip')
    expect(within(tooltip).getByText('Hover a year for details')).toBeInTheDocument()
    expect(tooltip.style.minHeight).not.toBe('')
  })

  it('shows year details in the panel-below tooltip on hover', () => {
    const { container } = renderChart()

    const hoverRects = container.querySelectorAll('rect[fill="transparent"]')
    expect(hoverRects.length).toBe(DATA.length)

    fireEvent.mouseEnter(hoverRects[0])

    const tooltip = screen.getByTestId('chart-tooltip')
    expect(within(tooltip).getByText('2021')).toBeInTheDocument()
    expect(within(tooltip).getByText('Commits:')).toBeInTheDocument()
    expect(within(tooltip).getByText('25')).toBeInTheDocument()
    expect(within(tooltip).getByText('Class rank:')).toBeInTheDocument()
  })

  it('renders the HTML star-tier + class-rank legend outside the SVG', () => {
    renderChart()

    const legend = screen.getByText('2-star').closest('div') as HTMLElement
    expect(legend).not.toBeNull()
    expect(within(legend).getByText('5-star')).toBeInTheDocument()
    expect(within(legend).getByText('Class Rank')).toBeInTheDocument()
  })

  it('renders the framed EmptyState when there is no class history', () => {
    const { container } = renderChart({ data: [] })

    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')
    expect(screen.getByRole('status')).toHaveTextContent('No recruiting class history for this team')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('redraws the rough layer with re-resolved ink when the theme flips', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })

    renderChart({ teamColor: null })

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
