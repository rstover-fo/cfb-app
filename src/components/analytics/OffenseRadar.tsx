'use client'

/**
 * Thin config module over RoughRadar (sweep C1): owns the offense metric
 * definitions and FBS percentile normalization; all drawing, tooltip,
 * legend, and empty-state behavior lives in the shared primitive.
 */
import { useMemo } from 'react'
import { ChartPolar } from '@phosphor-icons/react'
import { RoughRadar } from '@/lib/charts/RoughRadar'
import type { RoughRadarAxis } from '@/lib/charts/RoughRadar'

interface OffenseMetrics {
  rushEpa: number
  passEpa: number
  successRate: number
  explosiveness: number
  thirdDownRate?: number // Optional - use if available
}

export interface TeamOffenseData {
  team: string
  metrics: OffenseMetrics
}

interface OffenseRadarProps {
  teamData: TeamOffenseData
  allTeamsData: TeamOffenseData[] // For percentile calculation
  teamColor: string
}

interface RadarMetric {
  label: string
  shortLabel: string
  value: number // 0-100 percentile
  actualValue: number // Raw value for tooltip caption
  format: (v: number) => string
}

function computePercentile(value: number, allValues: number[], higherIsBetter: boolean = true): number {
  const sorted = [...allValues].sort((a, b) => a - b)
  const rank = sorted.filter(v => v < value).length
  const percentile = (rank / Math.max(sorted.length - 1, 1)) * 100
  return higherIsBetter ? percentile : 100 - percentile
}

export function OffenseRadar({ teamData, allTeamsData, teamColor }: OffenseRadarProps) {
  const metrics = useMemo((): RadarMetric[] => {
    const allRushEpa = allTeamsData.map(t => t.metrics.rushEpa)
    const allPassEpa = allTeamsData.map(t => t.metrics.passEpa)
    const allSuccessRate = allTeamsData.map(t => t.metrics.successRate)
    const allExplosiveness = allTeamsData.map(t => t.metrics.explosiveness)
    const allThirdDown = allTeamsData
      .filter(t => t.metrics.thirdDownRate !== undefined)
      .map(t => t.metrics.thirdDownRate!)

    const result: RadarMetric[] = [
      {
        label: 'Rush EPA',
        shortLabel: 'Rush',
        value: computePercentile(teamData.metrics.rushEpa, allRushEpa),
        actualValue: teamData.metrics.rushEpa,
        format: v => v.toFixed(3),
      },
      {
        label: 'Pass EPA',
        shortLabel: 'Pass',
        value: computePercentile(teamData.metrics.passEpa, allPassEpa),
        actualValue: teamData.metrics.passEpa,
        format: v => v.toFixed(3),
      },
      {
        label: 'Success Rate',
        shortLabel: 'Success',
        value: computePercentile(teamData.metrics.successRate, allSuccessRate),
        actualValue: teamData.metrics.successRate,
        format: v => `${(v * 100).toFixed(1)}%`,
      },
      {
        label: 'Explosiveness',
        shortLabel: 'Explosive',
        value: computePercentile(teamData.metrics.explosiveness, allExplosiveness),
        actualValue: teamData.metrics.explosiveness,
        format: v => v.toFixed(3),
      },
    ]

    // Add 3rd down conversion if available
    if (teamData.metrics.thirdDownRate !== undefined && allThirdDown.length > 0) {
      result.push({
        label: '3rd Down Rate',
        shortLabel: '3rd Down',
        value: computePercentile(teamData.metrics.thirdDownRate, allThirdDown),
        actualValue: teamData.metrics.thirdDownRate,
        format: v => `${(v * 100).toFixed(1)}%`,
      })
    }

    return result
  }, [teamData, allTeamsData])

  const axes: RoughRadarAxis[] = metrics.map(m => ({ key: m.label, label: m.shortLabel }))

  return (
    <RoughRadar
      title={`${teamData.team} — Offense`}
      ariaLabel={`${teamData.team} offense radar: ${metrics
        .map(m => `${m.label} ${m.format(m.actualValue)}`)
        .join(', ')}`}
      axes={axes}
      series={[
        {
          label: teamData.team,
          color: teamColor,
          values: metrics.map(m => m.value),
          captions: metrics.map(m => `Value: ${m.format(m.actualValue)}`),
        },
      ]}
      emptyState={{
        icon: ChartPolar,
        title: 'No offense data for this team',
        description: 'Offensive efficiency metrics publish once a team has played FBS snaps.',
      }}
    />
  )
}
