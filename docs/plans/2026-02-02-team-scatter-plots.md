# Team Scatter Plots Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a league-wide Team Analytics page with interactive scatter plots showing all FBS teams plotted on key metrics (EPA vs Success Rate, Offense vs Defense, Run vs Pass efficiency).

**Architecture:** New `/analytics` route with D3.js scatter plot visualization. Server component fetches all team metrics, client component handles interactivity (hover, click to navigate, axis selection). Follows existing SVG pattern from TrajectoryChart.tsx - no external charting libraries.

**Tech Stack:** Next.js 16, React 19, TypeScript, D3.js, Supabase, existing CSS custom properties

---

## Task 1: Add Analytics Route and Page Shell

**Files:**
- Create: `src/app/analytics/page.tsx`
- Modify: `src/components/Sidebar.tsx`

**Step 1: Create basic analytics page**

Create `src/app/analytics/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { Team, TeamSeasonEpa, TeamStyleProfile } from '@/lib/types/database'
import { ScatterPlotClient } from '@/components/analytics/ScatterPlotClient'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const currentSeason = 2024

  const [teamsResult, metricsResult, stylesResult] = await Promise.all([
    supabase.from('teams').select('*'),
    supabase.from('team_epa_season').select('*').eq('season', currentSeason),
    supabase.from('team_style_profile').select('*').eq('season', currentSeason)
  ])

  const teams = (teamsResult.data as Team[]) || []
  const metrics = (metricsResult.data as TeamSeasonEpa[]) || []
  const styles = (stylesResult.data as TeamStyleProfile[]) || []

  return (
    <div className="p-8">
      <header className="mb-8 pb-6 border-b border-[var(--border)]">
        <h1 className="font-headline text-4xl text-[var(--text-primary)] underline-sketch inline-block">
          Team Analytics
        </h1>
        <p className="text-[var(--text-secondary)] mt-2">
          {currentSeason} Season · All FBS Teams
        </p>
      </header>

      <ScatterPlotClient
        teams={teams}
        metrics={metrics}
        styles={styles}
        currentSeason={currentSeason}
      />
    </div>
  )
}
```

**Step 2: Add sidebar navigation link**

In `src/components/Sidebar.tsx`, add after the Teams link:

```tsx
        <Link
          href="/analytics"
          className="flex items-center gap-3 px-4 py-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)] transition-colors"
        >
          <ChartScatter size={20} weight="regular" />
          <span>Analytics</span>
        </Link>
```

Add import at top:

```tsx
import { ChartScatter } from '@phosphor-icons/react/dist/ssr'
```

**Step 3: Verify build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build fails (ScatterPlotClient doesn't exist yet) - that's expected

**Step 4: Commit page shell**

```bash
git add src/app/analytics/page.tsx src/components/Sidebar.tsx
git commit -m "feat: add analytics page shell and sidebar link"
```

---

## Task 2: Create ScatterPlotClient Component Shell

**Files:**
- Create: `src/components/analytics/ScatterPlotClient.tsx`

**Step 1: Create the client component**

Create `src/components/analytics/ScatterPlotClient.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Team, TeamSeasonEpa, TeamStyleProfile } from '@/lib/types/database'

interface ScatterPlotClientProps {
  teams: Team[]
  metrics: TeamSeasonEpa[]
  styles: TeamStyleProfile[]
  currentSeason: number
}

type MetricKey = 'epa_vs_success' | 'off_vs_def' | 'run_vs_pass'

const PLOT_OPTIONS: { id: MetricKey; label: string; xLabel: string; yLabel: string }[] = [
  { id: 'epa_vs_success', label: 'EPA vs Success Rate', xLabel: 'EPA per Play', yLabel: 'Success Rate' },
  { id: 'off_vs_def', label: 'Offense vs Defense', xLabel: 'Offensive EPA Rank', yLabel: 'Defensive EPA Rank' },
  { id: 'run_vs_pass', label: 'Run vs Pass EPA', xLabel: 'Rushing EPA', yLabel: 'Passing EPA' },
]

export function ScatterPlotClient({ teams, metrics, styles, currentSeason }: ScatterPlotClientProps) {
  const [activePlot, setActivePlot] = useState<MetricKey>('epa_vs_success')

  const activeOption = PLOT_OPTIONS.find(p => p.id === activePlot)!

  return (
    <div>
      {/* Plot Type Selector */}
      <div className="flex gap-2 mb-6">
        {PLOT_OPTIONS.map(option => (
          <button
            key={option.id}
            onClick={() => setActivePlot(option.id)}
            className={`px-4 py-2 border-[1.5px] rounded-sm text-sm transition-all ${
              activePlot === option.id
                ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Scatter Plot Container */}
      <div className="card p-6">
        <div className="text-center py-20 text-[var(--text-muted)]">
          Scatter plot visualization coming next...
          <br />
          <span className="text-sm">
            {teams.length} teams · {metrics.length} metrics · Plot: {activeOption.label}
          </span>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Verify build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/analytics/ScatterPlotClient.tsx
git commit -m "feat: add ScatterPlotClient shell with plot type selector"
```

---

## Task 3: Create ScatterPlot SVG Component

**Files:**
- Create: `src/components/analytics/ScatterPlot.tsx`

**Step 1: Create the SVG scatter plot component**

Create `src/components/analytics/ScatterPlot.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

interface DataPoint {
  id: number
  name: string
  x: number
  y: number
  color: string
  logo: string | null
  conference: string | null
}

interface ScatterPlotProps {
  data: DataPoint[]
  xLabel: string
  yLabel: string
  xInvert?: boolean  // Lower is better (for ranks)
  yInvert?: boolean
}

const MARGIN = { top: 40, right: 40, bottom: 60, left: 70 }
const WIDTH = 800
const HEIGHT = 500

export function ScatterPlot({ data, xLabel, yLabel, xInvert = false, yInvert = false }: ScatterPlotProps) {
  const router = useRouter()
  const [hoveredPoint, setHoveredPoint] = useState<DataPoint | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const { xScale, yScale, xDomain, yDomain } = useMemo(() => {
    const xValues = data.map(d => d.x)
    const yValues = data.map(d => d.y)

    const xMin = Math.min(...xValues)
    const xMax = Math.max(...xValues)
    const yMin = Math.min(...yValues)
    const yMax = Math.max(...yValues)

    // Add 10% padding
    const xPad = (xMax - xMin) * 0.1
    const yPad = (yMax - yMin) * 0.1

    const xDomain = [xMin - xPad, xMax + xPad]
    const yDomain = [yMin - yPad, yMax + yPad]

    const plotWidth = WIDTH - MARGIN.left - MARGIN.right
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom

    const xScale = (val: number) => {
      const normalized = (val - xDomain[0]) / (xDomain[1] - xDomain[0])
      return MARGIN.left + (xInvert ? 1 - normalized : normalized) * plotWidth
    }

    const yScale = (val: number) => {
      const normalized = (val - yDomain[0]) / (yDomain[1] - yDomain[0])
      return MARGIN.top + (yInvert ? normalized : 1 - normalized) * plotHeight
    }

    return { xScale, yScale, xDomain, yDomain }
  }, [data, xInvert, yInvert])

  const handleClick = (point: DataPoint) => {
    const slug = point.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    router.push(`/teams/${slug}`)
  }

  // Generate axis ticks
  const xTicks = useMemo(() => {
    const count = 6
    const step = (xDomain[1] - xDomain[0]) / (count - 1)
    return Array.from({ length: count }, (_, i) => xDomain[0] + i * step)
  }, [xDomain])

  const yTicks = useMemo(() => {
    const count = 6
    const step = (yDomain[1] - yDomain[0]) / (count - 1)
    return Array.from({ length: count }, (_, i) => yDomain[0] + i * step)
  }, [yDomain])

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full max-w-4xl mx-auto"
        role="img"
        aria-label={`Scatter plot of ${xLabel} vs ${yLabel} for all FBS teams`}
      >
        {/* Grid lines */}
        <g className="grid-lines">
          {xTicks.map((tick, i) => (
            <line
              key={`x-${i}`}
              x1={xScale(tick)}
              y1={MARGIN.top}
              x2={xScale(tick)}
              y2={HEIGHT - MARGIN.bottom}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          ))}
          {yTicks.map((tick, i) => (
            <line
              key={`y-${i}`}
              x1={MARGIN.left}
              y1={yScale(tick)}
              x2={WIDTH - MARGIN.right}
              y2={yScale(tick)}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          ))}
        </g>

        {/* Axes */}
        <line
          x1={MARGIN.left}
          y1={HEIGHT - MARGIN.bottom}
          x2={WIDTH - MARGIN.right}
          y2={HEIGHT - MARGIN.bottom}
          stroke="var(--text-muted)"
          strokeWidth={1.5}
        />
        <line
          x1={MARGIN.left}
          y1={MARGIN.top}
          x2={MARGIN.left}
          y2={HEIGHT - MARGIN.bottom}
          stroke="var(--text-muted)"
          strokeWidth={1.5}
        />

        {/* X-axis ticks and labels */}
        {xTicks.map((tick, i) => (
          <g key={`x-tick-${i}`}>
            <line
              x1={xScale(tick)}
              y1={HEIGHT - MARGIN.bottom}
              x2={xScale(tick)}
              y2={HEIGHT - MARGIN.bottom + 6}
              stroke="var(--text-muted)"
              strokeWidth={1}
            />
            <text
              x={xScale(tick)}
              y={HEIGHT - MARGIN.bottom + 20}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize={12}
            >
              {tick.toFixed(2)}
            </text>
          </g>
        ))}

        {/* Y-axis ticks and labels */}
        {yTicks.map((tick, i) => (
          <g key={`y-tick-${i}`}>
            <line
              x1={MARGIN.left - 6}
              y1={yScale(tick)}
              x2={MARGIN.left}
              y2={yScale(tick)}
              stroke="var(--text-muted)"
              strokeWidth={1}
            />
            <text
              x={MARGIN.left - 12}
              y={yScale(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              fill="var(--text-muted)"
              fontSize={12}
            >
              {tick.toFixed(2)}
            </text>
          </g>
        ))}

        {/* Axis labels */}
        <text
          x={WIDTH / 2}
          y={HEIGHT - 10}
          textAnchor="middle"
          fill="var(--text-secondary)"
          fontSize={14}
          fontWeight={500}
        >
          {xLabel}
        </text>
        <text
          x={20}
          y={HEIGHT / 2}
          textAnchor="middle"
          fill="var(--text-secondary)"
          fontSize={14}
          fontWeight={500}
          transform={`rotate(-90, 20, ${HEIGHT / 2})`}
        >
          {yLabel}
        </text>

        {/* Data points */}
        {data.map(point => (
          <g
            key={point.id}
            style={{ cursor: 'pointer' }}
            onClick={() => handleClick(point)}
            onMouseEnter={(e) => {
              setHoveredPoint(point)
              const rect = (e.target as SVGElement).getBoundingClientRect()
              setMousePos({ x: rect.x + rect.width / 2, y: rect.y })
            }}
            onMouseLeave={() => setHoveredPoint(null)}
          >
            <circle
              cx={xScale(point.x)}
              cy={yScale(point.y)}
              r={hoveredPoint?.id === point.id ? 10 : 7}
              fill={point.color || 'var(--color-run)'}
              fillOpacity={hoveredPoint?.id === point.id ? 1 : 0.7}
              stroke={hoveredPoint?.id === point.id ? 'var(--text-primary)' : 'none'}
              strokeWidth={2}
              className="transition-all duration-150"
            />
          </g>
        ))}
      </svg>

      {/* Tooltip */}
      {hoveredPoint && (
        <div
          className="absolute bg-[var(--bg-surface)] border border-[var(--border)] rounded-sm shadow-lg p-3 pointer-events-none z-10"
          style={{
            left: `${xScale(hoveredPoint.x) / WIDTH * 100}%`,
            top: `${yScale(hoveredPoint.y) / HEIGHT * 100 - 15}%`,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            {hoveredPoint.logo && (
              <img src={hoveredPoint.logo} alt="" className="w-6 h-6 object-contain" />
            )}
            <span className="font-medium text-[var(--text-primary)]">{hoveredPoint.name}</span>
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {hoveredPoint.conference || 'Independent'}
          </div>
          <div className="text-sm text-[var(--text-secondary)] mt-1">
            {xLabel}: {hoveredPoint.x.toFixed(3)}
            <br />
            {yLabel}: {hoveredPoint.y.toFixed(3)}
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1">
            Click to view team
          </div>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Verify build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/analytics/ScatterPlot.tsx
git commit -m "feat: add ScatterPlot SVG component with hover and click"
```

---

## Task 4: Wire Up ScatterPlot to ScatterPlotClient

**Files:**
- Modify: `src/components/analytics/ScatterPlotClient.tsx`

**Step 1: Import ScatterPlot and transform data**

Replace the entire `ScatterPlotClient.tsx` with:

```tsx
'use client'

import { useState, useMemo } from 'react'
import { Team, TeamSeasonEpa, TeamStyleProfile } from '@/lib/types/database'
import { ScatterPlot } from './ScatterPlot'

interface ScatterPlotClientProps {
  teams: Team[]
  metrics: TeamSeasonEpa[]
  styles: TeamStyleProfile[]
  currentSeason: number
}

type MetricKey = 'epa_vs_success' | 'off_vs_def' | 'run_vs_pass'

const PLOT_OPTIONS: { id: MetricKey; label: string; xLabel: string; yLabel: string; xInvert?: boolean; yInvert?: boolean }[] = [
  { id: 'epa_vs_success', label: 'EPA vs Success Rate', xLabel: 'EPA per Play', yLabel: 'Success Rate' },
  { id: 'off_vs_def', label: 'Offense vs Defense', xLabel: 'Offensive EPA Rank', yLabel: 'Defensive EPA Rank', xInvert: true, yInvert: true },
  { id: 'run_vs_pass', label: 'Run vs Pass EPA', xLabel: 'Rushing EPA', yLabel: 'Passing EPA' },
]

interface DataPoint {
  id: number
  name: string
  x: number
  y: number
  color: string
  logo: string | null
  conference: string | null
}

export function ScatterPlotClient({ teams, metrics, styles, currentSeason }: ScatterPlotClientProps) {
  const [activePlot, setActivePlot] = useState<MetricKey>('epa_vs_success')

  const activeOption = PLOT_OPTIONS.find(p => p.id === activePlot)!

  // Build lookup maps
  const metricsMap = useMemo(() => {
    return new Map(metrics.map(m => [m.team, m]))
  }, [metrics])

  const stylesMap = useMemo(() => {
    return new Map(styles.map(s => [s.team, s]))
  }, [styles])

  // Transform data based on active plot
  const plotData: DataPoint[] = useMemo(() => {
    return teams
      .map(team => {
        const teamMetrics = metricsMap.get(team.school)
        const teamStyle = stylesMap.get(team.school)

        if (!teamMetrics) return null

        let x: number, y: number

        switch (activePlot) {
          case 'epa_vs_success':
            x = teamMetrics.epa_per_play
            y = teamMetrics.success_rate
            break
          case 'off_vs_def':
            x = teamMetrics.off_epa_rank
            y = teamMetrics.def_epa_rank
            break
          case 'run_vs_pass':
            if (!teamStyle) return null
            x = teamStyle.epa_rushing
            y = teamStyle.epa_passing
            break
          default:
            return null
        }

        return {
          id: team.id,
          name: team.school,
          x,
          y,
          color: team.color || '#6B635A',
          logo: team.logo,
          conference: team.conference
        }
      })
      .filter((p): p is DataPoint => p !== null)
  }, [teams, metricsMap, stylesMap, activePlot])

  return (
    <div>
      {/* Plot Type Selector */}
      <div className="flex gap-2 mb-6">
        {PLOT_OPTIONS.map(option => (
          <button
            key={option.id}
            onClick={() => setActivePlot(option.id)}
            className={`px-4 py-2 border-[1.5px] rounded-sm text-sm transition-all ${
              activePlot === option.id
                ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Stats Summary */}
      <div className="flex gap-4 mb-4 text-sm text-[var(--text-muted)]">
        <span>{plotData.length} teams plotted</span>
        <span>·</span>
        <span>{currentSeason} Season</span>
      </div>

      {/* Scatter Plot */}
      <div className="card p-6">
        {plotData.length > 0 ? (
          <ScatterPlot
            data={plotData}
            xLabel={activeOption.xLabel}
            yLabel={activeOption.yLabel}
            xInvert={activeOption.xInvert}
            yInvert={activeOption.yInvert}
          />
        ) : (
          <div className="text-center py-20 text-[var(--text-muted)]">
            No data available for this plot type.
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 text-xs text-[var(--text-muted)]">
        Click any team to view their full analytics dashboard. Teams are colored by their primary color.
      </div>
    </div>
  )
}
```

**Step 2: Verify build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/analytics/ScatterPlotClient.tsx
git commit -m "feat: wire up scatter plot with data transformation"
```

---

## Task 5: Add Conference Filter

**Files:**
- Modify: `src/components/analytics/ScatterPlotClient.tsx`

**Step 1: Add conference filter state and UI**

After the `activePlot` state, add:

```tsx
  const [selectedConference, setSelectedConference] = useState<string | null>(null)

  // Get unique conferences
  const conferences = useMemo(() => {
    const confSet = new Set(teams.map(t => t.conference).filter(Boolean))
    return Array.from(confSet).sort() as string[]
  }, [teams])
```

After the plot type selector buttons div, add:

```tsx
      {/* Conference Filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setSelectedConference(null)}
          className={`px-3 py-1.5 border rounded-sm text-xs transition-all ${
            selectedConference === null
              ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
              : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-secondary)]'
          }`}
        >
          All Conferences
        </button>
        {conferences.map(conf => (
          <button
            key={conf}
            onClick={() => setSelectedConference(conf)}
            className={`px-3 py-1.5 border rounded-sm text-xs transition-all ${
              selectedConference === conf
                ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-secondary)]'
            }`}
          >
            {conf}
          </button>
        ))}
      </div>
```

**Step 2: Filter plotData by conference**

Update the plotData useMemo to filter by conference:

```tsx
  const plotData: DataPoint[] = useMemo(() => {
    return teams
      .filter(team => !selectedConference || team.conference === selectedConference)
      .map(team => {
        // ... rest of mapping logic unchanged
      })
      .filter((p): p is DataPoint => p !== null)
  }, [teams, metricsMap, stylesMap, activePlot, selectedConference])
```

**Step 3: Verify build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/analytics/ScatterPlotClient.tsx
git commit -m "feat: add conference filter to scatter plot"
```

---

## Task 6: Add Quadrant Labels and Mean Lines

**Files:**
- Modify: `src/components/analytics/ScatterPlot.tsx`

**Step 1: Calculate means and add reference lines**

After the yTicks useMemo, add:

```tsx
  // Calculate means for reference lines
  const { xMean, yMean } = useMemo(() => {
    const xSum = data.reduce((sum, d) => sum + d.x, 0)
    const ySum = data.reduce((sum, d) => sum + d.y, 0)
    return {
      xMean: xSum / data.length,
      yMean: ySum / data.length
    }
  }, [data])
```

After the grid lines `<g>`, add mean lines:

```tsx
        {/* Mean reference lines */}
        <line
          x1={xScale(xMean)}
          y1={MARGIN.top}
          x2={xScale(xMean)}
          y2={HEIGHT - MARGIN.bottom}
          stroke="var(--color-run)"
          strokeWidth={1.5}
          strokeDasharray="8,4"
          opacity={0.5}
        />
        <line
          x1={MARGIN.left}
          y1={yScale(yMean)}
          x2={WIDTH - MARGIN.right}
          y2={yScale(yMean)}
          stroke="var(--color-run)"
          strokeWidth={1.5}
          strokeDasharray="8,4"
          opacity={0.5}
        />
```

**Step 2: Add quadrant labels**

After the mean lines, add quadrant labels:

```tsx
        {/* Quadrant labels */}
        <text
          x={MARGIN.left + 10}
          y={MARGIN.top + 20}
          fill="var(--text-muted)"
          fontSize={11}
          opacity={0.6}
        >
          {yInvert ? 'Strong Defense' : 'High Y'} / {xInvert ? 'Strong Offense' : 'Low X'}
        </text>
        <text
          x={WIDTH - MARGIN.right - 10}
          y={MARGIN.top + 20}
          fill="var(--text-muted)"
          fontSize={11}
          textAnchor="end"
          opacity={0.6}
        >
          {yInvert ? 'Strong Defense' : 'High Y'} / {xInvert ? 'Weak Offense' : 'High X'}
        </text>
        <text
          x={MARGIN.left + 10}
          y={HEIGHT - MARGIN.bottom - 10}
          fill="var(--text-muted)"
          fontSize={11}
          opacity={0.6}
        >
          {yInvert ? 'Weak Defense' : 'Low Y'} / {xInvert ? 'Strong Offense' : 'Low X'}
        </text>
        <text
          x={WIDTH - MARGIN.right - 10}
          y={HEIGHT - MARGIN.bottom - 10}
          fill="var(--text-muted)"
          fontSize={11}
          textAnchor="end"
          opacity={0.6}
        >
          {yInvert ? 'Weak Defense' : 'Low Y'} / {xInvert ? 'Weak Offense' : 'High X'}
        </text>
```

**Step 3: Verify build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/analytics/ScatterPlot.tsx
git commit -m "feat: add mean reference lines and quadrant labels"
```

---

## Task 7: Final Build, Lint, and Push

**Files:** None (verification only)

**Step 1: Run linter**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run lint`

Expected: No errors (warnings about `<img>` are acceptable)

**Step 2: Run build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 3: Test locally**

Run: `npm run dev`

Visit: `http://localhost:3000/analytics`

Verify:
- All FBS teams appear as colored dots
- EPA vs Success Rate plot shows clear distribution
- Offense vs Defense plot shows inverted axes (top-left is best)
- Run vs Pass EPA plot shows offensive style breakdown
- Conference filter narrows to selected conference
- Hover shows team tooltip with logo and stats
- Click navigates to team page
- Mean lines divide the plot into quadrants

**Step 4: Push to deploy**

```bash
git push
```

---

## Summary

This implementation adds:

1. **New `/analytics` Route**
   - League-wide team analytics page
   - Sidebar navigation link
   - Server-side data fetching for all teams

2. **Interactive Scatter Plots**
   - Three plot types: EPA vs Success Rate, Offense vs Defense Rank, Run vs Pass EPA
   - Custom SVG rendering (no external chart library)
   - Hover tooltips with team info
   - Click to navigate to team page

3. **Conference Filtering**
   - Filter by any conference
   - "All Conferences" default view

4. **Visual Enhancements**
   - Mean reference lines for context
   - Quadrant labels for interpretation
   - Team primary colors for dots

**Data sources:**
- `teams` - Team info, colors, logos
- `team_epa_season` - EPA per play, success rate, rankings
- `team_style_profile` - Rushing/passing EPA

**New components:**
- `ScatterPlotClient.tsx` - Client component with plot selector and filtering
- `ScatterPlot.tsx` - Reusable SVG scatter plot visualization

**Future enhancements:**
- Search/highlight specific team
- Regression line overlay
- Export as image
- Additional plot types (recruiting vs performance, etc.)
