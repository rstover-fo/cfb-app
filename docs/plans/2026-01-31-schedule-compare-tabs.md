# Schedule & Compare Tabs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Schedule and Compare tabs to the Team 360 page - Schedule shows the team's game results, Compare enables side-by-side team analysis.

**Architecture:** Schedule fetches from `core.games` via a public view, displays as a weekly game list with scores and outcomes. Compare uses existing `team_epa_season` and `team_style_profile` data to show two teams side-by-side with bar charts for key metrics.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase, existing CSS custom properties

---

## Task 1: Add TypeScript Types for Schedule Data

**Files:**
- Modify: `src/lib/types/database.ts`

**Step 1: Add Game interface**

Add to the end of `src/lib/types/database.ts`:

```typescript
export interface Game {
  id: number
  season: number
  week: number
  start_date: string
  home_team: string
  home_points: number | null
  away_team: string
  away_points: number | null
  completed: boolean
  conference_game: boolean
  neutral_site: boolean
}

export interface ScheduleGame extends Game {
  opponent: string
  opponent_logo: string | null
  is_home: boolean
  team_score: number | null
  opponent_score: number | null
  result: 'W' | 'L' | null
}
```

**Step 2: Verify with build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/lib/types/database.ts
git commit -m "feat: add types for schedule and game data"
```

---

## Task 2: Create Games View in Supabase

**Files:**
- Supabase SQL (via MCP tool)

**Step 1: Create public view for core.games**

Use `mcp__supabase__apply_migration` with name `expose_games_view`:

```sql
CREATE OR REPLACE VIEW public.games AS
SELECT
  id,
  season,
  week,
  start_date,
  home_team,
  home_points,
  away_team,
  away_points,
  completed,
  conference_game,
  neutral_site
FROM core.games;
```

**Step 2: Verify view works**

Run in SQL editor:
```sql
SELECT * FROM public.games WHERE home_team = 'Alabama' AND season = 2024 LIMIT 3;
```

Expected: Returns game rows

---

## Task 3: Create ScheduleView Component

**Files:**
- Create: `src/components/team/ScheduleView.tsx`

**Step 1: Create the component**

Create `src/components/team/ScheduleView.tsx`:

```tsx
'use client'

import { ScheduleGame } from '@/lib/types/database'

interface ScheduleViewProps {
  schedule: ScheduleGame[] | null
  teamColor: string | null
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function GameRow({ game, teamColor }: { game: ScheduleGame; teamColor: string | null }) {
  const resultColor = game.result === 'W'
    ? 'var(--color-positive)'
    : game.result === 'L'
    ? 'var(--color-negative)'
    : 'var(--text-muted)'

  return (
    <div className="flex items-center gap-4 py-4 border-b border-[var(--border)] last:border-b-0">
      {/* Week */}
      <div className="w-12 text-center">
        <span className="text-sm text-[var(--text-muted)]">Wk {game.week}</span>
      </div>

      {/* Date */}
      <div className="w-16 text-sm text-[var(--text-secondary)]">
        {formatDate(game.start_date)}
      </div>

      {/* Opponent */}
      <div className="flex-1 flex items-center gap-3">
        {game.opponent_logo ? (
          <img
            src={game.opponent_logo}
            alt={game.opponent}
            className="w-8 h-8 object-contain"
          />
        ) : (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs text-white font-medium"
            style={{ backgroundColor: teamColor || 'var(--text-muted)' }}
          >
            {game.opponent.slice(0, 2)}
          </div>
        )}
        <div>
          <span className="text-sm text-[var(--text-muted)] mr-1">
            {game.is_home ? 'vs' : '@'}
          </span>
          <span className="text-[var(--text-primary)] font-medium">
            {game.opponent}
          </span>
          {game.conference_game && (
            <span className="ml-2 text-xs text-[var(--text-muted)]">*</span>
          )}
        </div>
      </div>

      {/* Score */}
      <div className="w-24 text-right">
        {game.completed ? (
          <div className="flex items-center justify-end gap-2">
            <span
              className="font-medium text-lg"
              style={{ color: resultColor }}
            >
              {game.result}
            </span>
            <span className="text-[var(--text-secondary)]">
              {game.team_score}-{game.opponent_score}
            </span>
          </div>
        ) : (
          <span className="text-sm text-[var(--text-muted)]">TBD</span>
        )}
      </div>
    </div>
  )
}

export function ScheduleView({ schedule, teamColor }: ScheduleViewProps) {
  if (!schedule || schedule.length === 0) {
    return (
      <p className="text-[var(--text-muted)] text-center py-8">
        Schedule data not available for this team.
      </p>
    )
  }

  const wins = schedule.filter(g => g.result === 'W').length
  const losses = schedule.filter(g => g.result === 'L').length
  const confWins = schedule.filter(g => g.conference_game && g.result === 'W').length
  const confLosses = schedule.filter(g => g.conference_game && g.result === 'L').length

  return (
    <div>
      {/* Record Summary */}
      <div className="flex gap-6 mb-6">
        <div>
          <span className="text-2xl font-headline text-[var(--text-primary)]">
            {wins}-{losses}
          </span>
          <span className="text-sm text-[var(--text-muted)] ml-2">Overall</span>
        </div>
        <div>
          <span className="text-2xl font-headline text-[var(--text-primary)]">
            {confWins}-{confLosses}
          </span>
          <span className="text-sm text-[var(--text-muted)] ml-2">Conference</span>
        </div>
      </div>

      {/* Games List */}
      <div className="card p-4">
        {schedule.map(game => (
          <GameRow key={game.id} game={game} teamColor={teamColor} />
        ))}
      </div>

      <p className="text-xs text-[var(--text-muted)] mt-4">
        * Conference game
      </p>
    </div>
  )
}
```

**Step 2: Verify with build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/team/ScheduleView.tsx
git commit -m "feat: add ScheduleView component"
```

---

## Task 4: Wire Up Schedule Tab

**Files:**
- Modify: `src/app/teams/[slug]/page.tsx`
- Modify: `src/components/team/TeamPageClient.tsx`

**Step 1: Add import and fetch schedule in page.tsx**

Add to imports in `src/app/teams/[slug]/page.tsx`:

```typescript
import { ..., Game, ScheduleGame } from '@/lib/types/database'
```

After the playerStats fetch, add:

```typescript
  // Fetch schedule
  const scheduleResult = await supabase
    .from('games')
    .select('*')
    .or(`home_team.eq.${team.school},away_team.eq.${team.school}`)
    .eq('season', currentSeason)
    .order('week')

  // Transform to ScheduleGame format
  let schedule: ScheduleGame[] | null = null
  if (!scheduleResult.error && scheduleResult.data) {
    const { data: allTeams } = await supabase.from('teams').select('school, logo')
    const teamLogos = new Map(allTeams?.map(t => [t.school, t.logo]) || [])

    schedule = (scheduleResult.data as Game[]).map(game => {
      const isHome = game.home_team === team.school
      const opponent = isHome ? game.away_team : game.home_team
      const teamScore = isHome ? game.home_points : game.away_points
      const opponentScore = isHome ? game.away_points : game.home_points
      let result: 'W' | 'L' | null = null
      if (game.completed && teamScore !== null && opponentScore !== null) {
        result = teamScore > opponentScore ? 'W' : 'L'
      }
      return {
        ...game,
        opponent,
        opponent_logo: teamLogos.get(opponent) || null,
        is_home: isHome,
        team_score: teamScore,
        opponent_score: opponentScore,
        result
      }
    })
  }
```

**Step 2: Pass schedule to TeamPageClient**

Add to the return:

```typescript
      schedule={schedule}
```

**Step 3: Update TeamPageClient imports and props**

Add to imports in `src/components/team/TeamPageClient.tsx`:

```typescript
import { ..., ScheduleGame } from '@/lib/types/database'
import { ScheduleView } from './ScheduleView'
```

Add to `TeamPageClientProps`:

```typescript
  schedule: ScheduleGame[] | null
```

Add to destructuring:

```typescript
  schedule,
```

**Step 4: Enable schedule tab**

Update TABS array:

```typescript
  { id: 'schedule', label: 'Schedule', enabled: true },
```

**Step 5: Add schedule tab content**

Replace the "coming soon" block:

```typescript
        {activeTab === 'schedule' && (
          <ScheduleView schedule={schedule} teamColor={team.color} />
        )}

        {activeTab === 'compare' && (
          <div className="text-center py-12">
            <p className="text-[var(--text-muted)]">Coming soon.</p>
          </div>
        )}
```

**Step 6: Verify with build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 7: Commit**

```bash
git add src/app/teams/[slug]/page.tsx src/components/team/TeamPageClient.tsx
git commit -m "feat: wire up schedule tab with data fetching"
```

---

## Task 5: Create CompareView Component

**Files:**
- Create: `src/components/team/CompareView.tsx`

**Step 1: Create the component**

Create `src/components/team/CompareView.tsx`:

```tsx
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

interface CompareMetric {
  label: string
  team1Value: number | null
  team2Value: number | null
  format: (v: number) => string
  higherIsBetter: boolean
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
      setCompareMetrics(null)
      setCompareStyle(null)
      return
    }

    const fetchCompareData = async () => {
      setLoading(true)
      const supabase = createClient()
      const compareTeamName = allTeams.find(t => t.id === compareTeamId)?.school

      if (!compareTeamName) return

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

      setCompareMetrics(metricsRes.data as TeamSeasonEpa | null)
      setCompareStyle(styleRes.data as TeamStyleProfile | null)
      setLoading(false)
    }

    fetchCompareData()
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
```

**Step 2: Verify with build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/team/CompareView.tsx
git commit -m "feat: add CompareView component with team selector"
```

---

## Task 6: Wire Up Compare Tab

**Files:**
- Modify: `src/app/teams/[slug]/page.tsx`
- Modify: `src/components/team/TeamPageClient.tsx`

**Step 1: Fetch all teams in page.tsx**

The allTeams is already fetched for schedule logos. Pass it to TeamPageClient.

Add to the return:

```typescript
      allTeams={(allTeams as Team[]) || []}
```

Note: Ensure `allTeams` variable exists from the schedule fetch. If not, add:

```typescript
  const { data: allTeams } = await supabase.from('teams').select('*')
```

**Step 2: Update TeamPageClient imports and props**

Add to imports:

```typescript
import { CompareView } from './CompareView'
```

Add to `TeamPageClientProps`:

```typescript
  allTeams: Team[]
```

Add to destructuring:

```typescript
  allTeams,
```

**Step 3: Enable compare tab**

Update TABS array:

```typescript
  { id: 'compare', label: 'Compare', enabled: true },
```

**Step 4: Add compare tab content**

Replace the compare "coming soon" block:

```typescript
        {activeTab === 'compare' && (
          <CompareView
            team={team}
            metrics={metrics}
            style={style}
            allTeams={allTeams}
            currentSeason={currentSeason}
          />
        )}
```

**Step 5: Verify with build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/app/teams/[slug]/page.tsx src/components/team/TeamPageClient.tsx
git commit -m "feat: wire up compare tab with team selector"
```

---

## Task 7: Final Build, Lint, and Push

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

Verify Schedule tab:
- Shows 2024 game list with dates, opponents, scores
- W/L indicators with green/red coloring
- Record summary at top (e.g., "9-4 Overall, 5-3 Conference")

Verify Compare tab:
- Team selector dropdown works
- Selecting a team fetches and displays comparison
- Bar charts show metrics side-by-side
- Team colors used for bars

**Step 4: Push to deploy**

```bash
git push
```

---

## Summary

This implementation adds:

1. **Schedule Tab**
   - Weekly game list with dates and opponents
   - W/L results with score display
   - Overall and conference record summary
   - Conference game indicators

2. **Compare Tab**
   - Team selector dropdown
   - Side-by-side metric comparison
   - Visual bar charts with team colors
   - EPA, success rate, explosiveness, rankings
   - Style profile metrics (run rate, rushing/passing EPA)

**Data sources:**
- `core.games` (via public view) - Game schedule and results
- `team_epa_season` - Performance metrics for comparison
- `team_style_profile` - Style metrics for comparison
- `teams` - Team logos and colors

**New components:**
- `ScheduleView.tsx` - Game list display
- `CompareView.tsx` - Team comparison with selector

**Database changes:**
- `public.games` view exposing `core.games`
