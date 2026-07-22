'use client'

/**
 * Thin config module over RoughRadar (sweep C1): owns the position-group
 * axis definitions; drawing, tooltip, and empty-state behavior live in the
 * shared primitive. The old zero-polygon render for absent percentiles was
 * a spec §5 defect -- missing data now yields the framed EmptyState.
 */
import { useMemo } from 'react'
import { ChartPolar } from '@phosphor-icons/react'
import type { PlayerPercentiles } from '@/lib/types/database'
import { RoughRadar } from '@/lib/charts/RoughRadar'

interface PercentileRadarProps {
  percentiles: PlayerPercentiles
}

interface RadarAxis {
  label: string
  pctlKey: keyof PlayerPercentiles
}

const AXES_BY_POSITION: Record<string, RadarAxis[]> = {
  QB: [
    { label: 'Pass Yds', pctlKey: 'pass_yds_pctl' },
    { label: 'Pass TD', pctlKey: 'pass_td_pctl' },
    { label: 'Comp%', pctlKey: 'pass_pct_pctl' },
    { label: 'PPA', pctlKey: 'ppa_avg_pctl' },
    { label: 'Rush Yds', pctlKey: 'rush_yds_pctl' },
  ],
  RB: [
    { label: 'Rush Yds', pctlKey: 'rush_yds_pctl' },
    { label: 'Rush TD', pctlKey: 'rush_td_pctl' },
    { label: 'YPC', pctlKey: 'rush_ypc_pctl' },
    { label: 'PPA', pctlKey: 'ppa_avg_pctl' },
    { label: 'Rec Yds', pctlKey: 'rec_yds_pctl' },
  ],
  WR: [
    { label: 'Rec Yds', pctlKey: 'rec_yds_pctl' },
    { label: 'Rec TD', pctlKey: 'rec_td_pctl' },
    { label: 'Rush Yds', pctlKey: 'rush_yds_pctl' },
    { label: 'PPA', pctlKey: 'ppa_avg_pctl' },
  ],
  TE: [
    { label: 'Rec Yds', pctlKey: 'rec_yds_pctl' },
    { label: 'Rec TD', pctlKey: 'rec_td_pctl' },
    { label: 'Rush Yds', pctlKey: 'rush_yds_pctl' },
    { label: 'PPA', pctlKey: 'ppa_avg_pctl' },
  ],
  DEF: [
    { label: 'Tackles', pctlKey: 'tackles_pctl' },
    { label: 'Sacks', pctlKey: 'sacks_pctl' },
    { label: 'TFL', pctlKey: 'tfl_pctl' },
  ],
  DEFAULT: [
    { label: 'PPA', pctlKey: 'ppa_avg_pctl' },
    { label: 'Rush Yds', pctlKey: 'rush_yds_pctl' },
    { label: 'Pass Yds', pctlKey: 'pass_yds_pctl' },
    { label: 'Rec Yds', pctlKey: 'rec_yds_pctl' },
    { label: 'Tackles', pctlKey: 'tackles_pctl' },
  ],
}

const DEFENSE_POSITIONS = new Set([
  'DL', 'DE', 'DT', 'NT', 'LB', 'ILB', 'OLB', 'MLB',
  'DB', 'CB', 'S', 'FS', 'SS', 'EDGE',
])

function getAxesForPosition(positionGroup: string | null, position: string | null): RadarAxis[] {
  if (positionGroup) {
    const upper = positionGroup.toUpperCase()
    if (AXES_BY_POSITION[upper]) return AXES_BY_POSITION[upper]
    if (DEFENSE_POSITIONS.has(upper)) return AXES_BY_POSITION.DEF
  }
  if (position) {
    const upper = position.toUpperCase()
    if (AXES_BY_POSITION[upper]) return AXES_BY_POSITION[upper]
    if (DEFENSE_POSITIONS.has(upper)) return AXES_BY_POSITION.DEF
    if (upper === 'WR' || upper === 'TE') return AXES_BY_POSITION[upper]
  }
  return AXES_BY_POSITION.DEFAULT
}

export function PercentileRadar({ percentiles }: PercentileRadarProps) {
  const axes = useMemo(
    () => getAxesForPosition(percentiles.position_group, percentiles.position),
    [percentiles.position_group, percentiles.position]
  )

  // Percentiles arrive on 0-1; RoughRadar's domain contract is 0-100.
  const values = axes.map(axis => {
    const value = percentiles[axis.pctlKey] as number | null
    return value == null ? null : value * 100
  })

  return (
    <RoughRadar
      title="Percentile Rankings"
      subtitle={`vs. ${percentiles.position_group ?? 'position group'} · ${percentiles.season}`}
      ariaLabel={`Percentile radar chart for ${percentiles.name}`}
      axes={axes.map(axis => ({ key: axis.pctlKey, label: axis.label }))}
      series={[
        {
          label: percentiles.name,
          color: 'var(--color-run)',
          values,
        },
      ]}
      emptyState={{
        icon: ChartPolar,
        title: 'No percentile data for this season',
        description: 'Percentiles publish once a player has enough qualifying snaps at their position.',
      }}
    />
  )
}
