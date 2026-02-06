import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getGameById, getGameBoxScore, getGamePlayerLeaders, getGameLineScores, getGameDrives, getGamePlays } from '@/lib/queries/games'
import { GameScoreHeader } from '@/components/game/GameScoreHeader'
import { QuarterScores } from '@/components/game/QuarterScores'
import { GameBoxScore } from '@/components/game/GameBoxScore'
import { PlayerLeaders } from '@/components/game/PlayerLeaders'
import { ScoringTimeline } from '@/components/game/ScoringTimeline'
import { DriveChart } from '@/components/game/DriveChart'
import { PlayByPlay } from '@/components/game/PlayByPlay'
import { GameSituationalSplits } from '@/components/game/GameSituationalSplits'

interface GamePageProps {
  params: Promise<{ id: string }>
}

export default async function GamePage({ params }: GamePageProps) {
  const { id } = await params
  const gameId = parseInt(id, 10)

  if (isNaN(gameId)) {
    notFound()
  }

  const [game, boxScore, playerLeaders, lineScores, drives, plays] = await Promise.all([
    getGameById(gameId),
    getGameBoxScore(gameId),
    getGamePlayerLeaders(gameId),
    getGameLineScores(gameId),
    getGameDrives(gameId),
    getGamePlays(gameId),
  ])

  if (!game) {
    notFound()
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getWeekLabel = (week: number): string => {
    if (week <= 15) return `Week ${week}`
    if (week === 16) return 'Conference Championships'
    return 'Bowl Games'
  }

  return (
    <main className="min-h-screen p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Back link and date/week info */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/games"
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            &larr; Back to Games
          </Link>
          <span className="text-sm text-[var(--text-muted)]">
            {formatDate(game.start_date)} &bull; {getWeekLabel(game.week)}
          </span>
        </div>

        {/* Score Header */}
        <GameScoreHeader game={game} />

        {/* Quarter Scores */}
        {lineScores && (
          <div className="mt-6">
            <QuarterScores lineScores={lineScores} game={game} />
          </div>
        )}

        {/* Scoring Timeline */}
        {drives.length > 0 && lineScores && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
              Scoring Timeline
            </h2>
            <ScoringTimeline drives={drives} lineScores={lineScores} game={game} />
          </div>
        )}

        {/* Drive Chart */}
        {drives.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
              Drive Chart
            </h2>
            <DriveChart drives={drives} game={game} />
          </div>
        )}

        {/* Box Score */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            Box Score
          </h2>
          {boxScore ? (
            <GameBoxScore boxScore={boxScore} game={game} />
          ) : (
            <p className="text-[var(--text-muted)] text-sm py-4">
              Stats unavailable for this game.
            </p>
          )}
        </div>

        {/* Player Leaders */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            Player Leaders
          </h2>
          {playerLeaders ? (
            <PlayerLeaders leaders={playerLeaders} game={game} />
          ) : (
            <p className="text-[var(--text-muted)] text-sm py-4">
              Player stats unavailable for this game.
            </p>
          )}
        </div>

        {/* Play-by-Play */}
        {drives.length > 0 && plays.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
              Play-by-Play
            </h2>
            <PlayByPlay drives={drives} plays={plays} game={game} />
          </div>
        )}

        {/* Situational Analysis */}
        {plays.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
              Situational Analysis
            </h2>
            <GameSituationalSplits plays={plays} drives={drives} game={game} />
          </div>
        )}
      </div>
    </main>
  )
}
