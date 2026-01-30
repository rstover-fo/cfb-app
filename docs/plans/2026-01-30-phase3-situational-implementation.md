# Phase 3: Situational Analytics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add tabbed navigation to team pages and implement Down & Distance heatmaps with offense/defense comparison.

**Architecture:** Refactor team page to use client-side tab state. Create reusable TeamTabs component for primary navigation, SituationalView container with sub-navigation, and DownDistanceHeatmap visualization. Data fetched server-side, passed to client components.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase RPC, existing CSS custom properties

**Reference:** See `docs/plans/2026-01-30-phase3-situational-design.md` for full design specifications.

---

## Task 1: Add TypeScript Types

**Files:**
- Modify: `src/lib/types/database.ts`

**Step 1: Add DownDistanceSplit interface**

Add to the end of `src/lib/types/database.ts`:

```ts
export interface DownDistanceSplit {
  down: 1 | 2 | 3 | 4
  distance_bucket: '1-3' | '4-6' | '7-10' | '11+'
  side: 'offense' | 'defense'
  play_count: number
  success_rate: number
  epa_per_play: number
  conversion_rate: number | null
  national_rank?: number
}

export interface KeySituation {
  label: string
  description: string
  value: number
  format: 'percent' | 'count'
  rank: number
  trend: number
}
```

**Step 2: Verify with build**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/lib/types/database.ts
git commit -m "feat: add DownDistanceSplit and KeySituation types"
```

---

## Task 2: Create TeamTabs Component

**Files:**
- Create: `src/components/team/TeamTabs.tsx`

**Step 1: Create the TeamTabs component**

Create `src/components/team/TeamTabs.tsx`:

```tsx
'use client'

import { useState, ReactNode } from 'react'

export type TabId = 'overview' | 'situational' | 'schedule' | 'roster' | 'compare'

interface Tab {
  id: TabId
  label: string
  enabled: boolean
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Overview', enabled: true },
  { id: 'situational', label: 'Situational', enabled: true },
  { id: 'schedule', label: 'Schedule', enabled: false },
  { id: 'roster', label: 'Roster', enabled: false },
  { id: 'compare', label: 'Compare', enabled: false },
]

interface TeamTabsProps {
  children: (activeTab: TabId) => ReactNode
}

export function TeamTabs({ children }: TeamTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  return (
    <div>
      {/* Tab Navigation */}
      <nav className="flex gap-2 mb-6" role="tablist" aria-label="Team page sections">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          const isDisabled = !tab.enabled

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              disabled={isDisabled}
              onClick={() => tab.enabled && setActiveTab(tab.id)}
              className={`px-4 py-2 border-[1.5px] rounded-sm text-sm transition-all ${
                isActive
                  ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                  : isDisabled
                  ? 'border-[var(--border)] text-[var(--text-muted)] opacity-50 cursor-not-allowed'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
              }`}
            >
              {tab.label}
              {isDisabled && <span className="ml-1 text-xs">(soon)</span>}
            </button>
          )
        })}
      </nav>

      {/* Tab Content */}
      <div
        id={`tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
      >
        {children(activeTab)}
      </div>
    </div>
  )
}
```

**Step 2: Verify with build**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/team/TeamTabs.tsx
git commit -m "feat: add TeamTabs component with primary navigation"
```

---

## Task 3: Create DownDistanceHeatmap Component

**Files:**
- Create: `src/components/visualizations/DownDistanceHeatmap.tsx`

**Step 1: Create the heatmap component**

Create `src/components/visualizations/DownDistanceHeatmap.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { DownDistanceSplit } from '@/lib/types/database'

interface DownDistanceHeatmapProps {
  data: DownDistanceSplit[]
  side: 'offense' | 'defense'
  title: string
}

const DOWNS = [1, 2, 3, 4] as const
const DISTANCE_BUCKETS = ['1-3', '4-6', '7-10', '11+'] as const
const DISTANCE_LABELS = ['1-3', '4-6', '7-10', '11+']

function getPerformanceColor(successRate: number, side: 'offense' | 'defense'): string {
  // For defense, lower opponent success rate is better
  const normalizedRate = side === 'defense' ? 1 - successRate : successRate

  if (normalizedRate >= 0.55) return 'var(--color-positive)'
  if (normalizedRate >= 0.45) return 'var(--bg-surface-alt)'
  if (normalizedRate >= 0.35) return 'var(--color-neutral)'
  return 'var(--color-negative)'
}

function getPerformanceLabel(successRate: number, side: 'offense' | 'defense'): string {
  const normalizedRate = side === 'defense' ? 1 - successRate : successRate

  if (normalizedRate >= 0.55) return 'Elite'
  if (normalizedRate >= 0.45) return 'Above Avg'
  if (normalizedRate >= 0.35) return 'Average'
  return 'Below Avg'
}

export function DownDistanceHeatmap({ data, side, title }: DownDistanceHeatmapProps) {
  const [tooltip, setTooltip] = useState<{
    x: number
    y: number
    data: DownDistanceSplit
  } | null>(null)

  const getCellData = (down: number, bucket: string): DownDistanceSplit | undefined => {
    return data.find(d => d.down === down && d.distance_bucket === bucket && d.side === side)
  }

  return (
    <div className="relative">
      <h3 className="font-headline text-lg text-[var(--text-primary)] mb-3">{title}</h3>

      <div className="card p-4">
        {/* Column Headers */}
        <div className="grid grid-cols-5 gap-1 mb-1">
          <div /> {/* Empty corner cell */}
          {DISTANCE_LABELS.map(label => (
            <div
              key={label}
              className="text-center text-xs text-[var(--text-muted)] py-1"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Rows */}
        {DOWNS.map(down => (
          <div key={down} className="grid grid-cols-5 gap-1 mb-1">
            {/* Row Header */}
            <div className="flex items-center justify-end pr-2 text-xs text-[var(--text-muted)]">
              {down === 1 ? '1st' : down === 2 ? '2nd' : down === 3 ? '3rd' : '4th'}
            </div>

            {/* Data Cells */}
            {DISTANCE_BUCKETS.map(bucket => {
              const cellData = getCellData(down, bucket)
              const bgColor = cellData
                ? getPerformanceColor(cellData.success_rate, side)
                : 'var(--bg-surface-alt)'

              return (
                <button
                  key={`${down}-${bucket}`}
                  className="aspect-square min-h-[44px] rounded border border-[var(--border)] transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[var(--color-run)]"
                  style={{ backgroundColor: bgColor }}
                  onMouseEnter={(e) => {
                    if (cellData) {
                      const rect = e.currentTarget.getBoundingClientRect()
                      setTooltip({ x: rect.left + rect.width / 2, y: rect.top, data: cellData })
                    }
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  onFocus={(e) => {
                    if (cellData) {
                      const rect = e.currentTarget.getBoundingClientRect()
                      setTooltip({ x: rect.left + rect.width / 2, y: rect.top, data: cellData })
                    }
                  }}
                  onBlur={() => setTooltip(null)}
                  aria-label={
                    cellData
                      ? `${down}${down === 1 ? 'st' : down === 2 ? 'nd' : down === 3 ? 'rd' : 'th'} and ${bucket}: ${(cellData.success_rate * 100).toFixed(0)}% success rate, ${cellData.epa_per_play.toFixed(2)} EPA, ${cellData.play_count} plays`
                      : `${down}${down === 1 ? 'st' : down === 2 ? 'nd' : down === 3 ? 'rd' : 'th'} and ${bucket}: No data`
                  }
                >
                  {cellData && (
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      {(cellData.success_rate * 100).toFixed(0)}%
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-[var(--border)]">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'var(--color-negative)' }} />
            <span className="text-xs text-[var(--text-muted)]">Below Avg</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'var(--bg-surface-alt)' }} />
            <span className="text-xs text-[var(--text-muted)]">Average</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'var(--color-positive)' }} />
            <span className="text-xs text-[var(--text-muted)]">Elite</span>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed bg-[var(--bg-surface)] text-[var(--text-primary)] text-sm px-4 py-3 rounded border border-[var(--border)] shadow-lg pointer-events-none z-50"
          style={{
            left: tooltip.x,
            top: tooltip.y - 90,
            transform: 'translateX(-50%)'
          }}
        >
          <p className="font-headline text-base mb-1">
            {tooltip.data.down}{tooltip.data.down === 1 ? 'st' : tooltip.data.down === 2 ? 'nd' : tooltip.data.down === 3 ? 'rd' : 'th'} & {tooltip.data.distance_bucket}
          </p>
          <p className="text-[var(--text-secondary)]">
            {(tooltip.data.success_rate * 100).toFixed(1)}% success · {tooltip.data.epa_per_play.toFixed(3)} EPA
          </p>
          <p className="text-[var(--text-muted)] text-xs">
            {tooltip.data.play_count} plays · {getPerformanceLabel(tooltip.data.success_rate, side)}
          </p>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Verify with build**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/visualizations/DownDistanceHeatmap.tsx
git commit -m "feat: add DownDistanceHeatmap component with tooltip"
```

---

## Task 4: Create KeySituationsCards Component

**Files:**
- Create: `src/components/team/KeySituationsCards.tsx`

**Step 1: Create the callout cards component**

Create `src/components/team/KeySituationsCards.tsx`:

```tsx
'use client'

import { TrendUp, TrendDown, Minus } from '@phosphor-icons/react'
import { DownDistanceSplit } from '@/lib/types/database'

interface KeySituationsCardsProps {
  data: DownDistanceSplit[]
}

interface SituationCardProps {
  label: string
  description: string
  value: string
  rank?: number
  trend?: number
}

function SituationCard({ label, description, value, rank, trend }: SituationCardProps) {
  const trendIcon = trend && trend > 0.02
    ? <TrendUp size={14} weight="thin" className="text-[var(--color-positive)]" />
    : trend && trend < -0.02
    ? <TrendDown size={14} weight="thin" className="text-[var(--color-negative)]" />
    : <Minus size={14} weight="thin" className="text-[var(--text-muted)]" />

  const trendText = trend
    ? trend > 0 ? `+${(trend * 100).toFixed(0)}%` : `${(trend * 100).toFixed(0)}%`
    : null

  return (
    <div className="card p-4">
      <p className="font-headline text-base text-[var(--text-primary)]">{label}</p>
      <p className="text-xs text-[var(--text-muted)] mb-3">{description}</p>

      <p className="font-headline text-3xl text-[var(--text-primary)] mb-2">{value}</p>

      <div className="flex items-center justify-between text-xs">
        {rank && (
          <span className="text-[var(--text-secondary)]">#{rank} FBS</span>
        )}
        {trendText && (
          <span className="flex items-center gap-1 text-[var(--text-muted)]">
            {trendIcon}
            {trendText}
          </span>
        )}
      </div>
    </div>
  )
}

export function KeySituationsCards({ data }: KeySituationsCardsProps) {
  // Filter for offensive data
  const offenseData = data.filter(d => d.side === 'offense')

  // Find specific situations
  const thirdShort = offenseData.find(d => d.down === 3 && d.distance_bucket === '1-3')
  const thirdLong = offenseData.filter(d => d.down === 3 && (d.distance_bucket === '7-10' || d.distance_bucket === '11+'))
  const fourthDown = offenseData.filter(d => d.down === 4)
  const secondLong = offenseData.filter(d => d.down === 2 && (d.distance_bucket === '7-10' || d.distance_bucket === '11+'))

  // Calculate aggregates
  const thirdLongRate = thirdLong.length > 0
    ? thirdLong.reduce((sum, d) => sum + d.success_rate * d.play_count, 0) / thirdLong.reduce((sum, d) => sum + d.play_count, 0)
    : null

  const fourthDownTotal = fourthDown.reduce((sum, d) => sum + d.play_count, 0)
  const fourthDownConversions = fourthDown.reduce((sum, d) => sum + (d.conversion_rate || 0) * d.play_count, 0)
  const fourthDownRate = fourthDownTotal > 0 ? fourthDownConversions / fourthDownTotal : null

  const secondLongRate = secondLong.length > 0
    ? secondLong.reduce((sum, d) => sum + d.success_rate * d.play_count, 0) / secondLong.reduce((sum, d) => sum + d.play_count, 0)
    : null

  return (
    <div>
      <h3 className="font-headline text-lg text-[var(--text-primary)] mb-4">Key Situations</h3>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SituationCard
          label="3rd & Short"
          description="1-3 yards"
          value={thirdShort ? `${(thirdShort.conversion_rate ? thirdShort.conversion_rate * 100 : thirdShort.success_rate * 100).toFixed(0)}%` : 'N/A'}
          rank={thirdShort?.national_rank}
        />
        <SituationCard
          label="3rd & Long"
          description="7+ yards"
          value={thirdLongRate !== null ? `${(thirdLongRate * 100).toFixed(0)}%` : 'N/A'}
        />
        <SituationCard
          label="4th Down"
          description="Attempts"
          value={fourthDownTotal > 0 ? `${fourthDownTotal}` : 'N/A'}
        />
        <SituationCard
          label="2nd & Long"
          description="7+ yards"
          value={secondLongRate !== null ? `${(secondLongRate * 100).toFixed(0)}%` : 'N/A'}
        />
      </div>
    </div>
  )
}
```

**Step 2: Verify with build**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/team/KeySituationsCards.tsx
git commit -m "feat: add KeySituationsCards component"
```

---

## Task 5: Create SituationalView Container

**Files:**
- Create: `src/components/team/SituationalView.tsx`

**Step 1: Create the situational view container**

Create `src/components/team/SituationalView.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { DownDistanceSplit } from '@/lib/types/database'
import { DownDistanceHeatmap } from '@/components/visualizations/DownDistanceHeatmap'
import { KeySituationsCards } from './KeySituationsCards'

type SubTab = 'down-distance' | 'red-zone' | 'field-position' | 'home-away' | 'vs-conference'

interface SubTabConfig {
  id: SubTab
  label: string
  enabled: boolean
}

const SUB_TABS: SubTabConfig[] = [
  { id: 'down-distance', label: 'Down & Distance', enabled: true },
  { id: 'red-zone', label: 'Red Zone', enabled: false },
  { id: 'field-position', label: 'Field Position', enabled: false },
  { id: 'home-away', label: 'Home vs Away', enabled: false },
  { id: 'vs-conference', label: 'vs Conference', enabled: false },
]

interface SituationalViewProps {
  downDistanceData: DownDistanceSplit[] | null
}

export function SituationalView({ downDistanceData }: SituationalViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('down-distance')

  return (
    <div>
      {/* Sub-navigation */}
      <nav className="flex gap-2 mb-6 border-b border-[var(--border)] pb-4">
        {SUB_TABS.map(tab => {
          const isActive = activeSubTab === tab.id
          const isDisabled = !tab.enabled

          return (
            <button
              key={tab.id}
              disabled={isDisabled}
              onClick={() => tab.enabled && setActiveSubTab(tab.id)}
              className={`px-3 py-1.5 text-sm transition-all ${
                isActive
                  ? 'text-[var(--text-primary)] border-b-2 border-[var(--color-run)] -mb-[17px] pb-[15px]'
                  : isDisabled
                  ? 'text-[var(--text-muted)] opacity-50 cursor-not-allowed'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
              {isDisabled && <span className="ml-1 text-xs">(soon)</span>}
            </button>
          )
        })}
      </nav>

      {/* Content */}
      {activeSubTab === 'down-distance' && (
        <div>
          {downDistanceData && downDistanceData.length > 0 ? (
            <>
              {/* Heatmaps */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <DownDistanceHeatmap
                  data={downDistanceData}
                  side="offense"
                  title="Offense"
                />
                <DownDistanceHeatmap
                  data={downDistanceData}
                  side="defense"
                  title="Defense"
                />
              </div>

              {/* Key Situations */}
              <KeySituationsCards data={downDistanceData} />
            </>
          ) : (
            <p className="text-[var(--text-muted)] text-center py-8">
              Down & distance data not available for this team.
            </p>
          )}
        </div>
      )}

      {activeSubTab !== 'down-distance' && (
        <p className="text-[var(--text-muted)] text-center py-8">
          Coming soon.
        </p>
      )}
    </div>
  )
}
```

**Step 2: Verify with build**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/team/SituationalView.tsx
git commit -m "feat: add SituationalView container with sub-navigation"
```

---

## Task 6: Create Database RPC (Manual Step)

**Files:**
- Supabase dashboard or SQL migration

**Step 1: Create the RPC in Supabase**

Run this SQL in Supabase SQL editor:

```sql
CREATE OR REPLACE FUNCTION get_down_distance_splits(
  p_team TEXT,
  p_season INT
)
RETURNS TABLE (
  down INT,
  distance_bucket TEXT,
  side TEXT,
  play_count BIGINT,
  success_rate NUMERIC,
  epa_per_play NUMERIC,
  conversion_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH bucketed_plays AS (
    SELECT
      p.down,
      CASE
        WHEN p.distance BETWEEN 1 AND 3 THEN '1-3'
        WHEN p.distance BETWEEN 4 AND 6 THEN '4-6'
        WHEN p.distance BETWEEN 7 AND 10 THEN '7-10'
        ELSE '11+'
      END AS distance_bucket,
      CASE
        WHEN p.offense = p_team THEN 'offense'
        ELSE 'defense'
      END AS side,
      p.epa,
      p.success,
      CASE
        WHEN p.down IN (3, 4) AND p.yards_gained >= p.distance THEN 1
        ELSE 0
      END AS converted
    FROM plays p
    JOIN games g ON p.game_id = g.id
    WHERE g.season = p_season
      AND (p.offense = p_team OR p.defense = p_team)
      AND p.down IS NOT NULL
      AND p.down BETWEEN 1 AND 4
      AND p.distance IS NOT NULL
      AND p.distance > 0
  )
  SELECT
    bp.down::INT,
    bp.distance_bucket::TEXT,
    bp.side::TEXT,
    COUNT(*)::BIGINT AS play_count,
    ROUND(AVG(bp.success::INT)::NUMERIC, 3) AS success_rate,
    ROUND(AVG(bp.epa)::NUMERIC, 3) AS epa_per_play,
    CASE
      WHEN bp.down IN (3, 4) THEN ROUND(AVG(bp.converted)::NUMERIC, 3)
      ELSE NULL
    END AS conversion_rate
  FROM bucketed_plays bp
  GROUP BY bp.down, bp.distance_bucket, bp.side
  ORDER BY bp.side, bp.down, bp.distance_bucket;
END;
$$ LANGUAGE plpgsql;
```

**Step 2: Verify the RPC works**

Run in Supabase SQL editor:
```sql
SELECT * FROM get_down_distance_splits('Texas', 2024);
```

Expected: Returns rows with down/distance aggregates

**Step 3: Document completion**

No git commit needed for Supabase changes.

---

## Task 7: Refactor Team Page with Tabs

**Files:**
- Modify: `src/app/teams/[slug]/page.tsx`

**Step 1: Add imports and data fetching**

Update `src/app/teams/[slug]/page.tsx`. Add to imports:

```tsx
import { TeamTabs, TabId } from '@/components/team/TeamTabs'
import { SituationalView } from '@/components/team/SituationalView'
import { DownDistanceSplit } from '@/lib/types/database'
```

**Step 2: Add down/distance data fetch**

In the Promise.all array, add:

```tsx
    supabase.rpc('get_down_distance_splits', {
      p_team: team.school,
      p_season: currentSeason
    })
```

And add the result:

```tsx
  const downDistanceResult = ... // the 5th result
  const downDistanceSplits = downDistanceResult.data as DownDistanceSplit[] | null
```

**Step 3: Wrap content with TeamTabs**

Replace the return statement with:

```tsx
  return (
    <div className="p-8">
      {/* Page Header */}
      <header className="flex items-center gap-6 mb-8 pb-6 border-b border-[var(--border)]">
        {team.logo ? (
          <img
            src={team.logo}
            alt={`${team.school} logo`}
            className="w-20 h-20 object-contain"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-[var(--bg-surface-alt)] flex items-center justify-center">
            <span className="font-headline text-2xl text-[var(--text-muted)]">
              {team.school.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </span>
          </div>
        )}
        <div>
          <h1 className="font-headline text-4xl text-[var(--text-primary)] underline-sketch inline-block">
            {team.school}
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            {team.conference || 'Independent'} · {currentSeason} Season
          </p>
        </div>
      </header>

      {/* Tabbed Content */}
      <TeamTabs>
        {(activeTab: TabId) => (
          <>
            {activeTab === 'overview' && (
              <>
                {/* Drive Patterns */}
                <section className="mb-10">
                  <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Drive Patterns</h2>
                  {drives && drives.length > 0 ? (
                    <DrivePatterns drives={drives} teamName={team.school} />
                  ) : (
                    <p className="text-[var(--text-muted)]">No drive data available</p>
                  )}
                </section>

                {/* Performance Metrics */}
                <section className="mb-10">
                  <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Performance Metrics</h2>
                  {metrics ? (
                    <MetricsCards metrics={metrics} />
                  ) : (
                    <p className="text-[var(--text-muted)]">No metrics available for this season</p>
                  )}
                </section>

                {/* Style Profile */}
                <section className="mb-10">
                  <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Style Profile</h2>
                  {style ? (
                    <StyleProfile style={style} />
                  ) : (
                    <p className="text-[var(--text-muted)]">No style data available</p>
                  )}
                </section>

                {/* Historical Trajectory */}
                <section className="mb-10">
                  <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Historical Trajectory</h2>
                  {trajectory && trajectory.length > 0 ? (
                    <TrajectoryChart trajectory={trajectory} />
                  ) : (
                    <p className="text-[var(--text-muted)]">No trajectory data available</p>
                  )}
                </section>
              </>
            )}

            {activeTab === 'situational' && (
              <SituationalView downDistanceData={downDistanceSplits} />
            )}

            {(activeTab === 'schedule' || activeTab === 'roster' || activeTab === 'compare') && (
              <div className="text-center py-12">
                <p className="text-[var(--text-muted)]">Coming soon.</p>
              </div>
            )}
          </>
        )}
      </TeamTabs>
    </div>
  )
```

**Step 4: Verify with build**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run build
```

Expected: Build succeeds

**Step 5: Commit**

```bash
git add "src/app/teams/[slug]/page.tsx"
git commit -m "feat: refactor team page with tabbed navigation"
```

---

## Task 8: Final Build & Lint

**Files:** None (verification only)

**Step 1: Run linter**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run lint
```

Expected: No errors (warnings OK)

**Step 2: Run build**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run build
```

Expected: Build succeeds

**Step 3: Fix any issues and commit**

If fixes needed:
```bash
git add -A
git commit -m "fix: address lint and build issues"
```

---

## Summary

This implementation plan covers:

1. **TypeScript types** — DownDistanceSplit and KeySituation interfaces
2. **TeamTabs** — Primary tab navigation component
3. **DownDistanceHeatmap** — 4×4 grid with color scale and tooltips
4. **KeySituationsCards** — 4 callout cards for headline situations
5. **SituationalView** — Container with sub-navigation
6. **Database RPC** — get_down_distance_splits function
7. **Team page refactor** — Integrate tabs and new components

All components use existing CSS custom properties from the editorial theme.
