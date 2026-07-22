import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChartLegend } from '../ChartLegend'
import type { ChartLegendItem } from '../ChartLegend'

const ITEMS: ChartLegendItem[] = [
  { key: 'team', label: 'Team', swatch: 'solid', color: 'var(--color-run)' },
  { key: 'conf', label: 'SEC avg', swatch: 'dashed', color: 'var(--text-muted)' },
  { key: 'run', label: 'Run', swatch: 'hachure', color: 'var(--color-run)' },
]

describe('ChartLegend', () => {
  it('renders non-interactive items as plain swatch + label rows, below by default', () => {
    const { container } = render(<ChartLegend items={ITEMS} />)

    const legend = container.firstElementChild as HTMLElement
    expect(legend.className).toContain('mt-3')
    expect(legend.className).toContain('pt-2')
    expect(legend.className).toContain('border-t')
    // Legends wrap on narrow viewports instead of overflowing the frame
    // (DESIGN.md "Responsive rows").
    expect(legend.className).toContain('flex-wrap')

    expect(screen.getByText('Team')).toBeInTheDocument()
    expect(screen.getByText('SEC avg')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    const dashedSwatch = screen.getByText('SEC avg').previousElementSibling as HTMLElement
    expect(dashedSwatch.className).toContain('w-4')
    expect(dashedSwatch.style.backgroundImage).toContain('repeating-linear-gradient')

    // Hachure series get the rough-look HTML block, never an SVG swatch.
    const hachureSwatch = screen.getByText('Run').previousElementSibling as HTMLElement
    expect(hachureSwatch.className).toContain('w-3 h-3')
    expect(hachureSwatch.style.backgroundImage).toContain('repeating-linear-gradient')
  })

  it('mirrors the divider when positioned above the chart', () => {
    const { container } = render(<ChartLegend items={ITEMS} position="above" />)

    const legend = container.firstElementChild as HTMLElement
    expect(legend.className).toContain('mb-3')
    expect(legend.className).toContain('border-b')
    expect(legend.className).not.toContain('border-t')
  })

  it('renders aria-pressed toggle buttons in the interactive variant', () => {
    const onToggle = vi.fn()
    render(
      <ChartLegend
        items={ITEMS}
        interactive={{ visible: { team: true, conf: false, run: true }, onToggle }}
      />,
    )

    const teamButton = screen.getByRole('button', { name: 'Team' })
    expect(teamButton).toHaveAttribute('aria-pressed', 'true')
    expect(teamButton.className).not.toContain('opacity-40')

    const confButton = screen.getByRole('button', { name: 'SEC avg' })
    expect(confButton).toHaveAttribute('aria-pressed', 'false')
    expect(confButton.className).toContain('opacity-40')

    fireEvent.click(confButton)
    expect(onToggle).toHaveBeenCalledWith('conf')
  })
})
