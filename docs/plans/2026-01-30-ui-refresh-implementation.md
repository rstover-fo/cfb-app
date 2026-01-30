# UI Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform cfb-app from flat dark theme to "vintage sports journalism" editorial aesthetic with warm colors, hand-drawn elements, and animated data presentation.

**Architecture:** Replace existing Tailwind classes with CSS custom properties for theming. Add collapsible sidebar navigation. Integrate Phosphor icons and Rough.js for sketch aesthetic. Implement count-up animations for metrics.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Phosphor Icons, Rough.js, next/font (Libre Baskerville + DM Sans)

**Reference:** See `docs/plans/2026-01-30-ui-refresh-design.md` for full design specifications.

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install new packages**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm install @phosphor-icons/react roughjs
```

Expected: Packages added to dependencies

**Step 2: Verify installation**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm ls @phosphor-icons/react roughjs
```

Expected: Both packages listed

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add phosphor-icons and roughjs dependencies"
```

---

## Task 2: Add Custom Fonts

**Files:**
- Modify: `src/app/layout.tsx`

**Step 1: Update layout.tsx with new fonts**

Replace the font imports and configuration:

```tsx
import type { Metadata } from "next";
import { Libre_Baskerville, DM_Sans } from "next/font/google";
import "./globals.css";

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
        {children}
      </body>
    </html>
  );
}
```

**Step 2: Run dev server to verify fonts load**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run dev
```

Expected: No errors, fonts load (check Network tab for Libre_Baskerville and DM_Sans)

**Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: add Libre Baskerville and DM Sans fonts"
```

---

## Task 3: Create Design Tokens CSS

**Files:**
- Modify: `src/app/globals.css`

**Step 1: Replace globals.css with design tokens**

```css
@import "tailwindcss";

/* ===========================================
   DESIGN TOKENS - CFB Team 360 Editorial Theme
   =========================================== */

:root {
  /* Light Mode Colors */
  --bg-primary: #F5F0E8;
  --bg-surface: #FFFFFF;
  --bg-surface-alt: #EDE8DF;

  --text-primary: #1A1814;
  --text-secondary: #4A4740;
  --text-muted: #6B635A;

  --border: #D9D2C7;

  /* Semantic Colors (same in both modes) */
  --color-run: #C47A5A;
  --color-pass: #5C5A7A;
  --color-positive: #4A7A5C;
  --color-negative: #A65A5A;
  --color-neutral: #6B635A;
  --color-field-goal: #5A7AC4;

  /* Shadows */
  --shadow-soft: 0 4px 20px rgba(26, 24, 20, 0.08);
  --shadow-hover: 0 8px 30px rgba(26, 24, 20, 0.12);

  /* Typography */
  --font-headline: 'Libre Baskerville', Georgia, serif;
  --font-body: 'DM Sans', system-ui, sans-serif;
}

/* Dark Mode (Inverted Editorial) */
@media (prefers-color-scheme: dark) {
  :root {
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
}

/* ===========================================
   BASE STYLES
   =========================================== */

body {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-body);
}

/* Headlines use serif font */
h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-headline);
}

/* ===========================================
   UTILITY CLASSES
   =========================================== */

.text-headline {
  font-family: var(--font-headline);
}

.text-body {
  font-family: var(--font-body);
}

.bg-surface {
  background: var(--bg-surface);
}

.bg-surface-alt {
  background: var(--bg-surface-alt);
}

.border-theme {
  border-color: var(--border);
}

.text-muted {
  color: var(--text-muted);
}

.text-secondary {
  color: var(--text-secondary);
}

/* Card base style */
.card {
  background: var(--bg-surface);
  border: 1.5px solid var(--border);
  border-radius: 3px;
  box-shadow: var(--shadow-soft);
  transition: all 200ms ease;
}

.card:hover {
  box-shadow: var(--shadow-hover);
  transform: translateY(-2px);
}

/* Hand-drawn underline effect */
.underline-sketch {
  position: relative;
}

.underline-sketch::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: -4px;
  width: 100%;
  height: 2px;
  background: var(--color-run);
  border-radius: 1px;
  transform: rotate(-0.5deg);
}
```

**Step 2: Run build to verify CSS compiles**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: add editorial design tokens and utility classes"
```

---

## Task 4: Create Sidebar Component

**Files:**
- Create: `src/components/Sidebar.tsx`
- Create: `src/components/ThemeToggle.tsx`

**Step 1: Create ThemeToggle component**

Create `src/components/ThemeToggle.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Sun, Moon } from '@phosphor-icons/react'

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    // Check system preference on mount
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
    setIsDark(darkQuery.matches)
  }, [])

  // For now, just show current state - full theme switching would need more work
  return (
    <button
      className="flex items-center gap-3 w-full px-3 py-2 rounded text-[var(--text-muted)] hover:bg-[var(--bg-surface-alt)] transition-colors"
      aria-label={isDark ? 'Dark mode active' : 'Light mode active'}
    >
      {isDark ? (
        <Moon size={20} weight="thin" />
      ) : (
        <Sun size={20} weight="thin" />
      )}
      <span className="text-sm">{isDark ? 'Dark' : 'Light'}</span>
    </button>
  )
}
```

**Step 2: Create Sidebar component**

Create `src/components/Sidebar.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  House,
  Football,
  ListNumbers,
  SwordsCrossed,
  Compass,
  Star,
  GearSix,
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
} from '@phosphor-icons/react'
import { ThemeToggle } from './ThemeToggle'

const navItems = [
  { href: '/', label: 'Home', icon: House },
  { href: '/teams', label: 'Teams', icon: Football },
  { href: '/rankings', label: 'Rankings', icon: ListNumbers, disabled: true },
  { href: '/matchups', label: 'Matchups', icon: SwordsCrossed, disabled: true },
]

const secondaryItems = [
  { href: '/explore', label: 'Explorations', icon: Compass, badge: 'soon' },
  { href: '/favorites', label: 'Favorites', icon: Star, disabled: true },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col transition-all duration-200 z-50 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo & Collapse Toggle */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        {!collapsed && (
          <Link href="/" className="font-headline text-lg text-[var(--text-primary)]">
            CFB 360
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-[var(--bg-surface-alt)] text-[var(--text-muted)]"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <CaretRight size={20} weight="thin" /> : <CaretLeft size={20} weight="thin" />}
        </button>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-[var(--border)]">
        <button
          className={`flex items-center gap-3 w-full px-3 py-2 rounded text-[var(--text-muted)] hover:bg-[var(--bg-surface-alt)] transition-colors ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <MagnifyingGlass size={20} weight="thin" />
          {!collapsed && (
            <>
              <span className="text-sm flex-1 text-left">Search</span>
              <kbd className="text-xs bg-[var(--bg-surface-alt)] px-1.5 py-0.5 rounded">⌘K</kbd>
            </>
          )}
        </button>
      </div>

      {/* Primary Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)

          return (
            <Link
              key={item.href}
              href={item.disabled ? '#' : item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${
                active
                  ? 'bg-[var(--bg-surface-alt)] text-[var(--text-primary)] border-l-[3px] border-[var(--color-run)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface-alt)] hover:text-[var(--text-primary)]'
              } ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={(e) => item.disabled && e.preventDefault()}
            >
              <Icon size={20} weight="thin" />
              {!collapsed && <span className="text-sm">{item.label}</span>}
            </Link>
          )
        })}

        {/* Divider */}
        <div className="my-3 border-t border-[var(--border)]" />

        {secondaryItems.map((item) => {
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.disabled ? '#' : item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded transition-colors ${
                collapsed ? 'justify-center' : ''
              } text-[var(--text-muted)] hover:bg-[var(--bg-surface-alt)] hover:text-[var(--text-primary)] ${
                item.disabled ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              onClick={(e) => item.disabled && e.preventDefault()}
            >
              <Icon size={20} weight="thin" />
              {!collapsed && (
                <>
                  <span className="text-sm flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="text-xs bg-[var(--bg-surface-alt)] px-1.5 py-0.5 rounded">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom Section */}
      <div className="p-3 border-t border-[var(--border)] space-y-1">
        <ThemeToggle />
        <button
          className={`flex items-center gap-3 w-full px-3 py-2 rounded text-[var(--text-muted)] hover:bg-[var(--bg-surface-alt)] transition-colors ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <GearSix size={20} weight="thin" />
          {!collapsed && <span className="text-sm">Settings</span>}
        </button>
      </div>
    </aside>
  )
}
```

**Step 3: Run type check**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npx tsc --noEmit
```

Expected: No type errors

**Step 4: Commit**

```bash
git add src/components/Sidebar.tsx src/components/ThemeToggle.tsx
git commit -m "feat: add collapsible sidebar with Phosphor icons"
```

---

## Task 5: Update Layout with Sidebar

**Files:**
- Modify: `src/app/layout.tsx`
- Delete: `src/components/Header.tsx` (replaced by sidebar)

**Step 1: Update layout to include Sidebar**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Libre_Baskerville, DM_Sans } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

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
        <Sidebar />
        <main className="ml-60 min-h-screen transition-all duration-200">
          {children}
        </main>
      </body>
    </html>
  );
}
```

**Step 2: Run dev to verify sidebar appears**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run dev
```

Expected: Sidebar visible on left, content pushed right

**Step 3: Commit**

```bash
git add src/app/layout.tsx
git rm src/components/Header.tsx
git commit -m "feat: integrate sidebar into layout, remove old header"
```

---

## Task 6: Update Team Cards

**Files:**
- Modify: `src/components/TeamCard.tsx`

**Step 1: Restyle TeamCard with editorial theme**

Replace `src/components/TeamCard.tsx`:

```tsx
import Link from 'next/link'
import { Team } from '@/lib/types/database'

interface TeamCardProps {
  team: Team
}

function TeamInitials({ school }: { school: string }) {
  const initials = school
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="w-[120px] h-[120px] rounded-full bg-[var(--bg-surface-alt)] flex items-center justify-center">
      <span className="font-headline text-3xl text-[var(--text-muted)]">
        {initials}
      </span>
    </div>
  )
}

export function TeamCard({ team }: TeamCardProps) {
  const slug = team.school.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  return (
    <Link
      href={`/teams/${slug}`}
      className="card block p-6 hover:border-[var(--color-run)]"
    >
      {/* Logo Area */}
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

      {/* Team Name */}
      <div className="text-center mb-4">
        <h2 className="font-headline text-xl text-[var(--text-primary)] underline-sketch inline-block">
          {team.school}
        </h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {team.conference || 'Independent'}
        </p>
      </div>

      {/* Stats Preview - placeholder for now */}
      <div className="flex justify-between text-sm border-t border-[var(--border)] pt-4">
        <div className="text-center">
          <p className="text-[var(--text-muted)]">EPA</p>
          <p className="text-[var(--text-primary)] font-medium">--</p>
        </div>
        <div className="text-center">
          <p className="text-[var(--text-muted)]">W-L</p>
          <p className="text-[var(--text-primary)] font-medium">--</p>
        </div>
        <div className="text-center">
          <p className="text-[var(--text-muted)]">Rank</p>
          <p className="text-[var(--text-primary)] font-medium">--</p>
        </div>
      </div>
    </Link>
  )
}
```

**Step 2: Run dev and verify cards render**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run dev
```

Expected: Team cards show with new editorial styling

**Step 3: Commit**

```bash
git add src/components/TeamCard.tsx
git commit -m "feat: restyle team cards with editorial theme"
```

---

## Task 7: Update Home Page

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Read current page.tsx**

Run: Read the file to see current structure

**Step 2: Update home page with contextual header**

The home page should have a contextual header area. Update `src/app/page.tsx` to include:

```tsx
import { createClient } from '@/lib/supabase/server'
import { TeamList } from '@/components/TeamList'
import { Team } from '@/lib/types/database'

export default async function Home() {
  const supabase = await createClient()

  const { data: teams, error } = await supabase
    .from('teams')
    .select('*')
    .order('school')

  if (error) {
    console.error('Error fetching teams:', error)
  }

  return (
    <div className="p-8">
      {/* Page Header */}
      <header className="mb-8">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          All Teams
        </h1>
        <p className="text-[var(--text-secondary)] mt-2">
          2024 Season · {teams?.length || 0} FBS Programs
        </p>
      </header>

      {/* Team Grid */}
      <TeamList teams={(teams as Team[]) || []} />
    </div>
  )
}
```

**Step 3: Update TeamList for grid styling**

Modify `src/components/TeamList.tsx` to use the new grid class:

```tsx
'use client'

import { useState } from 'react'
import { Team } from '@/lib/types/database'
import { TeamCard } from './TeamCard'
import { TeamSearch } from './TeamSearch'

interface TeamListProps {
  teams: Team[]
}

export function TeamList({ teams }: TeamListProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredTeams = teams.filter((team) =>
    team.school.toLowerCase().includes(searchQuery.toLowerCase()) ||
    team.conference?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div>
      <div className="mb-6">
        <TeamSearch value={searchQuery} onChange={setSearchQuery} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredTeams.map((team) => (
          <TeamCard key={team.id} team={team} />
        ))}
      </div>
      {filteredTeams.length === 0 && (
        <p className="text-center text-[var(--text-muted)] py-12">
          No teams found matching "{searchQuery}"
        </p>
      )}
    </div>
  )
}
```

**Step 4: Update TeamSearch styling**

Modify `src/components/TeamSearch.tsx`:

```tsx
'use client'

import { MagnifyingGlass } from '@phosphor-icons/react'

interface TeamSearchProps {
  value: string
  onChange: (value: string) => void
}

export function TeamSearch({ value, onChange }: TeamSearchProps) {
  return (
    <div className="relative max-w-md">
      <MagnifyingGlass
        size={20}
        weight="thin"
        className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
      />
      <input
        type="text"
        placeholder="Search teams or conferences..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-10 pr-4 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-run)] focus:border-transparent"
      />
    </div>
  )
}
```

**Step 5: Run dev to verify**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run dev
```

Expected: Home page shows editorial header with team grid

**Step 6: Commit**

```bash
git add src/app/page.tsx src/components/TeamList.tsx src/components/TeamSearch.tsx
git commit -m "feat: update home page and team list with editorial styling"
```

---

## Task 8: Update Metrics Cards with Animations

**Files:**
- Modify: `src/components/team/MetricsCards.tsx`
- Create: `src/hooks/useCountUp.ts`

**Step 1: Create count-up animation hook**

Create `src/hooks/useCountUp.ts`:

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'

interface UseCountUpOptions {
  duration?: number
  decimals?: number
  startOnMount?: boolean
}

export function useCountUp(
  endValue: number,
  options: UseCountUpOptions = {}
) {
  const { duration = 800, decimals = 0, startOnMount = true } = options
  const [displayValue, setDisplayValue] = useState(startOnMount ? 0 : endValue)
  const [hasAnimated, setHasAnimated] = useState(false)
  const frameRef = useRef<number>()

  useEffect(() => {
    if (!startOnMount || hasAnimated) return

    const startTime = performance.now()
    const startValue = 0

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Ease out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const currentValue = startValue + (endValue - startValue) * easeOut

      setDisplayValue(currentValue)

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate)
      } else {
        setHasAnimated(true)
      }
    }

    frameRef.current = requestAnimationFrame(animate)

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
      }
    }
  }, [endValue, duration, startOnMount, hasAnimated])

  const formatted = decimals > 0
    ? displayValue.toFixed(decimals)
    : Math.round(displayValue).toString()

  return formatted
}
```

**Step 2: Update MetricsCards with new styling and animations**

Replace `src/components/team/MetricsCards.tsx`:

```tsx
'use client'

import { TeamSeasonEpa } from '@/lib/types/database'
import { formatRank } from '@/lib/utils'
import { useCountUp } from '@/hooks/useCountUp'
import { Info, TrendDown, TrendUp } from '@phosphor-icons/react'

interface MetricsCardsProps {
  metrics: TeamSeasonEpa
}

interface MetricCardProps {
  label: string
  value: number
  decimals?: number
  suffix?: string
  rank?: number
  tooltip?: string
  trend?: 'positive' | 'negative' | 'neutral'
}

function MetricCard({ label, value, decimals = 3, suffix = '', rank, tooltip, trend }: MetricCardProps) {
  const displayValue = useCountUp(value, { decimals, duration: 800 })

  const valueColorClass = trend === 'positive'
    ? 'text-[var(--color-positive)]'
    : trend === 'negative'
    ? 'text-[var(--color-negative)]'
    : 'text-[var(--text-primary)]'

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-[var(--text-muted)]">{label}</p>
        {tooltip && (
          <button
            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            aria-label={`Info about ${label}`}
            title={tooltip}
          >
            <Info size={16} weight="thin" />
          </button>
        )}
      </div>

      <p className={`font-headline text-4xl ${valueColorClass} underline-sketch inline-block`}>
        {displayValue}{suffix}
      </p>

      {rank && (
        <div className="flex items-center gap-1 mt-3 text-sm text-[var(--text-secondary)]">
          {rank <= 50 ? (
            <TrendUp size={14} weight="thin" className="text-[var(--color-positive)]" />
          ) : rank > 100 ? (
            <TrendDown size={14} weight="thin" className="text-[var(--color-negative)]" />
          ) : null}
          <span>{formatRank(rank)} nationally</span>
        </div>
      )}
    </div>
  )
}

export function MetricsCards({ metrics }: MetricsCardsProps) {
  const epaTrend = metrics.epa_per_play > 0 ? 'positive' : metrics.epa_per_play < -0.05 ? 'negative' : 'neutral'
  const successTrend = metrics.success_rate > 0.45 ? 'positive' : metrics.success_rate < 0.4 ? 'negative' : 'neutral'

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        label="EPA per Play"
        value={metrics.epa_per_play}
        decimals={3}
        rank={metrics.off_epa_rank}
        tooltip="Expected Points Added per play measures offensive efficiency"
        trend={epaTrend}
      />
      <MetricCard
        label="Success Rate"
        value={metrics.success_rate * 100}
        decimals={1}
        suffix="%"
        tooltip="Percentage of plays that are considered successful"
        trend={successTrend}
      />
      <MetricCard
        label="Explosiveness"
        value={metrics.explosiveness}
        decimals={3}
        tooltip="Average EPA on successful plays"
      />
      <MetricCard
        label="Games Played"
        value={metrics.games}
        decimals={0}
      />
    </div>
  )
}
```

**Step 3: Run dev to verify animations**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run dev
```

Expected: Metrics cards show with count-up animation on load

**Step 4: Commit**

```bash
mkdir -p src/hooks
git add src/hooks/useCountUp.ts src/components/team/MetricsCards.tsx
git commit -m "feat: add animated metrics cards with count-up effect"
```

---

## Task 9: Update Team Detail Page

**Files:**
- Modify: `src/app/teams/[slug]/page.tsx`

**Step 1: Update team page with contextual header**

Replace `src/app/teams/[slug]/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Team, TeamSeasonEpa, TeamStyleProfile, TeamSeasonTrajectory, DrivePattern } from '@/lib/types/database'
import { MetricsCards } from '@/components/team/MetricsCards'
import { StyleProfile } from '@/components/team/StyleProfile'
import { DrivePatterns } from '@/components/visualizations/DrivePatterns'

interface TeamPageProps {
  params: Promise<{ slug: string }>
}

async function getTeamBySlug(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never, slug: string): Promise<Team | null> {
  const { data: teams } = await supabase.from('teams').select('*')

  return teams?.find((team: Team) => {
    const teamSlug = team.school.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    return teamSlug === slug
  }) || null
}

export default async function TeamPage({ params }: TeamPageProps) {
  const { slug } = await params
  const supabase = await createClient()

  const team = await getTeamBySlug(supabase, slug)

  if (!team) {
    notFound()
  }

  const currentSeason = 2024

  const [metricsResult, styleResult, trajectoryResult, drivesResult] = await Promise.all([
    supabase
      .from('team_epa_season')
      .select('*')
      .eq('team', team.school)
      .eq('season', currentSeason)
      .single(),
    supabase
      .from('team_style_profile')
      .select('*')
      .eq('team', team.school)
      .eq('season', currentSeason)
      .single(),
    supabase
      .from('team_season_trajectory')
      .select('*')
      .eq('team', team.school)
      .order('season', { ascending: true }),
    supabase.rpc('get_drive_patterns', {
      p_team: team.school,
      p_season: currentSeason
    })
  ])

  const metrics = metricsResult.data as TeamSeasonEpa | null
  const style = styleResult.data as TeamStyleProfile | null
  const trajectory = trajectoryResult.data as TeamSeasonTrajectory[] | null
  const drives = drivesResult.data as DrivePattern[] | null

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
    </div>
  )
}
```

**Step 2: Run dev to verify**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run dev
```

Expected: Team detail page shows with new editorial styling

**Step 3: Commit**

```bash
git add src/app/teams/[slug]/page.tsx
git commit -m "feat: update team detail page with editorial styling"
```

---

## Task 10: Update Style Profile Component

**Files:**
- Modify: `src/components/team/StyleProfile.tsx`

**Step 1: Restyle StyleProfile with editorial theme**

Replace `src/components/team/StyleProfile.tsx`:

```tsx
'use client'

import { TeamStyleProfile as StyleData } from '@/lib/types/database'
import { useCountUp } from '@/hooks/useCountUp'

interface StyleProfileProps {
  style: StyleData
}

function IdentityBadge({ identity }: { identity: string }) {
  const labels: Record<string, string> = {
    run_heavy: 'Run Heavy',
    balanced: 'Balanced',
    pass_heavy: 'Pass Heavy',
  }

  return (
    <span className="px-3 py-1.5 bg-[var(--bg-surface-alt)] border border-[var(--border)] rounded text-sm text-[var(--text-secondary)]">
      {labels[identity] || identity}
    </span>
  )
}

function TempoBadge({ tempo }: { tempo: string }) {
  const labels: Record<string, string> = {
    up_tempo: 'Up Tempo',
    balanced: 'Balanced Tempo',
    slow: 'Slow Tempo',
  }

  return (
    <span className="px-3 py-1.5 bg-[var(--bg-surface-alt)] border border-[var(--border)] rounded text-sm text-[var(--text-secondary)]">
      {labels[tempo] || tempo}
    </span>
  )
}

function AnimatedValue({ value, decimals = 3 }: { value: number | null; decimals?: number }) {
  const displayValue = useCountUp(value || 0, { decimals, duration: 600 })

  if (value === null || value === undefined) {
    return <span className="text-[var(--text-muted)]">N/A</span>
  }

  const colorClass = value > 0
    ? 'text-[var(--color-positive)]'
    : value < 0
    ? 'text-[var(--color-negative)]'
    : 'text-[var(--text-primary)]'

  return <span className={colorClass}>{displayValue}</span>
}

export function StyleProfile({ style }: StyleProfileProps) {
  const runPercent = Math.round(style.run_rate * 100)
  const passPercent = Math.round(style.pass_rate * 100)

  return (
    <div className="card p-6">
      {/* Badges Row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <IdentityBadge identity={style.offensive_identity} />
        <TempoBadge tempo={style.tempo_category} />
        <span className="text-sm text-[var(--text-muted)]">
          {style.plays_per_game.toFixed(1)} plays/game
        </span>
      </div>

      {/* Run/Pass Balance Bar */}
      <div className="mb-8">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-[var(--text-secondary)]">Run {runPercent}%</span>
          <span className="text-[var(--text-secondary)]">Pass {passPercent}%</span>
        </div>
        <div className="h-3 rounded overflow-hidden flex border border-[var(--border)]">
          <div
            className="transition-all duration-500 ease-out"
            style={{
              width: `${runPercent}%`,
              backgroundColor: 'var(--color-run)'
            }}
            role="img"
            aria-label={`Run rate: ${runPercent}%`}
          />
          <div
            className="transition-all duration-500 ease-out"
            style={{
              width: `${passPercent}%`,
              backgroundColor: 'var(--color-pass)'
            }}
            role="img"
            aria-label={`Pass rate: ${passPercent}%`}
          />
        </div>
      </div>

      {/* EPA Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Rushing Column */}
        <div className="border-l-2 border-[var(--color-run)] pl-4">
          <h4 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-4">Rushing</h4>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-[var(--text-muted)]">Offense EPA</p>
              <p className="font-headline text-2xl">
                <AnimatedValue value={style.epa_rushing} />
              </p>
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Defense EPA</p>
              <p className="font-headline text-2xl">
                <AnimatedValue value={style.def_epa_vs_run} />
              </p>
            </div>
          </div>
        </div>

        {/* Passing Column */}
        <div className="border-l-2 border-[var(--color-pass)] pl-4">
          <h4 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-4">Passing</h4>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-[var(--text-muted)]">Offense EPA</p>
              <p className="font-headline text-2xl">
                <AnimatedValue value={style.epa_passing} />
              </p>
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Defense EPA</p>
              <p className="font-headline text-2xl">
                <AnimatedValue value={style.def_epa_vs_pass} />
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Run dev to verify**

Run:
```bash
cd /Users/robstover/Development/personal/cfb-app && npm run dev
```

Expected: Style profile shows with new editorial styling and animations

**Step 3: Commit**

```bash
git add src/components/team/StyleProfile.tsx
git commit -m "feat: update style profile with editorial theme and animations"
```

---

## Task 11: Run Final Build and Lint

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

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address lint and build issues"
```

---

## Summary

This implementation plan covers:

1. **Dependencies**: Phosphor icons, Rough.js
2. **Fonts**: Libre Baskerville + DM Sans via next/font
3. **Design tokens**: CSS custom properties with light/dark mode
4. **Sidebar**: Collapsible navigation with Phosphor icons
5. **Team cards**: Editorial styling with hover effects
6. **Metrics cards**: Count-up animations, trend indicators
7. **Style profile**: Run/pass bar, EPA grid with animations
8. **Team detail page**: Contextual header, section layout

**Not yet implemented** (future tasks):
- Rough.js integration for Drive Patterns
- Historical Trajectory chart
- Paper texture overlay
- Full theme toggle functionality
- AI-generated team logos
