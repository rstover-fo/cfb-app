'use client'

import { useState, useMemo } from 'react'
import { RosterPlayer, PlayerSeasonStat } from '@/lib/types/database'

interface RosterViewProps {
  roster: RosterPlayer[] | null
  stats: PlayerSeasonStat[] | null
}

type PositionGroup = 'all' | 'offense' | 'defense' | 'special'

const OFFENSE_POSITIONS = ['QB', 'RB', 'FB', 'WR', 'TE', 'OL', 'OT', 'OG', 'C']
const DEFENSE_POSITIONS = ['DL', 'DT', 'DE', 'EDGE', 'LB', 'ILB', 'OLB', 'MLB', 'DB', 'CB', 'S', 'FS', 'SS']
const SPECIAL_POSITIONS = ['K', 'P', 'LS', 'PR', 'KR']

function getPositionGroup(position: string): PositionGroup {
  const pos = position.toUpperCase()
  if (OFFENSE_POSITIONS.includes(pos)) return 'offense'
  if (DEFENSE_POSITIONS.includes(pos)) return 'defense'
  if (SPECIAL_POSITIONS.includes(pos)) return 'special'
  return 'offense' // Default
}

function formatHeight(inches: number | null): string {
  if (!inches) return '--'
  const feet = Math.floor(inches / 12)
  const remaining = inches % 12
  return `${feet}'${remaining}"`
}

function PlayerRow({ player, stats }: { player: RosterPlayer; stats: PlayerSeasonStat | null }) {
  const group = getPositionGroup(player.position)

  return (
    <tr className="border-b border-[var(--border)] hover:bg-[var(--bg-surface-alt)] transition-colors">
      <td className="py-3 px-2 text-center text-[var(--text-muted)]">
        {player.jersey ?? '--'}
      </td>
      <td className="py-3 px-2">
        <div>
          <span className="text-[var(--text-primary)] font-medium">
            {player.first_name} {player.last_name}
          </span>
          {player.home_state && (
            <span className="text-xs text-[var(--text-muted)] ml-2">
              {player.home_city}, {player.home_state}
            </span>
          )}
        </div>
      </td>
      <td className="py-3 px-2 text-center">
        <span className="px-2 py-0.5 text-xs rounded bg-[var(--bg-surface-alt)] text-[var(--text-secondary)]">
          {player.position}
        </span>
      </td>
      <td className="py-3 px-2 text-center text-[var(--text-secondary)]">
        {formatHeight(player.height)}
      </td>
      <td className="py-3 px-2 text-center text-[var(--text-secondary)]">
        {player.weight ?? '--'}
      </td>
      {/* Stats columns based on position group */}
      {group === 'offense' && (
        <>
          <td className="py-3 px-2 text-center text-[var(--text-primary)]">
            {stats?.pass_yds ?? stats?.rush_yds ?? stats?.rec_yds ?? '--'}
          </td>
          <td className="py-3 px-2 text-center text-[var(--text-primary)]">
            {stats?.pass_td ?? stats?.rush_td ?? stats?.rec_td ?? '--'}
          </td>
        </>
      )}
      {group === 'defense' && (
        <>
          <td className="py-3 px-2 text-center text-[var(--text-primary)]">
            {stats?.tackles ?? '--'}
          </td>
          <td className="py-3 px-2 text-center text-[var(--text-primary)]">
            {stats?.sacks ?? stats?.int ?? '--'}
          </td>
        </>
      )}
      {group === 'special' && (
        <>
          <td className="py-3 px-2 text-center text-[var(--text-primary)]">
            {stats?.fg_made !== undefined ? `${stats.fg_made}/${stats.fg_att}` : '--'}
          </td>
          <td className="py-3 px-2 text-center text-[var(--text-primary)]">
            {stats?.points ?? '--'}
          </td>
        </>
      )}
    </tr>
  )
}

export function RosterView({ roster, stats }: RosterViewProps) {
  const [filter, setFilter] = useState<PositionGroup>('all')
  const [search, setSearch] = useState('')

  const statsMap = useMemo(() => {
    const map = new Map<string, PlayerSeasonStat>()
    stats?.forEach(s => map.set(s.player_id, s))
    return map
  }, [stats])

  const filteredRoster = useMemo(() => {
    if (!roster) return []

    return roster
      .filter(p => {
        if (filter !== 'all' && getPositionGroup(p.position) !== filter) return false
        if (search) {
          const name = `${p.first_name} ${p.last_name}`.toLowerCase()
          if (!name.includes(search.toLowerCase())) return false
        }
        return true
      })
      .sort((a, b) => {
        // Sort by position group, then position, then name
        const groupA = getPositionGroup(a.position)
        const groupB = getPositionGroup(b.position)
        if (groupA !== groupB) return groupA.localeCompare(groupB)
        if (a.position !== b.position) return a.position.localeCompare(b.position)
        return a.last_name.localeCompare(b.last_name)
      })
  }, [roster, filter, search])

  if (!roster || roster.length === 0) {
    return (
      <p className="text-[var(--text-muted)] text-center py-8">
        Roster data not available for this team.
      </p>
    )
  }

  const currentGroup = filter === 'all' ? getPositionGroup(filteredRoster[0]?.position || 'QB') : filter

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex gap-2">
          {(['all', 'offense', 'defense', 'special'] as PositionGroup[]).map(group => (
            <button
              key={group}
              onClick={() => setFilter(group)}
              className={`px-3 py-1.5 text-sm border-[1.5px] rounded-sm transition-all ${
                filter === group
                  ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
              }`}
            >
              {group === 'all' ? 'All' : group.charAt(0).toUpperCase() + group.slice(1)}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search players..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm border-[1.5px] border-[var(--border)] rounded-sm
            bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
            focus:border-[var(--color-run)] focus:outline-none transition-colors"
        />
      </div>

      {/* Count */}
      <p className="text-sm text-[var(--text-muted)] mb-4">
        {filteredRoster.length} player{filteredRoster.length !== 1 ? 's' : ''}
      </p>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--bg-surface-alt)] border-b border-[var(--border)]">
                <th className="py-3 px-2 text-center text-[var(--text-muted)] font-normal w-12">#</th>
                <th className="py-3 px-2 text-left text-[var(--text-muted)] font-normal">Name</th>
                <th className="py-3 px-2 text-center text-[var(--text-muted)] font-normal w-16">Pos</th>
                <th className="py-3 px-2 text-center text-[var(--text-muted)] font-normal w-16">Ht</th>
                <th className="py-3 px-2 text-center text-[var(--text-muted)] font-normal w-16">Wt</th>
                {currentGroup === 'offense' && (
                  <>
                    <th className="py-3 px-2 text-center text-[var(--text-muted)] font-normal w-16">Yds</th>
                    <th className="py-3 px-2 text-center text-[var(--text-muted)] font-normal w-12">TD</th>
                  </>
                )}
                {currentGroup === 'defense' && (
                  <>
                    <th className="py-3 px-2 text-center text-[var(--text-muted)] font-normal w-16">Tkl</th>
                    <th className="py-3 px-2 text-center text-[var(--text-muted)] font-normal w-16">Sack/INT</th>
                  </>
                )}
                {currentGroup === 'special' && (
                  <>
                    <th className="py-3 px-2 text-center text-[var(--text-muted)] font-normal w-16">FG</th>
                    <th className="py-3 px-2 text-center text-[var(--text-muted)] font-normal w-12">Pts</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredRoster.map(player => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  stats={statsMap.get(player.id) || null}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
