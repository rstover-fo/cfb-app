'use client'

import { useState } from 'react'
import { GameTabSelector } from './GameTabSelector'
import { GameDownDistance } from './GameDownDistance'
import { GameRedZone } from './GameRedZone'
import { GameFieldPosition } from './GameFieldPosition'
import { TabsContent } from '@/components/ui/tabs'
import type { GamePlay, GameDrive } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'

interface GameSituationalSplitsProps {
  plays: GamePlay[]
  drives: GameDrive[]
  game: GameWithTeams
}

const SPLIT_TABS = [
  { id: 'down-distance', label: 'Down & Distance' },
  { id: 'red-zone', label: 'Red Zone' },
  { id: 'field-position', label: 'Field Position' },
]

export function GameSituationalSplits({ plays, drives, game }: GameSituationalSplitsProps) {
  const [activeTab, setActiveTab] = useState('down-distance')

  return (
    <section>
      <GameTabSelector
        tabs={SPLIT_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        ariaLabel="Situational splits"
      >
        <TabsContent value="down-distance">
          <GameDownDistance plays={plays} game={game} />
        </TabsContent>
        <TabsContent value="red-zone">
          <GameRedZone drives={drives} game={game} />
        </TabsContent>
        <TabsContent value="field-position">
          <GameFieldPosition plays={plays} game={game} />
        </TabsContent>
      </GameTabSelector>
    </section>
  )
}
