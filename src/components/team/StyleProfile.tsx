import { TeamStyleProfile as StyleData } from '@/lib/types/database'

interface StyleProfileProps {
  style: StyleData
}

function IdentityBadge({ identity }: { identity: string }) {
  const colors = {
    run_heavy: 'bg-amber-100 text-amber-800',
    balanced: 'bg-blue-100 text-blue-800',
    pass_heavy: 'bg-purple-100 text-purple-800',
  }

  const labels = {
    run_heavy: 'Run Heavy',
    balanced: 'Balanced',
    pass_heavy: 'Pass Heavy',
  }

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[identity as keyof typeof colors] || 'bg-gray-100'}`}>
      {labels[identity as keyof typeof labels] || identity}
    </span>
  )
}

function TempoBadge({ tempo }: { tempo: string }) {
  const colors = {
    up_tempo: 'bg-green-100 text-green-800',
    balanced: 'bg-gray-100 text-gray-800',
    slow: 'bg-orange-100 text-orange-800',
  }

  const labels = {
    up_tempo: 'Up Tempo',
    balanced: 'Balanced Tempo',
    slow: 'Slow Tempo',
  }

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[tempo as keyof typeof colors] || 'bg-gray-100'}`}>
      {labels[tempo as keyof typeof labels] || tempo}
    </span>
  )
}

export function StyleProfile({ style }: StyleProfileProps) {
  const runPercent = (style.run_rate * 100).toFixed(0)
  const passPercent = (style.pass_rate * 100).toFixed(0)

  return (
    <div className="p-6 border rounded-lg">
      <div className="flex items-center gap-3 mb-6">
        <IdentityBadge identity={style.offensive_identity} />
        <TempoBadge tempo={style.tempo_category} />
        <span className="text-sm text-gray-500">
          {style.plays_per_game.toFixed(1)} plays/game
        </span>
      </div>

      {/* Run/Pass Split Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-1">
          <span>Run {runPercent}%</span>
          <span>Pass {passPercent}%</span>
        </div>
        <div className="h-4 rounded-full overflow-hidden flex">
          <div
            className="bg-amber-500"
            style={{ width: `${runPercent}%` }}
            role="img"
            aria-label={`Run rate: ${runPercent}%`}
          />
          <div
            className="bg-purple-500"
            style={{ width: `${passPercent}%` }}
            role="img"
            aria-label={`Pass rate: ${passPercent}%`}
          />
        </div>
      </div>

      {/* EPA by Type */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-gray-500">Rushing EPA</p>
          <p className="text-xl font-semibold">{style.epa_rushing?.toFixed(3) || 'N/A'}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Passing EPA</p>
          <p className="text-xl font-semibold">{style.epa_passing?.toFixed(3) || 'N/A'}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Def vs Run</p>
          <p className="text-xl font-semibold">{style.def_epa_vs_run?.toFixed(3) || 'N/A'}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Def vs Pass</p>
          <p className="text-xl font-semibold">{style.def_epa_vs_pass?.toFixed(3) || 'N/A'}</p>
        </div>
      </div>
    </div>
  )
}
