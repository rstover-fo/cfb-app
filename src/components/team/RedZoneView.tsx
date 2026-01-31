'use client'

import { RedZoneSplit } from '@/lib/types/database'

interface RedZoneViewProps {
  data: RedZoneSplit[] | null
}

function StatCard({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <div className="card p-4 text-center">
      <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">{label}</p>
      <p className="font-headline text-3xl text-[var(--text-primary)]">{value}</p>
      {subtext && <p className="text-xs text-[var(--text-secondary)] mt-1">{subtext}</p>}
    </div>
  )
}

function RedZoneSection({ title, data }: { title: string; data: RedZoneSplit }) {
  return (
    <div>
      <h3 className="font-headline text-lg text-[var(--text-primary)] mb-4">{title}</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Scoring Rate"
          value={`${(data.scoring_rate * 100).toFixed(0)}%`}
          subtext={`${data.touchdowns + data.field_goals} scores / ${data.trips} trips`}
        />
        <StatCard
          label="TD Rate"
          value={`${(data.td_rate * 100).toFixed(0)}%`}
          subtext={`${data.touchdowns} touchdowns`}
        />
        <StatCard
          label="FG Rate"
          value={`${(data.fg_rate * 100).toFixed(0)}%`}
          subtext={`${data.field_goals} field goals`}
        />
        <StatCard
          label="Pts/Trip"
          value={data.points_per_trip.toFixed(1)}
          subtext={`${data.epa_per_play.toFixed(2)} EPA/play`}
        />
      </div>
    </div>
  )
}

export function RedZoneView({ data }: RedZoneViewProps) {
  if (!data || data.length === 0) {
    return (
      <p className="text-[var(--text-muted)] text-center py-8">
        Red zone data not available for this team.
      </p>
    )
  }

  const offense = data.find(d => d.side === 'offense')
  const defense = data.find(d => d.side === 'defense')

  return (
    <div className="space-y-8">
      {offense && <RedZoneSection title="Offense (When in opponent's red zone)" data={offense} />}
      {defense && <RedZoneSection title="Defense (When opponent is in our red zone)" data={defense} />}
    </div>
  )
}
