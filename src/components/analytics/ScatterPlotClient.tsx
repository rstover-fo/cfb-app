'use client'

import { useState } from 'react'
import { Team, TeamSeasonEpa, TeamStyleProfile } from '@/lib/types/database'

interface ScatterPlotClientProps {
  teams: Team[]
  metrics: TeamSeasonEpa[]
  styles: TeamStyleProfile[]
  currentSeason: number
}

type MetricKey = 'epa_vs_success' | 'off_vs_def' | 'run_vs_pass'

const PLOT_OPTIONS: { id: MetricKey; label: string; xLabel: string; yLabel: string }[] = [
  { id: 'epa_vs_success', label: 'EPA vs Success Rate', xLabel: 'EPA per Play', yLabel: 'Success Rate' },
  { id: 'off_vs_def', label: 'Offense vs Defense', xLabel: 'Offensive EPA Rank', yLabel: 'Defensive EPA Rank' },
  { id: 'run_vs_pass', label: 'Run vs Pass EPA', xLabel: 'Rushing EPA', yLabel: 'Passing EPA' },
]

export function ScatterPlotClient({ teams, metrics, styles, currentSeason }: ScatterPlotClientProps) {
  const [activePlot, setActivePlot] = useState<MetricKey>('epa_vs_success')

  const activeOption = PLOT_OPTIONS.find(p => p.id === activePlot)!

  return (
    <div>
      {/* Plot Type Selector */}
      <div className="flex gap-2 mb-6">
        {PLOT_OPTIONS.map(option => (
          <button
            key={option.id}
            onClick={() => setActivePlot(option.id)}
            className={`px-4 py-2 border-[1.5px] rounded-sm text-sm transition-all ${
              activePlot === option.id
                ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Scatter Plot Container */}
      <div className="card p-6">
        <div className="text-center py-20 text-[var(--text-muted)]">
          Scatter plot visualization coming next...
          <br />
          <span className="text-sm">
            {teams.length} teams · {metrics.length} metrics · Plot: {activeOption.label}
          </span>
        </div>
      </div>
    </div>
  )
}
