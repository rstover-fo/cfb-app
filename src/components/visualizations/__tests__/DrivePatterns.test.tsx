/**
 * Smoke tests for DrivePatterns, focused on the Phase 4 fix documented in
 * the chart-theme sweep: DrivePatterns previously had no theme-redraw
 * observer (unlike every other roughjs chart), so a dark/light flip left
 * its bars drawn in the stale palette. It now uses useChartTheme like the
 * rest of the roughjs charts.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
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
