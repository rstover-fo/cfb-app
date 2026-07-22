import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChartLine } from '@phosphor-icons/react'
import { ChartFrame } from '../ChartFrame'

describe('ChartFrame', () => {
  it('renders children inside the editorial shell with an optional title', () => {
    const { container } = render(
      <ChartFrame title="Historical Trajectory" ariaLabel="Wins by season">
        <p>chart body</p>
      </ChartFrame>,
    )

    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('bg-[var(--bg-surface)]')
    expect(shell.className).toContain('border-[1.5px]')
    expect(shell.className).toContain('border-[var(--border)]')
    expect(shell.className).toContain('rounded-lg')
    expect(shell.className).toContain('p-4')

    const title = screen.getByRole('heading', { name: 'Historical Trajectory' })
    expect(title.className).toContain('font-headline')
    expect(screen.getByText('chart body')).toBeInTheDocument()
  })

  it('hands role="img" + aria-label to the SVG via the render-prop form', () => {
    render(
      <ChartFrame ariaLabel="Wins by season for Ohio State">
        {a11y => <svg data-testid="chart-svg" {...a11y} />}
      </ChartFrame>,
    )

    const svg = screen.getByRole('img', { name: 'Wins by season for Ohio State' })
    expect(svg).toBe(screen.getByTestId('chart-svg'))
  })

  it('hands aria-hidden to the SVG when decorative', () => {
    render(
      <ChartFrame decorative>
        {a11y => <svg data-testid="chart-svg" {...a11y} />}
      </ChartFrame>,
    )

    expect(screen.getByTestId('chart-svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders EmptyState inside the shell instead of children when empty', () => {
    const { container } = render(
      <ChartFrame
        empty
        emptyState={{
          icon: ChartLine,
          title: 'No trajectory data for this team',
          description: "Historical data publishes after a team's first FBS season.",
        }}
      >
        <p>chart body</p>
      </ChartFrame>,
    )

    // Still inside the frame shell...
    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain('border-[1.5px]')
    // ...announced as a status, children suppressed.
    expect(screen.getByRole('status')).toHaveTextContent('No trajectory data for this team')
    expect(screen.getByText("Historical data publishes after a team's first FBS season.")).toBeInTheDocument()
    expect(screen.queryByText('chart body')).not.toBeInTheDocument()
  })
})
