'use client'

import { ConferenceSplit } from '@/lib/types/database'

interface ConferenceViewProps {
  data: ConferenceSplit[] | null
  conference: string
}

function SplitCard({ title, data, subtitle }: { title: string; data: ConferenceSplit; subtitle: string }) {
  return (
    <div className="card p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-headline text-lg text-[var(--text-primary)]">{title}</h3>
        <span className="text-xs text-[var(--text-muted)]">{subtitle}</span>
      </div>

      {/* Record */}
      <div className="text-center mb-6">
        <span className="font-headline text-4xl text-[var(--text-primary)]">
          {data.wins}-{data.games - data.wins}
        </span>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {(data.win_pct * 100).toFixed(0)}% win rate
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-[var(--text-muted)]">Points/Game</p>
          <p className="font-headline text-xl text-[var(--text-primary)]">{data.points_per_game.toFixed(1)}</p>
        </div>
        <div>
          <p className="text-[var(--text-muted)]">Points Allowed</p>
          <p className="font-headline text-xl text-[var(--text-primary)]">{data.points_allowed_per_game.toFixed(1)}</p>
        </div>
        <div>
          <p className="text-[var(--text-muted)]">EPA/Play</p>
          <p className={`font-headline text-xl ${data.epa_per_play >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
            {data.epa_per_play.toFixed(3)}
          </p>
        </div>
        <div>
          <p className="text-[var(--text-muted)]">Avg Margin</p>
          <p className={`font-headline text-xl ${data.margin_per_game >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
            {data.margin_per_game >= 0 ? '+' : ''}{data.margin_per_game.toFixed(1)}
          </p>
        </div>
      </div>
    </div>
  )
}

export function ConferenceView({ data, conference }: ConferenceViewProps) {
  if (!data || data.length === 0) {
    return (
      <p className="text-[var(--text-muted)] text-center py-8">
        Conference split data not available for this team.
      </p>
    )
  }

  const confData = data.find(d => d.opponent_type === 'conference')
  const nonConfData = data.find(d => d.opponent_type === 'non_conference')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {confData && (
        <SplitCard
          title={`vs ${conference}`}
          data={confData}
          subtitle={`${confData.games} games`}
        />
      )}
      {nonConfData && (
        <SplitCard
          title="vs Non-Conference"
          data={nonConfData}
          subtitle={`${nonConfData.games} games`}
        />
      )}
    </div>
  )
}
