'use client'

import { FieldPositionSplit } from '@/lib/types/database'

interface FieldPositionViewProps {
  data: FieldPositionSplit[] | null
}

function getZoneColor(epa: number): string {
  if (epa >= 0.15) return 'var(--color-positive)'
  if (epa >= 0) return 'var(--bg-surface-alt)'
  if (epa >= -0.15) return 'var(--color-neutral)'
  return 'var(--color-negative)'
}

function FieldZoneBar({ zones, side }: { zones: FieldPositionSplit[]; side: 'offense' | 'defense' }) {
  const sideZones = zones.filter(z => z.side === side)
  const orderedZones = ['own_1_20', 'own_21_50', 'opp_49_21', 'opp_20_1']

  return (
    <div>
      <h3 className="font-headline text-lg text-[var(--text-primary)] mb-4">
        {side === 'offense' ? 'Offense' : 'Defense'}
      </h3>

      {/* Field visualization */}
      <div className="card p-4 mb-4">
        <div className="flex gap-1 h-16 rounded overflow-hidden">
          {orderedZones.map(zoneId => {
            const zone = sideZones.find(z => z.zone === zoneId)
            if (!zone) return null
            return (
              <div
                key={zoneId}
                className="flex-1 flex flex-col items-center justify-center text-xs"
                style={{ backgroundColor: getZoneColor(zone.epa_per_play) }}
              >
                <span className="font-medium text-[var(--text-primary)]">
                  {(zone.success_rate * 100).toFixed(0)}%
                </span>
                <span className="text-[var(--text-muted)]">{zone.zone_label}</span>
              </div>
            )
          })}
        </div>
        <div className="flex justify-between text-xs text-[var(--text-muted)] mt-2">
          <span>← Own End Zone</span>
          <span>Opponent End Zone →</span>
        </div>
      </div>

      {/* Stats table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left py-2 text-[var(--text-muted)] font-normal">Zone</th>
              <th className="text-right py-2 text-[var(--text-muted)] font-normal">Plays</th>
              <th className="text-right py-2 text-[var(--text-muted)] font-normal">Success</th>
              <th className="text-right py-2 text-[var(--text-muted)] font-normal">EPA/Play</th>
              <th className="text-right py-2 text-[var(--text-muted)] font-normal">Yds/Play</th>
            </tr>
          </thead>
          <tbody>
            {orderedZones.map(zoneId => {
              const zone = sideZones.find(z => z.zone === zoneId)
              if (!zone) return null
              return (
                <tr key={zoneId} className="border-b border-[var(--border)]">
                  <td className="py-2 text-[var(--text-primary)]">{zone.zone_label}</td>
                  <td className="py-2 text-right text-[var(--text-secondary)]">{zone.play_count}</td>
                  <td className="py-2 text-right text-[var(--text-primary)]">
                    {(zone.success_rate * 100).toFixed(0)}%
                  </td>
                  <td className={`py-2 text-right ${zone.epa_per_play >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                    {zone.epa_per_play.toFixed(3)}
                  </td>
                  <td className="py-2 text-right text-[var(--text-secondary)]">
                    {zone.yards_per_play.toFixed(1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function FieldPositionView({ data }: FieldPositionViewProps) {
  if (!data || data.length === 0) {
    return (
      <p className="text-[var(--text-muted)] text-center py-8">
        Field position data not available for this team.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <FieldZoneBar zones={data} side="offense" />
      <FieldZoneBar zones={data} side="defense" />
    </div>
  )
}
