import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatBar } from '../StatBar'

describe('StatBar', () => {
  it('renders the track/fill idiom and sizes the fill to value (0-100 contract)', () => {
    const { container } = render(<StatBar value={62} />)

    const track = container.firstElementChild as HTMLElement
    expect(track.className).toContain('h-2')
    expect(track.className).toContain('bg-[var(--bg-surface-alt)]')
    expect(track.className).toContain('rounded-full')
    expect(track.className).toContain('overflow-hidden')

    const fill = track.firstElementChild as HTMLElement
    expect(fill.style.width).toBe('62%')
  })

  it('clamps out-of-range values to [0, 100]', () => {
    const { container: over } = render(<StatBar value={140} />)
    expect((over.querySelector('.rounded-full > div') as HTMLElement).style.width).toBe('100%')

    const { container: under } = render(<StatBar value={-20} />)
    expect((under.querySelector('.rounded-full > div') as HTMLElement).style.width).toBe('0%')
  })

  it('defaults the fill to --color-run when no color or tone is given', () => {
    const { container } = render(<StatBar value={50} />)
    const fill = container.querySelector('.rounded-full > div') as HTMLElement
    expect(fill.style.backgroundColor).toBe('var(--color-run)')
  })

  it('applies an explicit color (token var or team hex) over the default', () => {
    const { container } = render(<StatBar value={50} color="#CC0000" />)
    const fill = container.querySelector('.rounded-full > div') as HTMLElement
    expect(fill.style.backgroundColor).toBe('rgb(204, 0, 0)')
  })

  it.each([
    ['positive', 'var(--color-positive)'],
    ['neutral', 'var(--color-neutral)'],
    ['negative', 'var(--color-negative)'],
  ] as const)('maps thresholdTone=%s to %s', (tone, expected) => {
    const { container } = render(<StatBar value={50} thresholdTone={tone} />)
    const fill = container.querySelector('.rounded-full > div') as HTMLElement
    expect(fill.style.backgroundColor).toBe(expected)
  })

  it('lets an explicit color win over thresholdTone when both are passed', () => {
    const { container } = render(<StatBar value={50} thresholdTone="negative" color="var(--color-run)" />)
    const fill = container.querySelector('.rounded-full > div') as HTMLElement
    expect(fill.style.backgroundColor).toBe('var(--color-run)')
  })

  it('grows the fill from the right edge in rtl direction', () => {
    const { container } = render(<StatBar value={30} direction="rtl" />)
    const track = container.firstElementChild as HTMLElement
    expect(track.className).toContain('flex')
    expect(track.className).toContain('justify-end')
  })

  it('is aria-hidden by default (paired with adjacent visible text)', () => {
    const { container } = render(<StatBar value={40} />)
    const track = container.firstElementChild as HTMLElement
    expect(track).toHaveAttribute('aria-hidden', 'true')
    expect(track).not.toHaveAttribute('role')
  })

  it('announces as a labeled image when ariaLabel is set', () => {
    render(<StatBar value={40} ariaLabel="Win percentage, 40th percentile" />)
    expect(screen.getByRole('img', { name: 'Win percentage, 40th percentile' })).toBeInTheDocument()
  })

  it('merges an extra className onto the track', () => {
    const { container } = render(<StatBar value={40} className="w-20" />)
    const track = container.firstElementChild as HTMLElement
    expect(track.className).toContain('w-20')
  })
})
