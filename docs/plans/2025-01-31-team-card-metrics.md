# Team Card Metrics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display real EPA, W-L record, and rank on team cards instead of "--" placeholders.

**Architecture:** Fetch team metrics (from `team_epa_season`) alongside teams in the home page query, pass metrics map to TeamList, which passes individual metrics to each TeamCard.

**Tech Stack:** Next.js, Supabase, TypeScript

---

## Task 1: Update Home Page Query to Include Metrics

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Update the Supabase query to fetch metrics**

```typescript
export default async function Home() {
  const supabase = await createClient()

  // Fetch FBS/FCS teams
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('*')
    .in('classification', ['fbs', 'fcs'])
    .order('school')

  // Fetch 2024 metrics for all teams
  const { data: metrics, error: metricsError } = await supabase
    .from('team_epa_season')
    .select('team, epa_per_play, off_epa_rank')
    .eq('season', 2024)

  // Fetch win/loss records
  const { data: records, error: recordsError } = await supabase
    .from('team_season_trajectory')
    .select('team, wins, games')
    .eq('season', 2024)

  if (teamsError) console.error('Error fetching teams:', teamsError)
  if (metricsError) console.error('Error fetching metrics:', metricsError)
  if (recordsError) console.error('Error fetching records:', recordsError)

  // Build metrics lookup map
  const metricsMap = new Map<string, { epa: number; rank: number; wins: number; losses: number }>()

  metrics?.forEach(m => {
    metricsMap.set(m.team, {
      epa: m.epa_per_play,
      rank: m.off_epa_rank,
      wins: 0,
      losses: 0
    })
  })

  records?.forEach(r => {
    const existing = metricsMap.get(r.team)
    if (existing) {
      existing.wins = r.wins ?? 0
      existing.losses = (r.games ?? 0) - (r.wins ?? 0)
    } else {
      metricsMap.set(r.team, {
        epa: 0,
        rank: 0,
        wins: r.wins ?? 0,
        losses: (r.games ?? 0) - (r.wins ?? 0)
      })
    }
  })

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          Teams
        </h1>
      </header>

      <TeamList
        teams={(teams as Team[]) || []}
        metricsMap={Object.fromEntries(metricsMap)}
      />
    </div>
  )
}
```

**Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds (TypeScript error expected for TeamList props - fixed in next task)

---

## Task 2: Update TeamList to Accept and Pass Metrics

**Files:**
- Modify: `src/components/TeamList.tsx`

**Step 1: Update interface and pass metrics to TeamCard**

Add `metricsMap` prop:

```typescript
export interface TeamMetrics {
  epa: number
  rank: number
  wins: number
  losses: number
}

interface TeamListProps {
  teams: Team[]
  metricsMap: Record<string, TeamMetrics>
}

export function TeamList({ teams, metricsMap }: TeamListProps) {
  // ... existing state and filtering logic ...

  return (
    <div>
      {/* ... existing filters ... */}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredTeams.map((team) => (
          <TeamCard
            key={team.id}
            team={team}
            metrics={metricsMap[team.school]}
          />
        ))}
      </div>

      {/* ... existing empty state ... */}
    </div>
  )
}
```

**Step 2: Verify build passes**

Run: `npm run build`
Expected: TypeScript error for TeamCard props (fixed in next task)

---

## Task 3: Update TeamCard to Display Metrics

**Files:**
- Modify: `src/components/TeamCard.tsx`

**Step 1: Update interface and display real values**

```typescript
import Link from 'next/link'
import { Team } from '@/lib/types/database'
import { TeamMetrics } from './TeamList'

interface TeamCardProps {
  team: Team
  metrics?: TeamMetrics
}

// ... TeamInitials unchanged ...

export function TeamCard({ team, metrics }: TeamCardProps) {
  const slug = team.school.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  return (
    <Link
      href={`/teams/${slug}`}
      className="card block p-6 hover:border-[var(--color-run)]"
    >
      {/* Logo Area - unchanged */}
      <div className="flex justify-center mb-4">
        {team.logo ? (
          <img
            src={team.logo}
            alt={`${team.school} logo`}
            className="w-[120px] h-[120px] object-contain"
          />
        ) : (
          <TeamInitials school={team.school} />
        )}
      </div>

      {/* Team Name - unchanged */}
      <div className="text-center mb-4">
        <h2 className="font-headline text-xl text-[var(--text-primary)] underline-sketch inline-block">
          {team.school}
        </h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {team.conference || 'Independent'}
        </p>
      </div>

      {/* Stats Preview - with real data */}
      <div className="flex justify-between text-sm border-t border-[var(--border)] pt-4">
        <div className="text-center">
          <p className="text-[var(--text-muted)]">EPA</p>
          <p className="text-[var(--text-primary)] font-medium">
            {metrics?.epa ? metrics.epa.toFixed(2) : '--'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[var(--text-muted)]">W-L</p>
          <p className="text-[var(--text-primary)] font-medium">
            {metrics ? `${metrics.wins}-${metrics.losses}` : '--'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[var(--text-muted)]">Rank</p>
          <p className="text-[var(--text-primary)] font-medium">
            {metrics?.rank ? `#${metrics.rank}` : '--'}
          </p>
        </div>
      </div>
    </Link>
  )
}
```

**Step 2: Verify build passes**

Run: `npm run build`
Expected: PASS

**Step 3: Test locally**

Run: `npm run dev`
Expected: Team cards show real EPA, W-L, and Rank values

**Step 4: Commit**

```bash
git add src/app/page.tsx src/components/TeamList.tsx src/components/TeamCard.tsx
git commit -m "feat: display real metrics on team cards

- Fetch team_epa_season and team_season_trajectory data
- Pass metrics map through TeamList to TeamCard
- Display EPA, W-L record, and offensive EPA rank"
```

---

## Task 4: Style Division Dropdown to Match Theme

**Files:**
- Modify: `src/components/TeamList.tsx`

**Step 1: Add custom dropdown styling**

Replace the native select with styled version:

```typescript
{/* Division Dropdown */}
<div className="mb-4">
  <select
    value={division}
    onChange={(e) => handleDivisionChange(e.target.value as Division)}
    className="px-3 py-2 text-sm border-[1.5px] border-[var(--border)] rounded-sm
      bg-[var(--bg-surface)] text-[var(--text-primary)]
      cursor-pointer hover:border-[var(--text-muted)] transition-colors
      appearance-none bg-no-repeat bg-right pr-8"
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236B635A' d='M3 4.5L6 8l3-3.5H3z'/%3E%3C/svg%3E")`,
      backgroundPosition: 'right 0.75rem center'
    }}
  >
    <option value="fbs">FBS</option>
    <option value="fcs">FCS</option>
    <option value="all">All Divisions</option>
  </select>
</div>
```

**Step 2: Add global CSS for select options (limited browser support)**

In `globals.css`, add:

```css
/* Select dropdown styling */
select option {
  background: var(--bg-surface);
  color: var(--text-primary);
  padding: 8px;
}
```

Note: Native select option styling has limited browser support. For full control, a custom dropdown component would be needed (future enhancement).

**Step 3: Verify changes**

Run: `npm run dev`
Expected: Dropdown has custom caret icon, better text color

**Step 4: Commit**

```bash
git add src/components/TeamList.tsx src/app/globals.css
git commit -m "style: improve division dropdown to match theme

- Custom caret icon
- Consistent text color
- Hover state on border"
```

**Step 5: Push**

```bash
git push
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Fetch metrics in page query | `page.tsx` |
| 2 | Pass metrics through TeamList | `TeamList.tsx` |
| 3 | Display metrics in TeamCard | `TeamCard.tsx` |
| 4 | Style dropdown to match theme | `TeamList.tsx`, `globals.css` |

**Total estimated steps:** 15
