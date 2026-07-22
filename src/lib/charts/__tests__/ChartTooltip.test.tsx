import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChartTooltip, swatchBackground } from '../ChartTooltip'

describe('ChartTooltip', () => {
  it('shows the muted idle prompt when there are no rows', () => {
    render(<ChartTooltip rows={[]} prompt="Hover a season for details" minRows={3} />)

    const prompt = screen.getByText('Hover a season for details')
    expect(prompt.className).toContain('text-[var(--text-muted)]')
  })

  it('reserves the same min-height whether idle or populated (no layout jump)', () => {
    const { rerender } = render(
      <ChartTooltip rows={[]} prompt="Hover a season for details" minRows={3} />,
    )
    const idleHeight = screen.getByTestId('chart-tooltip').style.minHeight
    expect(idleHeight).not.toBe('')

    rerender(
      <ChartTooltip
        header="2024"
        rows={[{ swatch: 'solid', color: 'var(--color-run)', label: 'Team:', value: '11.0' }]}
        prompt="Hover a season for details"
        minRows={3}
      />,
    )
    expect(screen.getByTestId('chart-tooltip').style.minHeight).toBe(idleHeight)
  })

  it('renders header and swatch + label + value rows with house tokens', () => {
    render(
      <ChartTooltip
        header="2024"
        rows={[
          { swatch: 'solid', color: 'var(--color-run)', label: 'Team:', value: '11.0' },
          { swatch: 'dashed', color: 'var(--text-muted)', label: 'SEC avg:', value: '7.2' },
        ]}
        prompt="Hover a season for details"
        minRows={2}
      />,
    )

    const header = screen.getByText('2024')
    expect(header.className).toContain('font-headline')

    const teamLabel = screen.getByText('Team:')
    expect(teamLabel.className).toContain('text-[var(--text-secondary)]')
    const teamValue = screen.getByText('11.0')
    expect(teamValue.className).toContain('font-medium')
    expect(teamValue.className).toContain('tabular-nums')

    const solidSwatch = teamLabel.previousElementSibling as HTMLElement
    expect(solidSwatch.className).toContain('w-3')
    expect(solidSwatch.style.backgroundColor).toBeTruthy()

    const dashedSwatch = screen.getByText('SEC avg:').previousElementSibling as HTMLElement
    expect(dashedSwatch.style.backgroundImage).toContain('repeating-linear-gradient')
  })

  it('renders an optional headerAdornment inline before the header text', () => {
    render(
      <ChartTooltip
        header="Georgia"
        headerAdornment={<span data-testid="team-logo" className="w-5 h-5" />}
        rows={[{ label: 'EPA per Play:', value: '0.245' }]}
        prompt="Hover a team for details"
        minRows={2}
      />,
    )

    const header = screen.getByText('Georgia')
    expect(header.className).toContain('font-headline')
    // Adornment renders inside the header line, before the text.
    expect(header).toContainElement(screen.getByTestId('team-logo'))
  })

  it('does not render a headerAdornment without a header', () => {
    render(
      <ChartTooltip
        headerAdornment={<span data-testid="team-logo" className="w-5 h-5" />}
        rows={[{ label: 'EPA per Play:', value: '0.245' }]}
        prompt="Hover a team for details"
        minRows={2}
      />,
    )

    expect(screen.queryByTestId('team-logo')).not.toBeInTheDocument()
  })

  it('renders muted caption rows with an empty spacer swatch', () => {
    render(
      <ChartTooltip
        header="Overall"
        rows={[{ label: '72nd percentile pass-heavy in FBS', muted: true }]}
        prompt="Hover a row"
        minRows={1}
      />,
    )

    const caption = screen.getByText('72nd percentile pass-heavy in FBS')
    expect(caption.className).toContain('text-[var(--text-muted)]')
    const spacer = caption.previousElementSibling as HTMLElement
    expect(spacer.className).toContain('w-3')
    expect(spacer.style.backgroundColor).toBe('')
    expect(spacer.style.backgroundImage).toBe('')
  })
})

describe('swatchBackground', () => {
  it('returns a solid background for solid swatches', () => {
    expect(swatchBackground('solid', 'var(--color-run)')).toEqual({
      backgroundColor: 'var(--color-run)',
    })
  })

  it('returns the house repeating-gradient for dashed swatches', () => {
    const style = swatchBackground('dashed', 'var(--text-muted)')
    expect(style.backgroundImage).toContain('repeating-linear-gradient(90deg')
    expect(style.backgroundImage).toContain('var(--text-muted)')
  })
})
