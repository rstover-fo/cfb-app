'use client'

import { useState } from 'react'
import { GameTabSelector } from './GameTabSelector'
import { ScoreStepLine } from './ScoreStepLine'
import { WinProbabilityChart } from './WinProbabilityChart'
import { MomentumChart } from './MomentumChart'
import type { GameDrive, GameWinProbability } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'
import type { LineScores } from '@/lib/types/database'

const TABS = [
  { id: 'score-flow', label: 'Score Flow' },
  { id: 'win-prob', label: 'Win Probability' },
  { id: 'momentum', label: 'Momentum' },
]

interface ScoringTimelineProps {
  drives: GameDrive[]
  lineScores: LineScores
  game: GameWithTeams
  /** Per-play win probability from api.game_win_probability (CFBD's in-game
   *  model). Optional -- WinProbabilityChart falls back to its own
   *  score-based heuristic when this is missing or has fewer than 2 rows. */
  serverWP?: GameWinProbability[]
}

export function ScoringTimeline({ drives, lineScores, game, serverWP }: ScoringTimelineProps) {
  const [activeTab, setActiveTab] = useState('score-flow')

  return (
    <section>
      <GameTabSelector
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        ariaLabel="Scoring timeline views"
      />

      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={activeTab}
      >
        {activeTab === 'score-flow' && (
          <ScoreStepLine drives={drives} lineScores={lineScores} game={game} />
        )}
        {activeTab === 'win-prob' && (
          <WinProbabilityChart drives={drives} lineScores={lineScores} game={game} serverWP={serverWP} />
        )}
        {activeTab === 'momentum' && (
          <MomentumChart drives={drives} lineScores={lineScores} game={game} />
        )}
      </div>
    </section>
  )
}
