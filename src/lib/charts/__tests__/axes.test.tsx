import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { gridLinesY, axisLabelsY, axisLabelsX } from '../axes'
import type { ChartLayout } from '../axes'

const LAYOUT: ChartLayout = {
  width: 700,
  height: 350,
  padding: { top: 30, right: 30, bottom: 50, left: 60 },
}
const PLOT_HEIGHT = 350 - 30 - 50 // 270

describe('gridLinesY', () => {
  it('renders one full-width border-token line per tick at the fractional height', () => {
    const { container } = render(
      <svg>{gridLinesY([{ pct: 0 }, { pct: 0.5 }, { pct: 1 }], LAYOUT)}</svg>,
    )

    const lines = container.querySelectorAll('line')
    expect(lines.length).toBe(3)

    const mid = lines[1]
    expect(mid.getAttribute('x1')).toBe('60')
    expect(mid.getAttribute('x2')).toBe('670')
    expect(mid.getAttribute('y1')).toBe(String(30 + 0.5 * PLOT_HEIGHT))
    expect(mid.getAttribute('stroke')).toBe('var(--border)')
    expect(mid.getAttribute('opacity')).toBe('0.4')
  })
})

describe('axisLabelsY', () => {
  it('renders formatted muted labels right-aligned into the left gutter', () => {
    const { container } = render(
      <svg>
        {axisLabelsY([{ pct: 0, val: 12 }, { pct: 1, val: 0 }], v => `${v.toFixed(0)} wins`, LAYOUT)}
      </svg>,
    )

    const labels = container.querySelectorAll('text')
    expect(labels.length).toBe(2)
    expect(labels[0].textContent).toBe('12 wins')
    expect(labels[0].getAttribute('x')).toBe('50') // padding.left - 10
    expect(labels[0].getAttribute('text-anchor')).toBe('end')
    expect(labels[0].getAttribute('class')).toContain('fill-[var(--text-muted)]')
    expect(labels[1].getAttribute('y')).toBe(String(30 + PLOT_HEIGHT))
  })
})

describe('axisLabelsX', () => {
  it('renders centered labels in the bottom gutter', () => {
    const { container } = render(
      <svg>{axisLabelsX([{ x: 60, label: 2015 }, { x: 670, label: 2024 }], LAYOUT)}</svg>,
    )

    const labels = container.querySelectorAll('text')
    expect(labels.length).toBe(2)
    expect(labels[0].textContent).toBe('2015')
    expect(labels[0].getAttribute('y')).toBe('335') // height - 15
    expect(labels[0].getAttribute('text-anchor')).toBe('middle')
    expect(labels[1].getAttribute('x')).toBe('670')
  })
})
