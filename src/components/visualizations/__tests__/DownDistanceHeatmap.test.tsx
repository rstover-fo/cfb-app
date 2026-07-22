import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { DownDistanceHeatmap } from '../DownDistanceHeatmap'
import type { DownDistanceSplit } from '@/lib/types/database'

function split(overrides: Partial<DownDistanceSplit>): DownDistanceSplit {
  return {
    down: 1,
    distance_bucket: '1-3',
    side: 'offense',
    success_rate: 0.5,
    conversion_rate: 0.5,
    epa_per_play: 0.1,
    play_count: 10,
    ...overrides,
  }
}

describe('DownDistanceHeatmap', () => {
  it('buckets offense success rate onto the five-token heat ramp (.55/.45/.35 thresholds)', () => {
    const data: DownDistanceSplit[] = [
      split({ down: 1, distance_bucket: '1-3', success_rate: 0.6 }), // >= .55 -> heat-5
      split({ down: 2, distance_bucket: '1-3', success_rate: 0.5 }), // >= .45 -> heat-4
      split({ down: 3, distance_bucket: '1-3', success_rate: 0.4 }), // >= .35 -> heat-3
      split({ down: 4, distance_bucket: '1-3', success_rate: 0.1 }), // else -> heat-1
    ]
    render(<DownDistanceHeatmap data={data} side="offense" title="Offense" />)

    expect(screen.getByLabelText(/1st and 1-3/)).toHaveStyle({ backgroundColor: 'var(--heat-5)' })
    expect(screen.getByLabelText(/2nd and 1-3/)).toHaveStyle({ backgroundColor: 'var(--heat-4)' })
    expect(screen.getByLabelText(/3rd and 1-3/)).toHaveStyle({ backgroundColor: 'var(--heat-3)' })
    expect(screen.getByLabelText(/4th and 1-3/)).toHaveStyle({ backgroundColor: 'var(--heat-1)' })
  })

  it('inverts the rate for defense before bucketing', () => {
    // Defense: raw success_rate 0.1 -> normalized 0.9 -> heat-5 (elite defense)
    const data: DownDistanceSplit[] = [
      split({ down: 1, distance_bucket: '1-3', side: 'defense', success_rate: 0.1 }),
    ]
    render(<DownDistanceHeatmap data={data} side="defense" title="Defense" />)

    expect(screen.getByLabelText(/1st and 1-3/)).toHaveStyle({ backgroundColor: 'var(--heat-5)' })
  })

  it('gives no-data cells the surface-alt background with no heat color', () => {
    render(<DownDistanceHeatmap data={[]} side="offense" title="Offense" />)
    expect(screen.getByLabelText(/1st and 1-3: No data/)).toHaveStyle({ backgroundColor: 'var(--bg-surface-alt)' })
  })

  it('never uses a floating/fixed-position tooltip', () => {
    const data: DownDistanceSplit[] = [split({ down: 1, distance_bucket: '1-3', success_rate: 0.6 })]
    const { container } = render(<DownDistanceHeatmap data={data} side="offense" title="Offense" />)
    expect(container.querySelector('.fixed')).toBeNull()
  })

  it('renders the dense-surface detail panel below the grid, idle by default', () => {
    const data: DownDistanceSplit[] = [split({ down: 1, distance_bucket: '1-3', success_rate: 0.6, play_count: 12 })]
    render(<DownDistanceHeatmap data={data} side="offense" title="Offense" />)

    const panel = screen.getByTestId('chart-tooltip')
    expect(panel).toHaveTextContent(/Hover or focus a cell for details/)

    act(() => {
      screen.getByLabelText(/1st and 1-3/).focus()
    })
    expect(panel).toHaveTextContent('1st & 1-3')
    expect(panel).toHaveTextContent('12')
  })
})
