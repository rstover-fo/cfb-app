/**
 * Unit tests for RoughRadar, the unified rough radar primitive (sweep C1),
 * plus its consumer configs (analytics OffenseRadar shape, players
 * PercentileRadar shape).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { ChartPolar } from '@phosphor-icons/react'
import { RoughRadar } from '../RoughRadar'
import type { RoughRadarProps } from '../RoughRadar'
import { OffenseRadar } from '@/components/analytics/OffenseRadar'
import type { TeamOffenseData } from '@/components/analytics/OffenseRadar'
import { PercentileRadar } from '@/components/players/PercentileRadar'
import type { PlayerPercentiles } from '@/lib/types/database'

const AXES = [
  { key: 'rush', label: 'Rush' },
  { key: 'pass', label: 'Pass' },
  { key: 'success', label: 'Success' },
  { key: 'explosive', label: 'Explosive' },
]

function renderRadar(overrides: Partial<RoughRadarProps> = {}) {
  return render(
    <RoughRadar
      title="Georgia — Offense"
      ariaLabel="Georgia offense radar"
      axes={AXES}
      series={[
        {
          label: 'Georgia',
          color: '#BA0C2F',
          values: [88, 72, 65, 90],
          captions: ['Value: 0.245', 'Value: 0.190', 'Value: 46.0%', 'Value: 1.310'],
        },
      ]}
      emptyState={{ icon: ChartPolar, title: 'No radar data' }}
      {...overrides}
    />,
  )
}

function createPercentiles(overrides: Partial<PlayerPercentiles> = {}): PlayerPercentiles {
  return {
    player_id: 'p1',
    name: 'Test Player',
    team: 'Georgia',
    position: 'QB',
    position_group: 'QB',
    season: 2025,
    pass_yds: null, pass_td: null, pass_pct: null,
    rush_yds: null, rush_td: null, rush_ypc: null,
    rec_yds: null, rec_td: null,
    tackles: null, sacks: null, tfl: null, ppa_avg: null,
    pass_yds_pctl: null, pass_td_pctl: null, pass_pct_pctl: null,
    rush_yds_pctl: null, rush_td_pctl: null, rush_ypc_pctl: null,
    rec_yds_pctl: null, rec_td_pctl: null,
    tackles_pctl: null, sacks_pctl: null, tfl_pctl: null, ppa_avg_pctl: null,
    ...overrides,
  }
}

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-theme')
})

describe('RoughRadar', () => {
  it('renders an accessible svg inside the ChartFrame shell with a seeded rough layer', () => {
    const { container } = renderRadar()

    const svg = screen.getByRole('img', { name: 'Georgia offense radar' })
    expect(svg.tagName.toLowerCase()).toBe('svg')

    // ChartFrame shell, not a hand-rolled wrapper
    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')
    expect(screen.getByText('Georgia — Offense')).toBeInTheDocument()

    // Rough layer drew the polygon + vertex dots
    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.childElementCount).toBeGreaterThan(0)

    // Scaffold: one spoke per axis with muted labels, 4 concentric rings
    for (const axis of AXES) {
      expect(within(svg as unknown as HTMLElement).getByText(axis.label)).toBeInTheDocument()
    }
    expect(svg.querySelectorAll('circle[stroke="var(--border)"]').length).toBe(4)
  })

  it('does not render a legend for a single series', () => {
    renderRadar()
    // ChartLegend renders labels as text-secondary spans; single-series
    // radars skip the legend entirely.
    expect(screen.queryByText('Georgia')).not.toBeInTheDocument()
  })

  it('renders the HTML ChartLegend below for two series', () => {
    renderRadar({
      series: [
        { label: 'Georgia', color: '#BA0C2F', values: [88, 72, 65, 90] },
        { label: 'Alabama', color: '#9E1B32', values: [70, 91, 80, 62] },
      ],
    })

    expect(screen.getByText('Georgia')).toBeInTheDocument()
    expect(screen.getByText('Alabama')).toBeInTheDocument()
  })

  it('shows the idle tooltip prompt with reserved height before any hover', () => {
    renderRadar()

    const tooltip = screen.getByTestId('chart-tooltip')
    expect(within(tooltip).getByText('Hover a metric for details')).toBeInTheDocument()
    expect(tooltip.style.minHeight).not.toBe('')
  })

  it('shows per-axis values for each series in the panel-below tooltip on wedge hover', () => {
    const { container } = renderRadar({
      series: [
        {
          label: 'Georgia',
          color: '#BA0C2F',
          values: [88, 72, 65, 90],
          captions: ['Value: 0.245', null, null, null],
        },
        { label: 'Alabama', color: '#9E1B32', values: [70, 91, 80, 62] },
      ],
    })

    const wedges = container.querySelectorAll('polygon[fill="transparent"]')
    expect(wedges.length).toBe(4)

    fireEvent.mouseEnter(wedges[0])

    const tooltip = screen.getByTestId('chart-tooltip')
    expect(within(tooltip).getByText('Rush')).toBeInTheDocument()
    expect(within(tooltip).getByText('Georgia:')).toBeInTheDocument()
    expect(within(tooltip).getByText('88th percentile')).toBeInTheDocument()
    expect(within(tooltip).getByText('Alabama:')).toBeInTheDocument()
    expect(within(tooltip).getByText('70th percentile')).toBeInTheDocument()
    // Muted caption row
    expect(within(tooltip).getByText('Value: 0.245')).toBeInTheDocument()

    // Leaving the svg clears the selection back to the idle prompt
    fireEvent.mouseLeave(screen.getByRole('img'))
    expect(within(tooltip).getByText('Hover a metric for details')).toBeInTheDocument()
  })

  it('respects a per-axis format for tooltip values', () => {
    const { container } = renderRadar({
      axes: AXES.map(a => ({ ...a, format: (v: number) => `${v.toFixed(0)} pts` })),
    })

    fireEvent.mouseEnter(container.querySelectorAll('polygon[fill="transparent"]')[1])
    expect(within(screen.getByTestId('chart-tooltip')).getByText('72 pts')).toBeInTheDocument()
  })

  it('renders the framed EmptyState instead of a zero-polygon when every value is null', () => {
    const { container } = renderRadar({
      series: [{ label: 'Georgia', color: '#BA0C2F', values: [null, null, null, null] }],
    })

    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')
    expect(screen.getByRole('status')).toHaveTextContent('No radar data')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByTestId('rough-layer')).not.toBeInTheDocument()
  })

  it('redraws the rough layer with re-resolved ink when the theme flips', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })

    renderRadar({
      series: [{ label: 'Team', color: 'var(--color-run)', values: [88, 72, 65, 90] }],
    })

    const roughLayer = screen.getByTestId('rough-layer')
    // Tokens are unset in jsdom, so initial ink is resolveColor's fallback.
    expect(roughLayer.querySelector('path[stroke="#112233"]')).toBeNull()

    // Flip the theme with a new --color-run value; the redraw must re-resolve it.
    document.documentElement.style.setProperty('--color-run', '#112233')
    document.documentElement.setAttribute('data-theme', 'dark')

    await waitFor(() => {
      expect(roughLayer.querySelector('path[stroke="#112233"]')).not.toBeNull()
    })

    rafSpy.mockRestore()
  })
})

describe('RoughRadar consumers', () => {
  it('OffenseRadar renders its metric config through RoughRadar', () => {
    const teams: TeamOffenseData[] = [
      { team: 'Georgia', metrics: { rushEpa: 0.2, passEpa: 0.3, successRate: 0.48, explosiveness: 1.3 } },
      { team: 'Alabama', metrics: { rushEpa: 0.1, passEpa: 0.4, successRate: 0.45, explosiveness: 1.2 } },
      { team: 'Auburn', metrics: { rushEpa: -0.1, passEpa: 0.0, successRate: 0.4, explosiveness: 1.0 } },
    ]

    const { container } = render(
      <OffenseRadar teamData={teams[0]} allTeamsData={teams} teamColor="#BA0C2F" />,
    )

    expect(screen.getByRole('img', { name: /Georgia offense radar/ })).toBeInTheDocument()
    expect(screen.getByText('Georgia — Offense')).toBeInTheDocument()
    expect(screen.getByTestId('rough-layer').childElementCount).toBeGreaterThan(0)

    // Tooltip header is the axis short label; the raw metric value rides
    // along as a muted caption row.
    fireEvent.mouseEnter(container.querySelectorAll('polygon[fill="transparent"]')[0])
    const tooltip = screen.getByTestId('chart-tooltip')
    expect(within(tooltip).getByText('Rush')).toBeInTheDocument()
    expect(within(tooltip).getByText('100th percentile')).toBeInTheDocument()
    expect(within(tooltip).getByText('Value: 0.200')).toBeInTheDocument()
  })

  it('PercentileRadar plots 0-1 percentiles on the shared 0-100 domain', () => {
    const { container } = render(
      <PercentileRadar
        percentiles={createPercentiles({
          pass_yds_pctl: 0.9,
          pass_td_pctl: 0.8,
          pass_pct_pctl: 0.7,
          ppa_avg_pctl: 0.6,
          rush_yds_pctl: 0.5,
        })}
      />,
    )

    expect(screen.getByRole('img', { name: /Percentile radar chart for Test Player/ })).toBeInTheDocument()
    expect(screen.getByText('Percentile Rankings')).toBeInTheDocument()
    expect(screen.getByText('vs. QB · 2025')).toBeInTheDocument()
    expect(screen.getByTestId('rough-layer').childElementCount).toBeGreaterThan(0)

    fireEvent.mouseEnter(container.querySelectorAll('polygon[fill="transparent"]')[0])
    const tooltip = screen.getByTestId('chart-tooltip')
    expect(within(tooltip).getByText('90th percentile')).toBeInTheDocument()
  })

  it('PercentileRadar shows the framed EmptyState (not a zero-polygon) when percentiles are absent', () => {
    render(<PercentileRadar percentiles={createPercentiles()} />)

    expect(screen.getByRole('status')).toHaveTextContent('No percentile data for this season')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByTestId('rough-layer')).not.toBeInTheDocument()
  })
})
