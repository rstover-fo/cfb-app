/**
 * Unit tests for GameRecap, the presentational block rendering the
 * AI-generated recap from api.game_recaps (headline/recap prose written by
 * scripts/generate_recaps.py's Anthropic call).
 *
 * SECURITY: headline/recap are LLM output and must render as plain-text
 * React children only -- these tests assert on rendered text content, never
 * on innerHTML, and the component itself contains no dangerouslySetInnerHTML.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GameRecap } from '../GameRecap'
import type { GameRecap as GameRecapData } from '@/lib/types/database'

function recap(overrides: Partial<GameRecapData> = {}): GameRecapData {
  return {
    headline: 'Sooners Rally Late to Stun Houston',
    recap: 'Oklahoma trailed by 10 entering the fourth quarter before a late surge sealed the win.',
    wp_available: true,
    model: 'claude-sonnet-4',
    generated_at: '2026-07-20T04:00:00Z',
    ...overrides,
  }
}

describe('GameRecap', () => {
  it('renders the headline, recap body, and the AI-generated label with a readable date', () => {
    render(<GameRecap recap={recap()} />)

    expect(screen.getByText('Sooners Rally Late to Stun Houston')).toBeInTheDocument()
    expect(
      screen.getByText('Oklahoma trailed by 10 entering the fourth quarter before a late surge sealed the win.')
    ).toBeInTheDocument()
    expect(screen.getByText(/AI-generated recap/)).toBeInTheDocument()
    expect(screen.getByText(/Jul 20, 2026/)).toBeInTheDocument()
  })

  it('renders each blank-line-separated block of the recap as its own paragraph', () => {
    render(
      <GameRecap
        recap={recap({
          recap: 'First paragraph of the recap.\n\nSecond paragraph of the recap.',
        })}
      />
    )

    expect(screen.getByText('First paragraph of the recap.').tagName).toBe('P')
    expect(screen.getByText('Second paragraph of the recap.').tagName).toBe('P')
  })

  it('renders headline and recap as plain text, not interpreted markup', () => {
    // If the LLM ever emitted HTML-looking text, it must show up literally
    // (proving no dangerouslySetInnerHTML is involved) rather than being
    // parsed into an element.
    const { container } = render(
      <GameRecap
        recap={recap({
          headline: '<script>alert(1)</script> Sooners Win',
          recap: 'A <b>bold</b> comeback in the fourth quarter.',
        })}
      />
    )

    expect(screen.getByText('<script>alert(1)</script> Sooners Win')).toBeInTheDocument()
    expect(screen.getByText('A <b>bold</b> comeback in the fourth quarter.')).toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
  })
})
