import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card, CardHeader, CardTitle, CardContent } from '../card'

describe('Card', () => {
  it('renders its content with the editorial card border/shadow classes', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Team Stats</CardTitle>
        </CardHeader>
        <CardContent>Body content</CardContent>
      </Card>
    )

    expect(screen.getByText('Team Stats')).toBeInTheDocument()
    expect(screen.getByText('Body content')).toBeInTheDocument()

    const card = screen.getByTestId('card')
    expect(card).toHaveClass('border-[1.5px]')
    expect(card).toHaveClass('border-border')
    expect(card.className).toContain('shadow-[var(--shadow-soft)]')
  })
})
