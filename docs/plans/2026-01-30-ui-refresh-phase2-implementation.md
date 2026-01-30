# UI Refresh Phase 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the editorial UI refresh with functional theme toggle, paper texture overlay, Rough.js visualizations for drive patterns and trajectory chart.

**Architecture:** Add theme infrastructure (hook + provider), SVG noise filter for texture, replace standard SVG paths with Rough.js-rendered elements. All components use existing CSS custom properties.

**Tech Stack:** Next.js 16, React 19, Rough.js (already installed), Phosphor Icons

**Reference:** See `docs/plans/2026-01-30-ui-refresh-phase2-design.md` for full design specifications.

---

## Task 1: Theme Hook

**Files:**
- Create: `src/hooks/useTheme.ts`

**Step 1: Create the useTheme hook**

Create `src/hooks/useTheme.ts`:

```ts
'use client'

import { useState, useEffect, useCallback } from 'react'

type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'cfb-theme'

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  return (localStorage.getItem(STORAGE_KEY) as Theme) || 'system'
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light')

  // Initialize from storage
  useEffect(() => {
    const stored = getStoredTheme()
    setThemeState(stored)
    setResolvedTheme(stored === 'system' ? getSystemTheme() : stored)
  }, [])

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = () => {
      if (theme === 'system') {
        setResolvedTheme(getSystemTheme())
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', theme)
    }
    setResolvedTheme(theme === 'system' ? getSystemTheme() : theme)
  }, [theme])

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem(STORAGE_KEY, newTheme)
  }, [])

  return { theme, setTheme, resolvedTheme }
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
git add src/hooks/useTheme.ts
git commit -m "feat: add useTheme hook with localStorage persistence"
```

---

## Task 2: Update Theme Toggle & CSS

**Files:**
- Modify: `src/components/ThemeToggle.tsx`
- Modify: `src/app/globals.css`

**Step 1: Update globals.css with theme selectors**

Add after the existing `:root` block in `src/app/globals.css`:

```css
/* Explicit theme overrides */
[data-theme="light"] {
  --bg-primary: #F5F0E8;
  --bg-surface: #FFFFFF;
  --bg-surface-alt: #EDE8DF;
  --text-primary: #1A1814;
  --text-secondary: #4A4740;
  --text-muted: #6B635A;
  --border: #D9D2C7;
  --shadow-soft: 0 4px 20px rgba(26, 24, 20, 0.08);
  --shadow-hover: 0 8px 30px rgba(26, 24, 20, 0.12);
}

[data-theme="dark"] {
  --bg-primary: #1A1814;
  --bg-surface: #252019;
  --bg-surface-alt: #302920;
  --text-primary: #F5F0E8;
  --text-secondary: #C9C2B7;
  --text-muted: #8A847A;
  --border: #3D362E;
  --shadow-soft: 0 4px 20px rgba(0, 0, 0, 0.3);
  --shadow-hover: 0 8px 30px rgba(0, 0, 0, 0.4);
}
```

**Step 2: Update ThemeToggle component**

Replace `src/components/ThemeToggle.tsx`:

```tsx
'use client'

import { Sun, Moon, Desktop } from '@phosphor-icons/react'
import { useTheme } from '@/hooks/useTheme'

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()

  const cycleTheme = () => {
    const nextTheme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'
    setTheme(nextTheme)
  }

  const icon = theme === 'system'
    ? <Desktop size={20} weight="thin" />
    : resolvedTheme === 'dark'
    ? <Moon size={20} weight="thin" />
    : <Sun size={20} weight="thin" />

  const label = theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'

  return (
    <button
      onClick={cycleTheme}
      className="flex items-center gap-3 w-full px-3 py-2 rounded text-[var(--text-muted)] hover:bg-[var(--bg-surface-alt)] transition-colors"
      aria-label={`Current theme: ${label}. Click to change.`}
    >
      {icon}
      <span className="text-sm">{label}</span>
    </button>
  )
}
```

**Step 3: Verify with build**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/ThemeToggle.tsx src/app/globals.css
git commit -m "feat: functional theme toggle with system/light/dark modes"
```

---

## Task 3: Paper Texture Component

**Files:**
- Create: `src/components/PaperTexture.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

**Step 1: Add paper texture CSS variables**

Add to `:root` block in `src/app/globals.css`:

```css
  /* Paper texture */
  --paper-opacity: 0.07;
```

Add to `[data-theme="dark"]` block:

```css
  --paper-opacity: 0.04;
```

Add at end of `globals.css`:

```css
/* Paper texture overlay */
.paper-texture {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  opacity: var(--paper-opacity);
  mix-blend-mode: multiply;
}

[data-theme="dark"] .paper-texture {
  mix-blend-mode: overlay;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) .paper-texture {
    --paper-opacity: 0.04;
    mix-blend-mode: overlay;
  }
}
```

**Step 2: Create PaperTexture component**

Create `src/components/PaperTexture.tsx`:

```tsx
'use client'

export function PaperTexture() {
  return (
    <>
      <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
        <defs>
          <filter id="paper-grain">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="4"
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
      </svg>
      <div
        className="paper-texture"
        style={{ filter: 'url(#paper-grain)' }}
        aria-hidden="true"
      />
    </>
  )
}
```

**Step 3: Add PaperTexture to layout**

Update `src/app/layout.tsx` to import and use PaperTexture:

```tsx
import type { Metadata } from "next";
import { Libre_Baskerville, DM_Sans } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { PaperTexture } from "@/components/PaperTexture";

const libreBaskerville = Libre_Baskerville({
  variable: "--font-headline",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "CFB Team 360 | College Football Analytics",
  description: "Interactive analytics portal for college football teams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${libreBaskerville.variable} ${dmSans.variable} antialiased`}
      >
        <PaperTexture />
        <Sidebar />
        <main className="ml-60 min-h-screen transition-all duration-200">
          {children}
        </main>
      </body>
    </html>
  );
}
```

**Step 4: Verify with build**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run build
```

Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/components/PaperTexture.tsx src/app/globals.css src/app/layout.tsx
git commit -m "feat: add paper texture overlay with SVG noise filter"
```

---

## Task 4: Drive Patterns with Rough.js

**Files:**
- Create: `src/hooks/useRoughSvg.ts`
- Modify: `src/components/visualizations/DrivePatterns.tsx`

**Step 1: Create useRoughSvg hook**

Create `src/hooks/useRoughSvg.ts`:

```ts
'use client'

import { useRef, useEffect, useState } from 'react'
import rough from 'roughjs'
import type { RoughSVG } from 'roughjs/bin/svg'

export function useRoughSvg() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [rc, setRc] = useState<RoughSVG | null>(null)

  useEffect(() => {
    if (svgRef.current && !rc) {
      setRc(rough.svg(svgRef.current))
    }
  }, [rc])

  return { svgRef, rc }
}
```

**Step 2: Update DrivePatterns with Rough.js**

Replace `src/components/visualizations/DrivePatterns.tsx`:

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import rough from 'roughjs'
import { FootballField, yardToX } from './FootballField'
import { DrivePattern } from '@/lib/types/database'

interface DrivePatternsProps {
  drives: DrivePattern[]
  teamName: string
}

const OUTCOME_COLORS = {
  touchdown: 'var(--color-positive)',
  field_goal: 'var(--color-field-goal)',
  punt: 'var(--color-neutral)',
  turnover: 'var(--color-negative)',
  downs: 'var(--color-run)',
  end_of_half: 'var(--color-pass)',
} as const

const OUTCOME_LABELS = {
  touchdown: 'Touchdown',
  field_goal: 'Field Goal',
  punt: 'Punt',
  turnover: 'Turnover',
  downs: 'Turnover on Downs',
  end_of_half: 'End of Half',
} as const

const OUTCOME_ORDER = ['touchdown', 'field_goal', 'punt', 'turnover', 'downs', 'end_of_half']

export function DrivePatterns({ drives, teamName }: DrivePatternsProps) {
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: DrivePattern } | null>(null)
  const [animatedArcs, setAnimatedArcs] = useState<Set<number>>(new Set())
  const svgRef = useRef<SVGGElement>(null)

  const fieldWidth = 1000 - (1000 / 120) * 20
  const fieldHeight = 400

  // Animate arcs by outcome group
  useEffect(() => {
    const grouped = OUTCOME_ORDER.map(outcome =>
      drives.map((d, i) => ({ drive: d, index: i })).filter(({ drive }) => drive.outcome === outcome)
    ).flat()

    let delay = 0
    grouped.forEach(({ index }) => {
      setTimeout(() => {
        setAnimatedArcs(prev => new Set([...prev, index]))
      }, delay)
      delay += 150
    })

    return () => setAnimatedArcs(new Set())
  }, [drives])

  // Generate arc path
  function getArcPath(drive: DrivePattern): string {
    const startX = yardToX(drive.start_yard, fieldWidth)
    const endX = yardToX(drive.end_yard, fieldWidth)
    const midX = (startX + endX) / 2

    const driveLength = Math.abs(drive.end_yard - drive.start_yard)
    const baseHeight = Math.min(driveLength * 2, fieldHeight * 0.4)
    const arcHeight = baseHeight * (1 + Math.log10(Math.max(drive.count, 1)) * 0.2)

    const midY = fieldHeight / 2
    const controlY = midY - arcHeight

    return `M ${startX} ${midY} Q ${midX} ${controlY} ${endX} ${midY}`
  }

  const outcomes = [...new Set(drives.map(d => d.outcome))]

  return (
    <div className="relative">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4" role="list" aria-label="Drive outcome legend">
        {outcomes.map(outcome => {
          const color = OUTCOME_COLORS[outcome as keyof typeof OUTCOME_COLORS] || '#999'
          const label = OUTCOME_LABELS[outcome as keyof typeof OUTCOME_LABELS] || outcome
          const isSelected = selectedOutcome === null || selectedOutcome === outcome

          return (
            <button
              key={outcome}
              onClick={() => setSelectedOutcome(selectedOutcome === outcome ? null : outcome)}
              className={`flex items-center gap-2 px-3 py-1.5 border-[1.5px] border-[var(--border)] rounded-sm transition-all ${
                isSelected ? 'opacity-100' : 'opacity-40'
              } ${selectedOutcome === outcome ? 'bg-[var(--bg-surface-alt)] border-[var(--color-run)]' : 'bg-transparent'}`}
              aria-pressed={selectedOutcome === outcome}
            >
              <svg width={24} height={12}>
                <path
                  d="M 0 6 Q 12 0 24 6"
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  style={{ stroke: color }}
                />
              </svg>
              <span className="text-sm text-[var(--text-secondary)]">{label}</span>
            </button>
          )
        })}
      </div>

      {/* Field with Arcs */}
      <FootballField width={1000} height={400}>
        <g ref={svgRef}>
          {drives.map((drive, i) => {
            const color = OUTCOME_COLORS[drive.outcome as keyof typeof OUTCOME_COLORS] || '#999'
            const isVisible = selectedOutcome === null || selectedOutcome === drive.outcome
            const isAnimated = animatedArcs.has(i)
            const pathLength = 500

            return (
              <path
                key={i}
                d={getArcPath(drive)}
                fill="none"
                stroke={color}
                strokeWidth={Math.max(2, Math.min(drive.count / 2, 8))}
                opacity={isVisible ? (isAnimated ? 0.8 : 0) : 0.1}
                strokeLinecap="round"
                strokeDasharray={pathLength}
                strokeDashoffset={isAnimated ? 0 : pathLength}
                style={{
                  transition: 'stroke-dashoffset 400ms ease-out, opacity 200ms ease',
                  filter: 'url(#roughen)',
                }}
                className="cursor-pointer hover:opacity-100"
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setTooltip({ x: rect.x + rect.width / 2, y: rect.y, data: drive })
                }}
                onMouseLeave={() => setTooltip(null)}
                tabIndex={isVisible ? 0 : -1}
                role="button"
                aria-label={`${drive.count} drives from ${drive.start_yard} to ${drive.end_yard} yard line, ${drive.outcome}`}
              />
            )
          })}
        </g>
        {/* SVG filter for slight roughness */}
        <defs>
          <filter id="roughen">
            <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" />
          </filter>
        </defs>
      </FootballField>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute bg-[var(--bg-surface)] text-[var(--text-primary)] text-sm px-4 py-3 rounded border border-[var(--border)] shadow-lg pointer-events-none z-10"
          style={{
            left: tooltip.x,
            top: tooltip.y - 80,
            transform: 'translateX(-50%)'
          }}
        >
          <p className="font-headline text-base capitalize mb-1">
            {tooltip.data.outcome.replace('_', ' ')}
          </p>
          <p className="text-[var(--text-secondary)]">{tooltip.data.count} drives</p>
          <p className="text-[var(--text-muted)] text-xs">
            {tooltip.data.start_yard} → {tooltip.data.end_yard} yd | {tooltip.data.avg_plays} plays avg
          </p>
        </div>
      )}

      {/* Data Table */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
          View as table
        </summary>
        <table className="mt-2 w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left p-2 text-[var(--text-muted)]">Outcome</th>
              <th className="text-left p-2 text-[var(--text-muted)]">Start</th>
              <th className="text-left p-2 text-[var(--text-muted)]">End</th>
              <th className="text-left p-2 text-[var(--text-muted)]">Count</th>
              <th className="text-left p-2 text-[var(--text-muted)]">Avg Plays</th>
            </tr>
          </thead>
          <tbody>
            {drives.map((drive, i) => (
              <tr key={i} className="border-b border-[var(--border)]">
                <td className="p-2 capitalize text-[var(--text-primary)]">{drive.outcome.replace('_', ' ')}</td>
                <td className="p-2 text-[var(--text-secondary)]">{drive.start_yard}</td>
                <td className="p-2 text-[var(--text-secondary)]">{drive.end_yard}</td>
                <td className="p-2 text-[var(--text-secondary)]">{drive.count}</td>
                <td className="p-2 text-[var(--text-secondary)]">{drive.avg_plays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
```

**Step 3: Verify with build**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/hooks/useRoughSvg.ts src/components/visualizations/DrivePatterns.tsx
git commit -m "feat: add Rough.js-style drive patterns with sequential animation"
```

---

## Task 5: Trajectory Chart

**Files:**
- Create: `src/components/team/TrajectoryChart.tsx`
- Modify: `src/app/teams/[slug]/page.tsx`

**Step 1: Create TrajectoryChart component**

Create `src/components/team/TrajectoryChart.tsx`:

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { TeamSeasonTrajectory } from '@/lib/types/database'

interface TrajectoryChartProps {
  trajectory: TeamSeasonTrajectory[]
}

type MetricKey = 'wins' | 'epa' | 'rank'

const METRICS: { key: MetricKey; label: string; getValue: (t: TeamSeasonTrajectory) => number | null; format: (v: number) => string; invert?: boolean }[] = [
  { key: 'wins', label: 'Wins', getValue: t => t.wins, format: v => v.toString() },
  { key: 'epa', label: 'EPA', getValue: t => t.epa_per_play, format: v => v.toFixed(3) },
  { key: 'rank', label: 'Rank', getValue: t => t.off_epa_rank, format: v => `#${v}`, invert: true },
]

export function TrajectoryChart({ trajectory }: TrajectoryChartProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('wins')
  const [animationProgress, setAnimationProgress] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const metric = METRICS.find(m => m.key === selectedMetric)!
  const data = trajectory
    .map(t => ({ season: t.season, value: metric.getValue(t) }))
    .filter((d): d is { season: number; value: number } => d.value !== null)
    .sort((a, b) => a.season - b.season)

  // Reset animation on metric change
  useEffect(() => {
    setAnimationProgress(0)
    const duration = 800
    const startTime = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      setAnimationProgress(progress)

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }, [selectedMetric, trajectory])

  if (data.length === 0) {
    return (
      <div className="card p-6">
        <p className="text-[var(--text-muted)] text-center py-8">
          Historical data not available for this team.
        </p>
      </div>
    )
  }

  const padding = { top: 20, right: 20, bottom: 40, left: 50 }
  const width = 600
  const height = 300
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const values = data.map(d => d.value)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal || 1

  const getX = (i: number) => padding.left + (i / (data.length - 1 || 1)) * chartWidth
  const getY = (val: number) => {
    const normalized = (val - minVal) / range
    return metric.invert
      ? padding.top + normalized * chartHeight
      : padding.top + (1 - normalized) * chartHeight
  }

  const pathPoints = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.value)}`).join(' ')
  const visibleLength = animationProgress * data.length

  return (
    <div className="card p-6">
      {/* Metric Toggle */}
      <div className="flex gap-2 mb-6">
        {METRICS.map(m => (
          <button
            key={m.key}
            onClick={() => setSelectedMetric(m.key)}
            className={`px-3 py-1.5 border-[1.5px] rounded-sm text-sm transition-all ${
              selectedMetric === m.key
                ? 'bg-[var(--bg-surface-alt)] border-[var(--color-run)] text-[var(--text-primary)]'
                : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Y-axis labels */}
        {[0, 0.5, 1].map(pct => {
          const val = metric.invert
            ? minVal + pct * range
            : maxVal - pct * range
          return (
            <text
              key={pct}
              x={padding.left - 10}
              y={padding.top + pct * chartHeight}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-[var(--text-muted)] text-xs"
            >
              {metric.format(val)}
            </text>
          )
        })}

        {/* X-axis labels (seasons) */}
        {data.map((d, i) => (
          <text
            key={d.season}
            x={getX(i)}
            y={height - 10}
            textAnchor="middle"
            className="fill-[var(--text-muted)] text-xs"
          >
            {d.season}
          </text>
        ))}

        {/* Grid lines */}
        {[0, 0.5, 1].map(pct => (
          <line
            key={pct}
            x1={padding.left}
            y1={padding.top + pct * chartHeight}
            x2={width - padding.right}
            y2={padding.top + pct * chartHeight}
            stroke="var(--border)"
            strokeWidth={1}
            opacity={0.5}
          />
        ))}

        {/* Line path with hand-drawn effect */}
        <path
          d={pathPoints}
          fill="none"
          stroke="var(--color-run)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={chartWidth * 2}
          strokeDashoffset={chartWidth * 2 * (1 - animationProgress)}
          style={{
            filter: 'url(#chart-roughen)',
            transition: 'stroke-dashoffset 50ms linear',
          }}
        />

        {/* Data points */}
        {data.map((d, i) => {
          const visible = i < visibleLength
          return (
            <g key={d.season}>
              <circle
                cx={getX(i)}
                cy={getY(d.value)}
                r={6}
                fill="var(--bg-surface)"
                stroke="var(--color-run)"
                strokeWidth={2}
                opacity={visible ? 1 : 0}
                style={{ transition: 'opacity 150ms ease' }}
              />
              {visible && (
                <title>{`${d.season}: ${metric.format(d.value)}`}</title>
              )}
            </g>
          )
        })}

        {/* SVG filter for roughness */}
        <defs>
          <filter id="chart-roughen">
            <feTurbulence type="turbulence" baseFrequency="0.015" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1" />
          </filter>
        </defs>
      </svg>
    </div>
  )
}
```

**Step 2: Use TrajectoryChart in team page**

Update `src/app/teams/[slug]/page.tsx`. Find the Historical Trajectory section and replace:

```tsx
      {/* Historical Trajectory - Placeholder */}
      <section className="mb-10">
        <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Historical Trajectory</h2>
        {trajectory && trajectory.length > 0 ? (
          <div className="card p-6">
            <p className="text-[var(--text-muted)] text-center py-8">
              Chart visualization coming soon
            </p>
          </div>
        ) : (
          <p className="text-[var(--text-muted)]">No trajectory data available</p>
        )}
      </section>
```

With:

```tsx
      {/* Historical Trajectory */}
      <section className="mb-10">
        <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Historical Trajectory</h2>
        {trajectory && trajectory.length > 0 ? (
          <TrajectoryChart trajectory={trajectory} />
        ) : (
          <p className="text-[var(--text-muted)]">No trajectory data available</p>
        )}
      </section>
```

Also add the import at the top of the file:

```tsx
import { TrajectoryChart } from '@/components/team/TrajectoryChart'
```

**Step 3: Verify with build**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/team/TrajectoryChart.tsx "src/app/teams/[slug]/page.tsx"
git commit -m "feat: add trajectory chart with metric toggles and animation"
```

---

## Task 6: Final Build & Lint

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

1. **Theme hook** - `useTheme` with localStorage persistence
2. **Theme toggle** - Functional cycling through system/light/dark
3. **Paper texture** - SVG noise filter overlay
4. **Drive patterns** - Sequential animation with editorial colors
5. **Trajectory chart** - New component with metric toggles

All components use the existing CSS custom properties from Phase 1.
