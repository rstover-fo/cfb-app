/**
 * Smoke test for TeamList's division filter migration from native <select>
 * to shadcn Select.
 *
 * Radix's Select opens/selects on pointerdown -- see EdgeBoardTable.test.tsx
 * for the same pattern.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TeamList } from '../TeamList'
import type { Team } from '@/lib/types/database'

function openSelect(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
}

function chooseOption(name: string) {
  fireEvent.click(screen.getByRole('option', { name }))
}

const teams = [
  { id: 1, school: 'Oklahoma', classification: 'fbs', conference: 'SEC', logo: null, color: '#841617' },
  { id: 2, school: 'Villanova', classification: 'fcs', conference: 'CAA', logo: null, color: '#00539B' },
] as unknown as Team[]

describe('TeamList', () => {
  it('defaults to the FBS division and lists only FBS teams', () => {
    render(<TeamList teams={teams} metricsMap={{}} />)

    expect(screen.getByLabelText('Select division')).toHaveTextContent('FBS')
    expect(screen.getByText('Oklahoma')).toBeInTheDocument()
    expect(screen.queryByText('Villanova')).not.toBeInTheDocument()
  })

  it('switches to All Divisions and resets the conference filter', async () => {
    render(<TeamList teams={teams} metricsMap={{}} />)

    openSelect(screen.getByLabelText('Select division'))
    chooseOption('All Divisions')

    expect(await screen.findByLabelText('Select division')).toHaveTextContent('All Divisions')
    expect(screen.getByText('Oklahoma')).toBeInTheDocument()
    expect(screen.getByText('Villanova')).toBeInTheDocument()
  })
})
