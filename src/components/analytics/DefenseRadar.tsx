'use client'

/**
 * Thin config module over RoughRadar (sweep C1): owns the defense metric
 * definitions and FBS percentile normalization (EPA allowed inverts --
 * lower is better); all drawing, tooltip, legend, and empty-state behavior
 * lives in the shared primitive.
 */
import { useMemo } from 'react'
import { ChartPolar } from '@phosphor-icons/react'
import { RoughRadar } from '@/lib/charts/RoughRadar'
import type { RoughRadarAxis } from '@/lib/charts/RoughRadar'

interface DefenseMetrics {
  epaAllowed: number // Lower is better - will be inverted
  havocRate: number // Higher is better
  stuffRate: number // Higher is better
  sacks: number // Higher is better
  interceptions: number // Higher is better
  tfls: number // Higher is better (tackles for loss)
}

export interface TeamDefenseData {
  team: string
  metrics: DefenseMetrics
}

interface DefenseRadarProps {
  teamData: TeamDefenseData
  allTeamsData: TeamDefenseData[] // For percentile calculation
  teamColor: string
}

interface RadarMetric {
  label: string
  shortLabel: string
  value: number // 0-100 percentile
  actualValue: number // Raw value for tooltip caption
  format: (v: number) => string
  inverted: boolean // Whether lower is better
}

function computePercentile(value: number, allValues: number[], higherIsBetter: boolean = true): number {
  const sorted = [...allValues].sort((a, b) => a - b)
  const rank = sorted.filter(v => v < value).length
  const percentile = (rank / Math.max(sorted.length - 1, 1)) * 100
  return higherIsBetter ? percentile : 100 - percentile
}

export function DefenseRadar({ teamData, allTeamsData, teamColor }: DefenseRadarProps) {
  const metrics = useMemo((): RadarMetric[] => {
    const allEpaAllowed = allTeamsData.map(t => t.metrics.epaAllowed)
    const allHavocRate = allTeamsData.map(t => t.metrics.havocRate)
    const allStuffRate = allTeamsData.map(t => t.metrics.stuffRate)
    const allSacks = allTeamsData.map(t => t.metrics.sacks)
    const allInterceptions = allTeamsData.map(t => t.metrics.interceptions)
    const allTfls = allTeamsData.map(t => t.metrics.tfls)

    return [
      {
        label: 'EPA Allowed',
        shortLabel: 'EPA Def',
        // Lower EPA allowed is better, so invert the percentile
        value: computePercentile(teamData.metrics.epaAllowed, allEpaAllowed, false),
        actualValue: teamData.metrics.epaAllowed,
        format: v => v.toFixed(3),
        inverted: true,
      },
      {
        label: 'Havoc Rate',
        shortLabel: 'Havoc',
        value: computePercentile(teamData.metrics.havocRate, allHavocRate, true),
        actualValue: teamData.metrics.havocRate,
        format: v => `${(v * 100).toFixed(1)}%`,
        inverted: false,
      },
      {
        label: 'Stuff Rate',
        shortLabel: 'Stuffs',
        value: computePercentile(teamData.metrics.stuffRate, allStuffRate, true),
        actualValue: teamData.metrics.stuffRate,
        format: v => `${(v * 100).toFixed(1)}%`,
        inverted: false,
      },
      {
        label: 'Sacks',
        shortLabel: 'Sacks',
        value: computePercentile(teamData.metrics.sacks, allSacks, true),
        actualValue: teamData.metrics.sacks,
        format: v => v.toFixed(0),
        inverted: false,
      },
      {
        label: 'Interceptions',
        shortLabel: 'INTs',
        value: computePercentile(teamData.metrics.interceptions, allInterceptions, true),
        actualValue: teamData.metrics.interceptions,
        format: v => v.toFixed(0),
        inverted: false,
      },
      {
        label: 'Tackles for Loss',
        shortLabel: 'TFLs',
        value: computePercentile(teamData.metrics.tfls, allTfls, true),
        actualValue: teamData.metrics.tfls,
        format: v => v.toFixed(0),
        inverted: false,
      },
    ]
  }, [teamData, allTeamsData])

  const axes: RoughRadarAxis[] = metrics.map(m => ({ key: m.label, label: m.shortLabel }))

  return (
    <RoughRadar
      title={`${teamData.team} — Defense`}
      ariaLabel={`${teamData.team} defense radar: ${metrics
        .map(m => `${m.label} ${m.format(m.actualValue)}`)
        .join(', ')}`}
      axes={axes}
      series={[
        {
          label: teamData.team,
          color: teamColor,
          values: metrics.map(m => m.value),
          captions: metrics.map(m =>
            m.inverted
              ? `Value: ${m.format(m.actualValue)} — lower is better, shown inverted`
              : `Value: ${m.format(m.actualValue)}`,
          ),
        },
      ]}
      emptyState={{
        icon: ChartPolar,
        title: 'No defense data for this team',
        description: 'Defensive havoc metrics publish once a team has played FBS snaps.',
      }}
    />
  )
}
