'use client'

import { useState, useEffect } from 'react'
import { Team, TeamSeasonEpa, TeamStyleProfile } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'

interface CompareViewProps {
  team: Team
  metrics: TeamSeasonEpa | null
  style: TeamStyleProfile | null
  allTeams: Team[]
  currentSeason: number
}

function MetricBar({
  label,
  value1,
  value2,
  format,
  color1,
  color2,
  higherIsBetter
}: {
  label: string
  value1: number | null
  value2: number | null
  format: (v: number) => string
  color1: string
  color2: string
  higherIsBetter: boolean
}) {
  if (value1 === null || value2 === null) return null

  const max = Math.max(Math.abs(value1), Math.abs(value2))
  const width1 = max > 0 ? (Math.abs(value1) / max) * 100 : 0
  const width2 = max > 0 ? (Math.abs(value2) / max) * 100 : 0

  const better1 = higherIsBetter ? value1 > value2 : value1 < value2
  const better2 = higherIsBetter ? value2 > value1 : value2 < value1

  return (
    <div className="py-3 border-b border-[var(--border)] last:border-b-0">
      <div className="text-sm text-[var(--text-muted)] mb-2">{label}</div>
      <div className="flex items-center gap-4">
        {/* Team 1 bar (right aligned) */}
        <div className="flex-1 flex items-center justify-end gap-2">
          <span className={`text-sm font-medium ${better1 ? 'text-[var(--color-positive)]' : 'text-[var(--text-secondary)]'}`}>
            {format(value1)}
          </span>
          <div className="w-32 h-4 bg-[var(--bg-surface-alt)] rounded-sm overflow-hidden">
            <div
              className="h-full rounded-sm transition-all duration-300"
              style={{
                width: `${width1}%`,
                backgroundColor: color1,
                marginLeft: 'auto'
              }}
            />
          </div>
        </div>

        {/* Team 2 bar (left aligned) */}
        <div className="flex-1 flex items-center gap-2">
          <div className="w-32 h-4 bg-[var(--bg-surface-alt)] rounded-sm overflow-hidden">
            <div
              className="h-full rounded-sm transition-all duration-300"
              style={{
                width: `${width2}%`,
                backgroundColor: color2
              }}
            />
          </div>
          <span className={`text-sm font-medium ${better2 ? 'text-[var(--color-positive)]' : 'text-[var(--text-secondary)]'}`}>
            {format(value2)}
          </span>
        </div>
      </div>
    </div>
  )
}

export function CompareView({ team, metrics, style, allTeams, currentSeason }: CompareViewProps) {
  const [compareTeamId, setCompareTeamId] = useState<number | null>(null)
  const [compareMetrics, setCompareMetrics] = useState<TeamSeasonEpa | null>(null)
  const [compareStyle, setCompareStyle] = useState<TeamStyleProfile | null>(null)
  const [loading, setLoading] = useState(false)

  const compareTeam = allTeams.find(t => t.id === compareTeamId) || null

  useEffect(() => {
    if (!compareTeamId) {
      return
    }

    let cancelled = false

    const fetchCompareData = async () => {
      setLoading(true)
      setCompareMetrics(null)
      setCompareStyle(null)

      const supabase = createClient()
      const compareTeamName = allTeams.find(t => t.id === compareTeamId)?.school

      if (!compareTeamName) {
        setLoading(false)
        return
      }

      const [metricsRes, styleRes] = await Promise.all([
        supabase
          .from('team_epa_season')
          .select('*')
          .eq('team', compareTeamName)
          .eq('season', currentSeason)
          .single(),
        supabase
          .from('team_style_profile')
          .select('*')
          .eq('team', compareTeamName)
          .eq('season', currentSeason)
          .single()
      ])

      if (!cancelled) {
        setCompareMetrics(metricsRes.data as TeamSeasonEpa | null)
        setCompareStyle(styleRes.data as TeamStyleProfile | null)
        setLoading(false)
      }
    }

    fetchCompareData()

    return () => {
      cancelled = true
    }
  }, [compareTeamId, allTeams, currentSeason])

  const formatPct = (v: number) => `${(v * 100).toFixed(1)}%`
  const formatNum = (v: number) => v.toFixed(2)
  const formatRank = (v: number) => `#${Math.round(v)}`

  return (
    <div>
      {/* Team Selector */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
          {team.logo && <img src={team.logo} alt={team.school} className="w-10 h-10 object-contain" />}
          <span className="font-headline text-xl text-[var(--text-primary)]">{team.school}</span>
        </div>

        <span className="text-[var(--text-muted)]">vs</span>

        <select
          value={compareTeamId || ''}
          onChange={(e) => setCompareTeamId(e.target.value ? Number(e.target.value) : null)}
          className="px-4 py-2 border-[1.5px] border-[var(--border)] rounded-sm bg-[var(--bg-surface)] text-[var(--text-primary)] focus:border-[var(--color-run)] focus:outline-none"
        >
          <option value="">Select a team...</option>
          {allTeams
            .filter(t => t.id !== team.id)
            .sort((a, b) => a.school.localeCompare(b.school))
            .map(t => (
              <option key={t.id} value={t.id}>{t.school}</option>
            ))
          }
        </select>

        {compareTeam?.logo && (
          <img src={compareTeam.logo} alt={compareTeam.school} className="w-10 h-10 object-contain" />
        )}
      </div>

      {!compareTeamId && (
        <p className="text-[var(--text-muted)] text-center py-12">
          Select a team to compare.
        </p>
      )}

      {loading && (
        <p className="text-[var(--text-muted)] text-center py-12">
          Loading...
        </p>
      )}

      {compareTeamId && !loading && (
        <div className="card p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: team.color || 'var(--color-run)' }} />
              <span className="font-medium text-[var(--text-primary)]">{team.school}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--text-primary)]">{compareTeam?.school}</span>
              <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: compareTeam?.color || 'var(--color-pass)' }} />
            </div>
          </div>

          {/* Metrics Comparison */}
          <div className="space-y-1">
            <MetricBar
              label="EPA/Play"
              value1={metrics?.epa_per_play || null}
              value2={compareMetrics?.epa_per_play || null}
              format={formatNum}
              color1={team.color || 'var(--color-run)'}
              color2={compareTeam?.color || 'var(--color-pass)'}
              higherIsBetter={true}
            />
            <MetricBar
              label="Success Rate"
              value1={metrics?.success_rate || null}
              value2={compareMetrics?.success_rate || null}
              format={formatPct}
              color1={team.color || 'var(--color-run)'}
              color2={compareTeam?.color || 'var(--color-pass)'}
              higherIsBetter={true}
            />
            <MetricBar
              label="Explosiveness"
              value1={metrics?.explosiveness || null}
              value2={compareMetrics?.explosiveness || null}
              format={formatNum}
              color1={team.color || 'var(--color-run)'}
              color2={compareTeam?.color || 'var(--color-pass)'}
              higherIsBetter={true}
            />
            <MetricBar
              label="Offensive Rank"
              value1={metrics?.off_epa_rank || null}
              value2={compareMetrics?.off_epa_rank || null}
              format={formatRank}
              color1={team.color || 'var(--color-run)'}
              color2={compareTeam?.color || 'var(--color-pass)'}
              higherIsBetter={false}
            />
            <MetricBar
              label="Defensive Rank"
              value1={metrics?.def_epa_rank || null}
              value2={compareMetrics?.def_epa_rank || null}
              format={formatRank}
              color1={team.color || 'var(--color-run)'}
              color2={compareTeam?.color || 'var(--color-pass)'}
              higherIsBetter={false}
            />
            {style && compareStyle && (
              <>
                <MetricBar
                  label="Run Rate"
                  value1={style.run_rate}
                  value2={compareStyle.run_rate}
                  format={formatPct}
                  color1={team.color || 'var(--color-run)'}
                  color2={compareTeam?.color || 'var(--color-pass)'}
                  higherIsBetter={true}
                />
                <MetricBar
                  label="Rushing EPA"
                  value1={style.epa_rushing}
                  value2={compareStyle.epa_rushing}
                  format={formatNum}
                  color1={team.color || 'var(--color-run)'}
                  color2={compareTeam?.color || 'var(--color-pass)'}
                  higherIsBetter={true}
                />
                <MetricBar
                  label="Passing EPA"
                  value1={style.epa_passing}
                  value2={compareStyle.epa_passing}
                  format={formatNum}
                  color1={team.color || 'var(--color-run)'}
                  color2={compareTeam?.color || 'var(--color-pass)'}
                  higherIsBetter={true}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
