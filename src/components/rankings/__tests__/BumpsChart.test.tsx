/**
 * Unit tests for BumpsChart's migration onto the chart primitives
 * (docs/chart-style-spec.md): ChartFrame shell + a11y, per-team rough
 * <g> groups with hover dimming, token-ink labels, framed EmptyState,
 * and theme-flip redraw.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BumpsChart } from '../BumpsChart'

const DATA = [
  {
    week: 1,
    rankings: [
      { rank: 1, school: 'Georgia', color: '#ba0c2f' },
      { rank: 2, school: 'Michigan', color: '#00274c' },
      { rank: 3, school: 'One Week U', color: '#333366' },
    ],
  },
  {
    week: 2,
    rankings: [
      { rank: 1, school: 'Michigan', color: '#00274c' },
      { rank: 2, school: 'Georgia', color: '#ba0c2f' },
      { rank: 3, school: 'Fallback State', color: null },
    ],
  },
  {
    week: 3,
    rankings: [
      { rank: 1, school: 'Michigan', color: '#00274c' },
      { rank: 2, school: 'Georgia', color: '#ba0c2f' },
      { rank: 3, school: 'Fallback State', color: null },
    ],
  },
]

function renderChart(props: Partial<Parameters<typeof BumpsChart>[0]> = {}) {
  return render(<BumpsChart data={DATA} poll="AP Top 25" {...props} />)
}

function teamGroup(container: HTMLElement, school: string): SVGGElement | null {
  return container.querySelector(`[data-testid="rough-layer"] g[data-school="${school}"]`)
}

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-theme')
})

describe('BumpsChart', () => {
  it('renders an accessible svg in the frame with one rough group per multi-week team', () => {
    const { container } = renderChart()

    const svg = screen.getByRole('img', {
      name: /AP Top 25 ranking trajectories: team rank by week, weeks 1 to 3/,
    })
    expect(svg.tagName.toLowerCase()).toBe('svg')

    // ChartFrame shell + title slot, not a hand-rolled wrapper
    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')
    expect(screen.getByText('Season Trajectory — AP Top 25')).toBeInTheDocument()

    // One rough <g data-school> per team ranked in >= 2 weeks
    expect(teamGroup(container, 'Georgia')).not.toBeNull()
    expect(teamGroup(container, 'Michigan')).not.toBeNull()
    expect(teamGroup(container, 'Fallback State')).not.toBeNull()
    // Single-week teams are filtered out entirely (no line, no label)
    expect(teamGroup(container, 'One Week U')).toBeNull()
    expect(screen.queryByText('One Week U')).not.toBeInTheDocument()
  })

  it('keeps team hex in rough ink only; labels use token ink', () => {
    const { container } = renderChart()

    // Rough strokes carry the team color
    const georgia = teamGroup(container, 'Georgia')!
    expect(georgia.querySelector('path[stroke="#ba0c2f"]')).not.toBeNull()

    // Labels are native scaffold text with token ink classes, never team hex
    const label = screen.getByText('Georgia')
    expect(label.getAttribute('class')).toContain('fill-[var(--text-secondary)]')
    expect(label.getAttribute('fill')).toBeNull()
  })

  it('emphasizes the hovered team and dims the rest, then restores on leave', () => {
    const { container } = renderChart()

    // Idle: every team at the resting opacity
    expect(teamGroup(container, 'Georgia')!.style.opacity).toBe('0.6')
    expect(teamGroup(container, 'Michigan')!.style.opacity).toBe('0.6')

    // Hover via the right-edge label
    fireEvent.mouseEnter(screen.getByText('Georgia'))
    expect(teamGroup(container, 'Georgia')!.style.opacity).toBe('1')
    expect(teamGroup(container, 'Michigan')!.style.opacity).toBe('0.15')
    expect(screen.getByText('Georgia').getAttribute('class')).toContain(
      'fill-[var(--text-primary)]',
    )
    expect(screen.getByText('Michigan').getAttribute('opacity')).toBe('0.3')

    fireEvent.mouseLeave(screen.getByText('Georgia'))
    expect(teamGroup(container, 'Georgia')!.style.opacity).toBe('0.6')
    expect(teamGroup(container, 'Michigan')!.style.opacity).toBe('0.6')
  })

  it('emphasizes on hovering the transparent line hit target too', () => {
    const { container } = renderChart()

    const hit = container.querySelector('path[data-hit="Michigan"]')!
    expect(hit.getAttribute('stroke')).toBe('transparent')

    fireEvent.mouseEnter(hit)
    expect(teamGroup(container, 'Michigan')!.style.opacity).toBe('1')
    expect(teamGroup(container, 'Georgia')!.style.opacity).toBe('0.15')
  })

  it('fires onTeamClick from the right-edge label', () => {
    const onTeamClick = vi.fn()
    renderChart({ onTeamClick })

    fireEvent.click(screen.getByText('Michigan'))
    expect(onTeamClick).toHaveBeenCalledWith('Michigan')
  })

  it('renders the framed EmptyState when there are not enough ranked weeks', () => {
    const { container } = render(<BumpsChart data={[]} poll="AP Top 25" />)

    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')
    expect(screen.getByRole('status')).toHaveTextContent('No ranking trajectory yet')
    expect(
      screen.getByText('Trajectories draw once a poll has at least two ranked weeks.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('redraws the rough layer with re-resolved ink when the theme flips', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })

    const { container } = renderChart()

    // Fallback State has no team color, so its ink resolves from --text-muted
    // (unset in jsdom -> resolveColor's #999 fallback initially).
    const fallback = teamGroup(container, 'Fallback State')!
    expect(fallback.querySelector('path[stroke="#123456"]')).toBeNull()

    document.documentElement.style.setProperty('--text-muted', '#123456')
    document.documentElement.setAttribute('data-theme', 'dark')

    await waitFor(() => {
      const redrawn = teamGroup(container, 'Fallback State')!
      expect(redrawn.querySelector('path[stroke="#123456"]')).not.toBeNull()
    })

    rafSpy.mockRestore()
  })
})
