'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { ArrowsLeftRight } from '@phosphor-icons/react'
import { Team, TeamSeasonEpa, TeamStyleProfile } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { TeamPicker } from '@/components/comparison/TeamPicker'
import { EmptyState } from '@/components/EmptyState'

interface CompareViewProps {
  /** Team 1 -- fixed by the parent route on the team-page Compare tab; nullable + selectable on /compare. */
  team: Team | null
  metrics: TeamSeasonEpa | null
  style: TeamStyleProfile | null
  allTeams: Team[]
  currentSeason: number
  /** Team 2 -- when provided, seeds the comparison (used by the /compare route). */
  compareTeam?: Team | null
  compareMetrics?: TeamSeasonEpa | null
  compareStyle?: TeamStyleProfile | null
  /** When true, team 1 also gets a picker (standalone /compare route). Defaults to false (team-page tab). */
  allowTeam1Change?: boolean
  /** Fires whenever either side's selection changes -- lets the /compare route keep ?t1=&t2= in sync. */
  onSelectionChange?: (team1Id: number | null, team2Id: number | null) => void
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

// Owns one side of the comparison: a selectable team plus its EPA/style
// metrics. Seeded from server-fetched props (avoids a loading flash for
// whichever team the page already resolved server-side) and re-fetches
// client-side -- mirroring the pre-refactor Compare-tab behavior -- whenever
// the selection changes away from that initial seed.
function useTeamSlot(
  initialTeamId: number | null,
  initialMetrics: TeamSeasonEpa | null,
  initialStyle: TeamStyleProfile | null,
  season: number,
  allTeams: Team[]
) {
  const [teamId, setTeamId] = useState<number | null>(initialTeamId)
  const [metrics, setMetrics] = useState<TeamSeasonEpa | null>(initialMetrics)
  const [style, setStyle] = useState<TeamStyleProfile | null>(initialStyle)
  const [loading, setLoading] = useState(false)

  // Consumed on the first effect run only -- lets us skip a redundant
  // client-side refetch for the team we already have server-fetched data for.
  const skipInitialFetch = useRef(initialTeamId !== null)

  useEffect(() => {
    if (teamId === null) {
      setMetrics(null)
      setStyle(null)
      setLoading(false)
      return
    }

    if (skipInitialFetch.current && teamId === initialTeamId) {
      skipInitialFetch.current = false
      return
    }
    skipInitialFetch.current = false

    const school = allTeams.find(t => t.id === teamId)?.school
    if (!school) {
      setMetrics(null)
      setStyle(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setMetrics(null)
    setStyle(null)

    const supabase = createClient()
    Promise.all([
      supabase.from('team_epa_season').select('*').eq('team', school).eq('season', season).single(),
      supabase.from('team_style_profile').select('*').eq('team', school).eq('season', season).single()
    ]).then(([metricsRes, styleRes]) => {
      if (cancelled) return
      setMetrics(metricsRes.data as TeamSeasonEpa | null)
      setStyle(styleRes.data as TeamStyleProfile | null)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, season, allTeams])

  const team = allTeams.find(t => t.id === teamId) ?? null

  return { teamId, setTeamId, team, metrics, style, loading }
}

export function CompareView({
  team,
  metrics,
  style,
  allTeams,
  currentSeason,
  compareTeam = null,
  compareMetrics = null,
  compareStyle = null,
  allowTeam1Change = false,
  onSelectionChange
}: CompareViewProps) {
  const slot1 = useTeamSlot(team?.id ?? null, metrics, style, currentSeason, allTeams)
  const slot2 = useTeamSlot(compareTeam?.id ?? null, compareMetrics, compareStyle, currentSeason, allTeams)

  useEffect(() => {
    onSelectionChange?.(slot1.teamId, slot2.teamId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot1.teamId, slot2.teamId])

  // Team-page tab: team 1 is fixed by the parent route, always fresh off
  // props (so that page's season selector keeps working). Standalone route:
  // team 1 is chosen via its own picker, tracked by slot1 instead.
  const team1 = allowTeam1Change ? slot1.team : team
  const team1Metrics = allowTeam1Change ? slot1.metrics : metrics
  const team1Style = allowTeam1Change ? slot1.style : style

  const team2 = slot2.team ?? compareTeam
  const loading = (allowTeam1Change && slot1.loading) || slot2.loading

  const bothSelected = !!team1 && !!team2

  const formatPct = (v: number) => `${(v * 100).toFixed(1)}%`
  const formatNum = (v: number) => v.toFixed(2)
  const formatRank = (v: number) => `#${Math.round(v)}`

  return (
    <div>
      {/* Team Selector */}
      <div className="flex items-center gap-4 mb-8 flex-wrap">
        {allowTeam1Change ? (
          <TeamPicker
            label="Team 1"
            teams={allTeams}
            value={slot1.teamId}
            onChange={slot1.setTeamId}
            excludeId={slot2.teamId}
          />
        ) : (
          <div className="flex items-center gap-3">
            {team?.logo && <Image src={team.logo} alt={team.school ?? ''} width={40} height={40} className="w-10 h-10 object-contain" unoptimized />}
            <span className="font-headline text-xl text-[var(--text-primary)]">{team?.school ?? ''}</span>
          </div>
        )}

        <span className="text-[var(--text-muted)]">vs</span>

        <TeamPicker
          label="Team 2"
          teams={allTeams}
          value={slot2.teamId}
          onChange={slot2.setTeamId}
          excludeId={slot1.teamId}
        />
      </div>

      {!bothSelected && !loading && (
        <EmptyState
          icon={ArrowsLeftRight}
          title={allowTeam1Change ? 'Select two teams to compare.' : 'Select a team to compare.'}
          description="Pick from the dropdowns above to see EPA, success rate, and style metrics side by side."
        />
      )}

      {loading && (
        <p className="text-[var(--text-muted)] text-center py-12">
          Loading...
        </p>
      )}

      {bothSelected && !loading && (
        <div className="card p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: team1?.color || 'var(--color-run)' }} />
              <span className="font-medium text-[var(--text-primary)]">{team1?.school}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--text-primary)]">{team2?.school}</span>
              <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: team2?.color || 'var(--color-pass)' }} />
            </div>
          </div>

          {/* Metrics Comparison */}
          <div className="space-y-1">
            <MetricBar
              label="EPA/Play"
              value1={team1Metrics?.epa_per_play || null}
              value2={slot2.metrics?.epa_per_play || null}
              format={formatNum}
              color1={team1?.color || 'var(--color-run)'}
              color2={team2?.color || 'var(--color-pass)'}
              higherIsBetter={true}
            />
            <MetricBar
              label="Success Rate"
              value1={team1Metrics?.success_rate || null}
              value2={slot2.metrics?.success_rate || null}
              format={formatPct}
              color1={team1?.color || 'var(--color-run)'}
              color2={team2?.color || 'var(--color-pass)'}
              higherIsBetter={true}
            />
            <MetricBar
              label="Explosiveness"
              value1={team1Metrics?.explosiveness || null}
              value2={slot2.metrics?.explosiveness || null}
              format={formatNum}
              color1={team1?.color || 'var(--color-run)'}
              color2={team2?.color || 'var(--color-pass)'}
              higherIsBetter={true}
            />
            <MetricBar
              label="Offensive Rank"
              value1={team1Metrics?.off_epa_rank || null}
              value2={slot2.metrics?.off_epa_rank || null}
              format={formatRank}
              color1={team1?.color || 'var(--color-run)'}
              color2={team2?.color || 'var(--color-pass)'}
              higherIsBetter={false}
            />
            <MetricBar
              label="Defensive Rank"
              value1={team1Metrics?.def_epa_rank || null}
              value2={slot2.metrics?.def_epa_rank || null}
              format={formatRank}
              color1={team1?.color || 'var(--color-run)'}
              color2={team2?.color || 'var(--color-pass)'}
              higherIsBetter={false}
            />
            {team1Style && slot2.style && (
              <>
                <MetricBar
                  label="Run Rate"
                  value1={team1Style.run_rate}
                  value2={slot2.style.run_rate}
                  format={formatPct}
                  color1={team1?.color || 'var(--color-run)'}
                  color2={team2?.color || 'var(--color-pass)'}
                  higherIsBetter={true}
                />
                <MetricBar
                  label="Rushing EPA"
                  value1={team1Style.epa_rushing}
                  value2={slot2.style.epa_rushing}
                  format={formatNum}
                  color1={team1?.color || 'var(--color-run)'}
                  color2={team2?.color || 'var(--color-pass)'}
                  higherIsBetter={true}
                />
                <MetricBar
                  label="Passing EPA"
                  value1={team1Style.epa_passing}
                  value2={slot2.style.epa_passing}
                  format={formatNum}
                  color1={team1?.color || 'var(--color-run)'}
                  color2={team2?.color || 'var(--color-pass)'}
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
