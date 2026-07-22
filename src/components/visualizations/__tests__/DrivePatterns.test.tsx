/**
 * Smoke tests for DrivePatterns, focused on the Phase 4 fix documented in
 * the chart-theme sweep: DrivePatterns previously had no theme-redraw
 * observer (unlike every other roughjs chart), so a dark/light flip left
 * its bars drawn in the stale palette. It now uses useChartTheme like the
 * rest of the roughjs charts.
 *
 * Also covers the B6 sweep migration onto the shared chart primitives
 * (docs/chart-style-spec.md): ChartFrame shell, the panel-below ChartTooltip
 * replacing the old floating shadow-lg tooltip, and the framed EmptyState.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react'
import { DrivePatterns } from '../DrivePatterns'
import type { DrivePattern } from '@/lib/types/database'

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

function pattern(overrides: Partial<DrivePattern> = {}): DrivePattern {
  return {
    outcome: 'touchdown',
    start_yard: 25,
    end_yard: 100,
    count: 3,
    avg_plays: 6.5,
    avg_yards: 75,
    ...overrides,
  }
}

describe('DrivePatterns', () => {
  it('renders the offense/defense toggle and the outcome filter for the given drives', () => {
    render(
      <DrivePatterns
        offenseDrives={[pattern()]}
        defenseDrives={[pattern({ outcome: 'punt', start_yard: 30, end_yard: 40, count: 2 })]}
        teamName="Oklahoma"
      />
    )

    expect(screen.getByRole('button', { name: 'Our Drives' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Opponent Drives' })).toBeInTheDocument()
    // The outcome filter button label, not the roughjs-drawn SVG lane label
    // (both render "Touchdown" text -- disambiguate via the button role).
    expect(screen.getByRole('button', { name: /Touchdown/ })).toBeInTheDocument()
  })

  it('sits inside the ChartFrame shell with a seeded rough layer', () => {
    const { container } = render(
      <DrivePatterns offenseDrives={[pattern()]} defenseDrives={[]} teamName="Oklahoma" />
    )

    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')

    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.childElementCount).toBeGreaterThan(0)
  })

  it('shows the idle tooltip prompt, then bar details in the panel-below ChartTooltip on hover', () => {
    const { container } = render(
      <DrivePatterns
        offenseDrives={[pattern({ start_yard: 25, end_yard: 100, count: 3, avg_plays: 6.5, avg_yards: 75 })]}
        defenseDrives={[]}
        teamName="Oklahoma"
      />
    )

    const tooltip = screen.getByTestId('chart-tooltip')
    expect(within(tooltip).getByText('Hover a drive bar for details')).toBeInTheDocument()

    const hitRects = container.querySelectorAll('rect[fill="transparent"]')
    // First transparent rect is the field-wide "clear" target; bar hit-rects follow.
    expect(hitRects.length).toBeGreaterThan(1)
    fireEvent.mouseEnter(hitRects[1])

    expect(within(tooltip).getByText('Drives:')).toBeInTheDocument()
    expect(within(tooltip).getByText('3')).toBeInTheDocument()
    expect(within(tooltip).getByText('6.5 plays · 75 yds')).toBeInTheDocument()
  })

  it('renders the framed EmptyState when there are no drives for either side', () => {
    const { container } = render(
      <DrivePatterns offenseDrives={[]} defenseDrives={[]} teamName="Oklahoma" />
    )

    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')
    expect(screen.getByRole('status')).toHaveTextContent('No drive data for this team')
    expect(screen.queryByRole('button', { name: 'Our Drives' })).not.toBeInTheDocument()
  })

  it('redraws without throwing when the theme flips', async () => {
    // Deliberately not mocking requestAnimationFrame here: DrivePatterns
    // schedules its own staggered-entrance rAF loop independent of
    // useChartTheme's, and a synchronous rAF mock (fine for the other
    // charts' theme.test.ts-style specs) recurses that loop infinitely
    // since its elapsed-time math never advances.
    render(
      <DrivePatterns
        offenseDrives={[pattern()]}
        defenseDrives={[]}
        teamName="Oklahoma"
      />
    )

    act(() => {
      document.documentElement.setAttribute('data-theme', 'dark')
    })

    // MutationObserver callbacks fire as microtasks, then schedule a real
    // rAF; give both a tick to run without throwing.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Our Drives' })).toBeInTheDocument()
    })
  })
})
