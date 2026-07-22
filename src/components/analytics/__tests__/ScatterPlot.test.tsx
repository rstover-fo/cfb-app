/**
 * Unit tests for the rough-aesthetic ScatterPlot (chart-consistency sweep C2):
 * native logo marks (raster exemption), rough fallback dots, accent selection
 * rings, panel-below tooltip, framed EmptyState, and theme-flip redraws.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { ScatterPlot } from '../ScatterPlot'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img data-testid="tooltip-logo" src={props.src as string} alt={props.alt ?? ''} className={props.className} />
  ),
}))

const DATA = [
  { id: 1, name: 'Georgia', x: 0.25, y: 0.5, color: '#BA0C2F', logo: '/uga.png', conference: 'SEC' },
  { id: 2, name: 'Ohio State', x: 0.3, y: 0.48, color: '#BB0000', logo: '/osu.png', conference: 'Big Ten' },
  { id: 3, name: 'Boise State', x: 0.1, y: 0.42, color: '#0033A0', logo: null, conference: 'Mountain West' },
  { id: 4, name: 'Notre Dame', x: 0.2, y: 0.46, color: '#0C2340', logo: '/nd.png', conference: null },
]

function renderPlot(overrides: Partial<React.ComponentProps<typeof ScatterPlot>> = {}) {
  return render(
    <ScatterPlot
      data={DATA}
      xLabel="EPA per Play"
      yLabel="Success Rate"
      quadrantLabels={{
        topLeft: 'Efficient but Explosive',
        topRight: 'Elite',
        bottomLeft: 'Struggling',
        bottomRight: 'Boom or Bust',
      }}
      {...overrides}
    />,
  )
}

function hitTargets(container: HTMLElement) {
  return container.querySelectorAll('circle[fill="transparent"]')
}

afterEach(() => {
  vi.clearAllMocks()
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-team-theme')
})

describe('ScatterPlot — logo mode', () => {
  it('renders inside the ChartFrame shell with an accessible svg', () => {
    const { container } = renderPlot()

    const svg = screen.getByRole('img', {
      name: 'Scatter plot of EPA per Play vs Success Rate for all FBS teams',
    })
    expect(svg.tagName.toLowerCase()).toBe('svg')

    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')
  })

  it('keeps team logos as native <image> elements with no glow filter (raster exemption)', () => {
    const { container } = renderPlot()

    // Three of four points have logos; the logoless point adds no <image>.
    const images = container.querySelectorAll('image')
    expect(images.length).toBe(3)

    // The retired feDropShadow glow is gone entirely.
    expect(container.querySelector('filter')).toBeNull()
    expect(container.querySelector('[filter]')).toBeNull()

    // The logoless point draws as a rough dot; logo points add no rough marks.
    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.childElementCount).toBe(1)
  })

  it('renders the quadrant labels and mean rules as static token-ink scaffold', () => {
    const { container } = renderPlot()
    const svg = screen.getByRole('img')

    for (const label of ['Efficient but Explosive', 'Elite', 'Struggling', 'Boom or Bust']) {
      expect(within(svg as unknown as HTMLElement).getByText(label)).toBeInTheDocument()
    }

    // Two dashed mean rules in muted token ink split the quadrants.
    const meanRules = container.querySelectorAll(
      'line[stroke="var(--text-muted)"][stroke-dasharray="8 4"]',
    )
    expect(meanRules.length).toBe(2)
  })

  it('draws a rough accent ring and fills the panel-below tooltip on hover', () => {
    const { container } = renderPlot()

    const roughLayer = screen.getByTestId('rough-layer')
    const baseline = roughLayer.childElementCount

    fireEvent.mouseEnter(hitTargets(container)[0])

    // One extra rough element: the hover accent ring around the logo.
    expect(roughLayer.childElementCount).toBe(baseline + 1)

    const tooltip = screen.getByTestId('chart-tooltip')
    expect(within(tooltip).getByText('Georgia')).toBeInTheDocument()
    expect(within(tooltip).getByTestId('tooltip-logo')).toBeInTheDocument()
    expect(within(tooltip).getByText('EPA per Play:')).toBeInTheDocument()
    expect(within(tooltip).getByText('0.250')).toBeInTheDocument()
    expect(within(tooltip).getByText('Success Rate:')).toBeInTheDocument()
    expect(within(tooltip).getByText('0.500')).toBeInTheDocument()
    expect(within(tooltip).getByText('SEC')).toBeInTheDocument()

    // Leaving the svg clears the ring and returns the idle prompt.
    fireEvent.mouseLeave(screen.getByRole('img'))
    expect(roughLayer.childElementCount).toBe(baseline)
    expect(within(tooltip).getByText('Hover a team for details')).toBeInTheDocument()
  })

  it('shows "Independent" for a hovered team without a conference', () => {
    const { container } = renderPlot()

    fireEvent.mouseEnter(hitTargets(container)[3])
    expect(within(screen.getByTestId('chart-tooltip')).getByText('Independent')).toBeInTheDocument()
  })

  it('shows the idle tooltip prompt with reserved height before any hover', () => {
    renderPlot()

    const tooltip = screen.getByTestId('chart-tooltip')
    expect(within(tooltip).getByText('Hover a team for details')).toBeInTheDocument()
    expect(tooltip.style.minHeight).not.toBe('')
  })

  it('navigates to the team page when a point is clicked', () => {
    const { container } = renderPlot()

    fireEvent.click(hitTargets(container)[1])
    expect(mockPush).toHaveBeenCalledWith('/teams/ohio-state')
  })

  it('draws a static dashed rough ring for the search highlight (no pulse animation)', () => {
    const { container } = renderPlot({ highlightedTeamId: 1 })

    const roughLayer = screen.getByTestId('rough-layer')
    // Fallback dot for the logoless point + the highlight ring.
    expect(roughLayer.childElementCount).toBe(2)

    // The ring is dashed via roughjs strokeLineDash, never animate-pulse.
    expect(roughLayer.querySelector('path[stroke-dasharray]')).not.toBeNull()
    expect(container.querySelector('.animate-pulse')).toBeNull()

    // Non-highlighted logos dim.
    const dimmed = container.querySelectorAll('image[opacity="0.3"]')
    expect(dimmed.length).toBe(2)
  })
})

describe('ScatterPlot — fallback circle mode', () => {
  it('draws every point as a rough mark and no native images', () => {
    const { container } = renderPlot({ showLogos: false })

    expect(container.querySelectorAll('image').length).toBe(0)
    expect(screen.getByTestId('rough-layer').childElementCount).toBe(DATA.length)
  })

  it('passes the team color through to the rough dot ink', () => {
    renderPlot({ showLogos: false })

    // teamInk passes concrete team hex through unchanged (spec §6).
    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.querySelector('path[fill="#BA0C2F"]')).not.toBeNull()
    expect(roughLayer.querySelector('path[fill="#0033A0"]')).not.toBeNull()
  })
})

describe('ScatterPlot — empty state', () => {
  it('renders the framed EmptyState instead of an svg when there is no data', () => {
    const { container } = renderPlot({ data: [] })

    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')
    expect(screen.getByRole('status')).toHaveTextContent('No teams to plot')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByTestId('rough-layer')).not.toBeInTheDocument()
  })
})

describe('ScatterPlot — theme redraw', () => {
  it('redraws the rough layer with re-resolved ink when the theme flips', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })

    renderPlot({
      showLogos: false,
      data: [{ ...DATA[0], color: 'var(--color-run)' }],
    })

    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.querySelector('path[fill="#112233"]')).toBeNull()

    document.documentElement.style.setProperty('--color-run', '#112233')
    document.documentElement.setAttribute('data-theme', 'dark')

    await waitFor(() => {
      expect(roughLayer.querySelector('path[fill="#112233"]')).not.toBeNull()
    })

    rafSpy.mockRestore()
  })

  it('re-resolves the accent ring ink when data-team-theme flips (Gate B)', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })

    const { container } = renderPlot()
    fireEvent.mouseEnter(hitTargets(container)[0])

    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.querySelector('path[stroke="#841617"]')).toBeNull()

    // Team theming rewrites --accent; the observer must catch the attribute.
    document.documentElement.style.setProperty('--accent', '#841617')
    document.documentElement.setAttribute('data-team-theme', 'ou')

    await waitFor(() => {
      expect(roughLayer.querySelector('path[stroke="#841617"]')).not.toBeNull()
    })

    rafSpy.mockRestore()
  })
})
