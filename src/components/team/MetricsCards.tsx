import { TeamSeasonEpa } from '@/lib/types/database'
import { formatRank } from '@/lib/utils'

interface MetricsCardsProps {
  metrics: TeamSeasonEpa
}

interface MetricCardProps {
  label: string
  value: string
  rank?: number
  trend?: 'up' | 'down' | 'neutral'
  trendLabel?: string
}

function MetricCard({ label, value, rank, trend, trendLabel }: MetricCardProps) {
  return (
    <div className="p-4 border rounded-lg bg-white">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      <div className="flex items-center gap-2 mt-1">
        {rank && (
          <span className="text-sm text-gray-600">{formatRank(rank)} nationally</span>
        )}
        {trend && trendLabel && (
          <span className={`text-sm ${
            trend === 'up' ? 'text-green-600' :
            trend === 'down' ? 'text-red-600' : 'text-gray-500'
          }`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendLabel}
          </span>
        )}
      </div>
    </div>
  )
}

export function MetricsCards({ metrics }: MetricsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        label="EPA per Play"
        value={metrics.epa_per_play.toFixed(3)}
        rank={metrics.off_epa_rank}
      />
      <MetricCard
        label="Success Rate"
        value={`${(metrics.success_rate * 100).toFixed(1)}%`}
      />
      <MetricCard
        label="Explosiveness"
        value={metrics.explosiveness.toFixed(3)}
      />
      <MetricCard
        label="Games Played"
        value={metrics.games.toString()}
      />
    </div>
  )
}
