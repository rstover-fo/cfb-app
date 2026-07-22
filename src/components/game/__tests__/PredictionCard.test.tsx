import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PredictionCard } from '../PredictionCard'
import {
  createGamePredictionRow,
  createGamePredictionRowNoMarket,
} from '@/lib/queries/__tests__/fixtures/predictions'

describe('PredictionCard', () => {
  it('renders the pick, expected margin, home win probability, and market line when a market exists', () => {
    const prediction = createGamePredictionRow()
    render(
      <PredictionCard
        prediction={prediction}
        homeTeam={prediction.home_team}
        awayTeam={prediction.away_team}
      />
    )

    // Model margin: expected_home_margin 4.0 > 0 => home team by 4.0
    expect(screen.getByText('Ohio State by 4')).toBeInTheDocument()

    // Home win probability: home_win_prob 0.62 => 62%
    expect(screen.getByText('Ohio State 62%')).toBeInTheDocument()

    // Market line: home_team relative spread -2.5
    expect(screen.getByText('Ohio State -2.5')).toBeInTheDocument()
    expect(screen.getByText(/DraftKings/)).toBeInTheDocument()

    // Edge headline: edge_pick 'home', market_spread -2.5 => "Ohio State -2.5", edge 1.5
    expect(screen.getByText(/Edge: Ohio State -2.5/)).toBeInTheDocument()
    expect(screen.getByText(/1\.5 pts/)).toBeInTheDocument()

    // Footer caption
    expect(screen.getByText(/elo_epa_blend_v1/)).toBeInTheDocument()
    expect(screen.getByText(/Nov 28, 2025/)).toBeInTheDocument()
  })

  it('shows the model line and an explicit no-market-line note, with no edge badge, when market fields are null', () => {
    const prediction = createGamePredictionRowNoMarket()
    render(
      <PredictionCard
        prediction={prediction}
        homeTeam={prediction.home_team}
        awayTeam={prediction.away_team}
      />
    )

    // Model margin still shown: expected_home_margin 5.2 => home team by 5.2
    expect(screen.getByText('Boise State by 5.2')).toBeInTheDocument()
    expect(screen.getByText('Boise State 71%')).toBeInTheDocument()

    // No-market note present
    expect(screen.getByText('No market line posted for this game.')).toBeInTheDocument()

    // No edge badge / edge text rendered
    expect(screen.queryByText(/Edge:/)).not.toBeInTheDocument()
  })

  it('renders nothing when prediction is null', () => {
    const { container } = render(
      <PredictionCard prediction={null} homeTeam="Ohio State" awayTeam="Michigan" />
    )

    expect(container).toBeEmptyDOMElement()
  })
})
