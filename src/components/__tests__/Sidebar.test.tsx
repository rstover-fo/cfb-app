/**
 * Unit tests for the "Data updated" freshness note in Sidebar's footer
 * (below ThemeToggle). The label itself is computed server-side in
 * layout.tsx from src/lib/queries/dashboard.ts's getDataFreshness() /
 * getFreshestUpdateDays() and formatted with formatRelativeDays -- Sidebar
 * only renders whatever string it is handed via the dataUpdatedLabel prop.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sidebar } from '../Sidebar'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

describe('Sidebar data freshness note', () => {
  it('renders the relative-time label and the "not real-time" caveat when provided', () => {
    render(<Sidebar dataUpdatedLabel="3h ago" />)

    expect(screen.getByText(/Data updated 3h ago/)).toBeInTheDocument()
    expect(screen.getByText(/Marts refresh on a schedule/)).toBeInTheDocument()
  })

  it('renders nothing extra when the label is null (freshness data unavailable)', () => {
    render(<Sidebar dataUpdatedLabel={null} />)

    expect(screen.queryByText(/Data updated/)).not.toBeInTheDocument()
  })

  it('renders nothing extra when no label prop is passed at all', () => {
    render(<Sidebar />)

    expect(screen.queryByText(/Data updated/)).not.toBeInTheDocument()
  })
})
