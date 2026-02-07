'use client'

import type { PlayerProfile } from '@/app/players/[id]/actions'

// ---------------------------------------------------------------------------
// Position group mapping
// ---------------------------------------------------------------------------

const POS_GROUPS: Record<string, string> = {
  QB: 'passing',
  RB: 'rushing', FB: 'rushing',
  WR: 'receiving', TE: 'receiving',
  OL: 'line', OT: 'line', OG: 'line', C: 'line',
  DL: 'defense', DE: 'defense', DT: 'defense', NT: 'defense',
  LB: 'defense', ILB: 'defense', OLB: 'defense', MLB: 'defense',
  DB: 'defense', CB: 'defense', S: 'defense', FS: 'defense', SS: 'defense',
  EDGE: 'defense',
  K: 'kicking', P: 'kicking',
}

function getPositionGroup(position: string | null): string {
  if (!position) return 'unknown'
  return POS_GROUPS[position.toUpperCase()] ?? 'unknown'
}

// ---------------------------------------------------------------------------
// Stat section definitions
// ---------------------------------------------------------------------------

interface StatDef {
  label: string
  value: (p: PlayerProfile) => string
}

const PASSING_STATS: StatDef[] = [
  { label: 'Comp/Att', value: (p) => `${p.pass_cmp ?? 0}/${p.pass_att ?? 0}` },
  { label: 'Yards', value: (p) => formatNum(p.pass_yds) },
  { label: 'TD', value: (p) => formatNum(p.pass_td) },
  { label: 'INT', value: (p) => formatNum(p.pass_int) },
  { label: 'Comp%', value: (p) => p.pass_pct != null ? `${(p.pass_pct * 100).toFixed(1)}%` : '-' },
]

const RUSHING_STATS: StatDef[] = [
  { label: 'Carries', value: (p) => formatNum(p.rush_car) },
  { label: 'Yards', value: (p) => formatNum(p.rush_yds) },
  { label: 'TD', value: (p) => formatNum(p.rush_td) },
  { label: 'YPC', value: (p) => p.rush_ypc != null ? p.rush_ypc.toFixed(1) : '-' },
]

const RECEIVING_STATS: StatDef[] = [
  { label: 'Rec', value: (p) => formatNum(p.rec) },
  { label: 'Yards', value: (p) => formatNum(p.rec_yds) },
  { label: 'TD', value: (p) => formatNum(p.rec_td) },
  { label: 'YPR', value: (p) => p.rec_ypr != null ? p.rec_ypr.toFixed(1) : '-' },
]

const DEFENSE_STATS: StatDef[] = [
  { label: 'Tackles', value: (p) => formatNum(p.tackles) },
  { label: 'Solo', value: (p) => formatNum(p.solo) },
  { label: 'TFL', value: (p) => p.tfl != null ? p.tfl.toFixed(1) : '-' },
  { label: 'Sacks', value: (p) => p.sacks != null ? p.sacks.toFixed(1) : '-' },
  { label: 'INT', value: (p) => formatNum(p.def_int) },
  { label: 'PD', value: (p) => formatNum(p.pass_def) },
]

const KICKING_STATS: StatDef[] = [
  { label: 'FG', value: (p) => `${p.fg_made ?? 0}/${p.fg_att ?? 0}` },
  { label: 'XP', value: (p) => `${p.xp_made ?? 0}/${p.xp_att ?? 0}` },
  { label: 'Punt Yds', value: (p) => formatNum(p.punt_yds) },
]

function formatNum(v: number | null): string {
  if (v == null) return '-'
  return String(v)
}

// ---------------------------------------------------------------------------
// Determine which stat sections to show
// ---------------------------------------------------------------------------

interface StatSection {
  title: string
  stats: StatDef[]
}

function getStatSections(player: PlayerProfile): StatSection[] {
  const posGroup = getPositionGroup(player.position)
  const sections: StatSection[] = []

  // Always show the primary position group section
  // Then also show any section where the player has non-null data

  const hasPassing = player.pass_att != null && player.pass_att > 0
  const hasRushing = player.rush_car != null && player.rush_car > 0
  const hasReceiving = player.rec != null && player.rec > 0
  const hasDefense = (player.tackles != null && player.tackles > 0) ||
    (player.sacks != null && player.sacks > 0) ||
    (player.tfl != null && player.tfl > 0)
  const hasKicking = (player.fg_att != null && player.fg_att > 0) ||
    (player.xp_att != null && player.xp_att > 0) ||
    (player.punt_yds != null && player.punt_yds > 0)

  // Primary section first based on position
  if (posGroup === 'passing' || hasPassing) {
    sections.push({ title: 'Passing', stats: PASSING_STATS })
  }
  if (posGroup === 'rushing' || (hasRushing && posGroup !== 'passing')) {
    sections.push({ title: 'Rushing', stats: RUSHING_STATS })
  }
  if (posGroup === 'receiving' || (hasReceiving && posGroup !== 'passing')) {
    sections.push({ title: 'Receiving', stats: RECEIVING_STATS })
  }
  if (posGroup === 'defense' || hasDefense) {
    sections.push({ title: 'Defense', stats: DEFENSE_STATS })
  }
  if (posGroup === 'kicking' || hasKicking) {
    sections.push({ title: 'Kicking', stats: KICKING_STATS })
  }

  // Add rushing for QBs who also rush
  if (posGroup === 'passing' && hasRushing && !sections.some(s => s.title === 'Rushing')) {
    sections.push({ title: 'Rushing', stats: RUSHING_STATS })
  }

  // If nothing matched, show a generic set based on whatever data exists
  if (sections.length === 0) {
    if (hasPassing) sections.push({ title: 'Passing', stats: PASSING_STATS })
    if (hasRushing) sections.push({ title: 'Rushing', stats: RUSHING_STATS })
    if (hasReceiving) sections.push({ title: 'Receiving', stats: RECEIVING_STATS })
    if (hasDefense) sections.push({ title: 'Defense', stats: DEFENSE_STATS })
    if (hasKicking) sections.push({ title: 'Kicking', stats: KICKING_STATS })
  }

  return sections
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PlayerStatsTableProps {
  player: PlayerProfile
}

export function PlayerStatsTable({ player }: PlayerStatsTableProps) {
  const sections = getStatSections(player)

  if (sections.length === 0) {
    return (
      <div className="card p-6">
        <h2 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-3">
          Season Stats
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          No statistical data available for this season.
        </p>
      </div>
    )
  }

  return (
    <div className="card p-6">
      <h2 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-4">
        {player.season} Season Stats
      </h2>

      <div className="space-y-5">
        {sections.map((section) => (
          <div key={section.title}>
            <h3 className="text-xs font-medium text-[var(--text-secondary)] mb-2">
              {section.title}
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {section.stats.map((stat) => (
                    <th
                      key={stat.label}
                      className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] text-right py-1 px-2 first:text-left"
                    >
                      {stat.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {section.stats.map((stat) => (
                    <td
                      key={stat.label}
                      className="tabular-nums text-[var(--text-primary)] text-right py-1 px-2 first:text-left"
                    >
                      {stat.value(player)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
