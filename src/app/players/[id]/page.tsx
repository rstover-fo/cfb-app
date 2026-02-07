import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPlayerDetail, getPlayerPercentiles, getPlayerGameLog, getPlayerSeasons } from '@/lib/queries/players'
import { CURRENT_SEASON } from '@/lib/queries/constants'
import { PlayerDetailClient } from '@/components/players/PlayerDetailClient'

interface PlayerPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ season?: string }>
}

export async function generateMetadata({ params }: PlayerPageProps): Promise<Metadata> {
  const { id } = await params
  const player = await getPlayerDetail(id)

  if (!player) {
    return { title: 'Player Not Found | CFB Team 360' }
  }

  return {
    title: `${player.name} - ${player.team} | CFB Team 360`,
    description: `${player.name} stats, game log, and analytics for ${player.team}`,
  }
}

export default async function PlayerPage({ params, searchParams }: PlayerPageProps) {
  const { id } = await params
  const { season: seasonParam } = await searchParams

  // Get available seasons first to determine which season to load
  const playerSeasons = await getPlayerSeasons(id)

  if (playerSeasons.length === 0) {
    // Try loading player detail without a season to see if roster entry exists
    const player = await getPlayerDetail(id)
    if (!player) {
      notFound()
    }
    // Player exists in roster but has no multi-season data
    return (
      <PlayerDetailClient
        player={player}
        percentiles={null}
        gameLog={[]}
        playerSeasons={[player.season]}
      />
    )
  }

  const currentSeason = seasonParam
    ? parseInt(seasonParam, 10)
    : playerSeasons[0] ?? CURRENT_SEASON

  const [playerDetail, percentiles, gameLog] = await Promise.all([
    getPlayerDetail(id, currentSeason),
    getPlayerPercentiles(id, currentSeason),
    getPlayerGameLog(id, currentSeason),
  ])

  if (!playerDetail) {
    notFound()
  }

  return (
    <PlayerDetailClient
      player={playerDetail}
      percentiles={percentiles}
      gameLog={gameLog}
      playerSeasons={playerSeasons}
    />
  )
}
