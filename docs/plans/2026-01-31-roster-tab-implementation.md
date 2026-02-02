# Roster Tab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Roster tab to the Team 360 page showing players grouped by position with key stats.

**Architecture:** Fetch roster data from `core.roster` and player stats from `stats.player_season_stats`. Create an RPC to pivot player stats into a single row per player. Display in a filterable, sortable table grouped by position group (Offense, Defense, Special Teams).

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase RPC, existing CSS custom properties

---

## Task 1: Add TypeScript Types for Roster Data

**Files:**
- Modify: `src/lib/types/database.ts`

**Step 1: Add interfaces for roster and player stats**

Add to the end of `src/lib/types/database.ts`:

```typescript
export interface RosterPlayer {
  id: string
  first_name: string
  last_name: string
  jersey: number | null
  position: string
  height: number | null
  weight: number | null
  home_city: string | null
  home_state: string | null
  year: number
}

export interface PlayerSeasonStat {
  player_id: string
  player: string
  position: string
  // Passing
  pass_att?: number
  pass_comp?: number
  pass_yds?: number
  pass_td?: number
  pass_int?: number
  // Rushing
  rush_car?: number
  rush_yds?: number
  rush_td?: number
  rush_ypc?: number
  // Receiving
  rec?: number
  rec_yds?: number
  rec_td?: number
  rec_ypr?: number
  // Defense
  tackles?: number
  solo?: number
  tfl?: number
  sacks?: number
  int?: number
  pd?: number
  // Kicking
  fg_made?: number
  fg_att?: number
  xp_made?: number
  xp_att?: number
  points?: number
}

export interface RosterPlayerWithStats extends RosterPlayer {
  stats: PlayerSeasonStat | null
}
```

**Step 2: Verify with build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/lib/types/database.ts
git commit -m "feat: add types for roster and player stats"
```

---

## Task 2: Create Player Stats RPC

**Files:**
- Supabase SQL (via MCP tool)

**Step 1: Create the RPC to pivot player stats**

Use `mcp__supabase__apply_migration` with name `create_get_player_stats_rpc`:

```sql
CREATE OR REPLACE FUNCTION get_player_season_stats_pivoted(
  p_team TEXT,
  p_season INT
)
RETURNS TABLE (
  player_id TEXT,
  player TEXT,
  position TEXT,
  -- Passing
  pass_att INT,
  pass_comp INT,
  pass_yds INT,
  pass_td INT,
  pass_int INT,
  -- Rushing
  rush_car INT,
  rush_yds INT,
  rush_td INT,
  -- Receiving
  rec INT,
  rec_yds INT,
  rec_td INT,
  -- Defense
  tackles INT,
  solo INT,
  tfl NUMERIC,
  sacks NUMERIC,
  interceptions INT,
  pd INT,
  -- Kicking
  fg_made INT,
  fg_att INT,
  xp_made INT,
  xp_att INT,
  points INT
) AS $$
BEGIN
  RETURN QUERY
  WITH pivoted AS (
    SELECT
      s.player_id,
      s.player,
      s.position,
      MAX(CASE WHEN s.category = 'passing' AND s.stat_type = 'ATT' THEN s.stat::INT END) AS pass_att,
      MAX(CASE WHEN s.category = 'passing' AND s.stat_type = 'COMPLETIONS' THEN s.stat::INT END) AS pass_comp,
      MAX(CASE WHEN s.category = 'passing' AND s.stat_type = 'YDS' THEN s.stat::INT END) AS pass_yds,
      MAX(CASE WHEN s.category = 'passing' AND s.stat_type = 'TD' THEN s.stat::INT END) AS pass_td,
      MAX(CASE WHEN s.category = 'passing' AND s.stat_type = 'INT' THEN s.stat::INT END) AS pass_int,
      MAX(CASE WHEN s.category = 'rushing' AND s.stat_type = 'CAR' THEN s.stat::INT END) AS rush_car,
      MAX(CASE WHEN s.category = 'rushing' AND s.stat_type = 'YDS' THEN s.stat::INT END) AS rush_yds,
      MAX(CASE WHEN s.category = 'rushing' AND s.stat_type = 'TD' THEN s.stat::INT END) AS rush_td,
      MAX(CASE WHEN s.category = 'receiving' AND s.stat_type = 'REC' THEN s.stat::INT END) AS rec,
      MAX(CASE WHEN s.category = 'receiving' AND s.stat_type = 'YDS' THEN s.stat::INT END) AS rec_yds,
      MAX(CASE WHEN s.category = 'receiving' AND s.stat_type = 'TD' THEN s.stat::INT END) AS rec_td,
      MAX(CASE WHEN s.category = 'defensive' AND s.stat_type = 'TOT' THEN s.stat::INT END) AS tackles,
      MAX(CASE WHEN s.category = 'defensive' AND s.stat_type = 'SOLO' THEN s.stat::INT END) AS solo,
      MAX(CASE WHEN s.category = 'defensive' AND s.stat_type = 'TFL' THEN s.stat::NUMERIC END) AS tfl,
      MAX(CASE WHEN s.category = 'defensive' AND s.stat_type = 'SACKS' THEN s.stat::NUMERIC END) AS sacks,
      MAX(CASE WHEN s.category = 'interceptions' AND s.stat_type = 'INT' THEN s.stat::INT END) AS interceptions,
      MAX(CASE WHEN s.category = 'defensive' AND s.stat_type = 'PD' THEN s.stat::INT END) AS pd,
      MAX(CASE WHEN s.category = 'kicking' AND s.stat_type = 'FGM' THEN s.stat::INT END) AS fg_made,
      MAX(CASE WHEN s.category = 'kicking' AND s.stat_type = 'FGA' THEN s.stat::INT END) AS fg_att,
      MAX(CASE WHEN s.category = 'kicking' AND s.stat_type = 'XPM' THEN s.stat::INT END) AS xp_made,
      MAX(CASE WHEN s.category = 'kicking' AND s.stat_type = 'XPA' THEN s.stat::INT END) AS xp_att,
      MAX(CASE WHEN s.category = 'kicking' AND s.stat_type = 'PTS' THEN s.stat::INT END) AS points
    FROM stats.player_season_stats s
    WHERE s.team = p_team AND s.season = p_season
    GROUP BY s.player_id, s.player, s.position
  )
  SELECT * FROM pivoted;
END;
$$ LANGUAGE plpgsql;
```

**Step 2: Verify RPC works**

Run in SQL editor:
```sql
SELECT * FROM get_player_season_stats_pivoted('Alabama', 2024) LIMIT 5;
```

Expected: Returns player rows with pivoted stats

---

## Task 3: Create RosterView Component

**Files:**
- Create: `src/components/team/RosterView.tsx`

**Step 1: Create the component**

Create `src/components/team/RosterView.tsx`:

```tsx
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
            {stats?.sacks ?? stats?.interceptions ?? '--'}
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
```

**Step 2: Verify with build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/team/RosterView.tsx
git commit -m "feat: add RosterView component with position filtering"
```

---

## Task 4: Update Team Page to Fetch Roster Data

**Files:**
- Modify: `src/app/teams/[slug]/page.tsx`

**Step 1: Add imports**

Add to imports:

```typescript
import { RosterPlayer, PlayerSeasonStat } from '@/lib/types/database'
```

**Step 2: Add roster data fetching**

After the existing data fetches, add:

```typescript
  // Fetch roster
  const rosterResult = await supabase
    .from('roster')
    .select('id, first_name, last_name, jersey, position, height, weight, home_city, home_state, year')
    .eq('team', team.school)
    .eq('year', currentSeason)
    .order('last_name')

  const roster = rosterResult.error ? null : (rosterResult.data as RosterPlayer[] | null)

  // Fetch player stats (pivoted)
  const playerStatsResult = await supabase.rpc('get_player_season_stats_pivoted', {
    p_team: team.school,
    p_season: currentSeason
  })
  const playerStats = playerStatsResult.error ? null : (playerStatsResult.data as PlayerSeasonStat[] | null)
```

**Step 3: Pass to TeamPageClient**

Update the return to include:

```typescript
      roster={roster}
      playerStats={playerStats}
```

**Step 4: Verify with build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build fails (TeamPageClient doesn't accept these props yet)

---

## Task 5: Update TeamPageClient Props and Enable Roster Tab

**Files:**
- Modify: `src/components/team/TeamPageClient.tsx`

**Step 1: Add imports**

Add to imports:

```typescript
import { RosterPlayer, PlayerSeasonStat } from '@/lib/types/database'
import { RosterView } from './RosterView'
```

**Step 2: Update props interface**

Add to `TeamPageClientProps`:

```typescript
  roster: RosterPlayer[] | null
  playerStats: PlayerSeasonStat[] | null
```

**Step 3: Destructure new props**

Add to destructuring:

```typescript
  roster,
  playerStats
```

**Step 4: Enable roster tab**

Update the TABS array:

```typescript
const TABS: Tab[] = [
  { id: 'overview', label: 'Overview', enabled: true },
  { id: 'situational', label: 'Situational', enabled: true },
  { id: 'schedule', label: 'Schedule', enabled: false },
  { id: 'roster', label: 'Roster', enabled: true },
  { id: 'compare', label: 'Compare', enabled: false },
]
```

**Step 5: Add roster tab content**

After the situational tab content, add:

```typescript
        {activeTab === 'roster' && (
          <RosterView roster={roster} playerStats={playerStats} />
        )}
```

**Step 6: Verify with build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 7: Commit**

```bash
git add src/app/teams/[slug]/page.tsx src/components/team/TeamPageClient.tsx
git commit -m "feat: wire up roster tab with data fetching"
```

---

## Task 6: Final Build, Lint, and Push

**Files:** None (verification only)

**Step 1: Run linter**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run lint`

Expected: No errors

**Step 2: Run build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 3: Test locally**

Run: `npm run dev`

Visit: `http://localhost:3000/teams/alabama`
Click the Roster tab and verify:
- Player list displays with jersey, name, position, height, weight
- Position group filters work (All, Offense, Defense, Special)
- Search filters by player name
- Stats columns show appropriate data for position group

**Step 4: Push to deploy**

```bash
git push
```

---

## Summary

This implementation adds a Roster tab with:

1. **Player listing** - Full roster with jersey number, name, position, height, weight, hometown
2. **Position group filtering** - Filter by All, Offense, Defense, or Special Teams
3. **Player search** - Filter by name
4. **Stats integration** - Shows key stats based on position (yards/TDs for offense, tackles/sacks for defense, FG/points for kickers)
5. **Responsive table** - Scrollable on mobile, full width on desktop

**Data sources:**
- `core.roster` - Player bio data (name, jersey, position, height, weight, hometown)
- `stats.player_season_stats` - Season stats (pivoted via RPC)
