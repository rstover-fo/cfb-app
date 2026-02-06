# Sprint: Polish, Optimization & Mobile Responsiveness

**Date:** 2026-02-06
**Status:** In Progress
**Goal:** Production polish pass — fix mobile layout, add error boundaries, optimize images, clean up console statements, and improve sidebar navigation.

## Context

All major features are built and functional (dashboard, games, teams, analytics, scatter plots, rankings, radar charts). This sprint focuses on production readiness.

---

## Tasks

### Task 1: Fix Mobile Responsive Layout
**Files:** `src/app/layout.tsx`, `src/components/Sidebar.tsx`
**Problem:** Hardcoded `ml-60` margin doesn't respond to sidebar collapse on mobile. No media queries to hide/reposition sidebar on small screens.
**Acceptance Criteria:**
- Sidebar collapses or hides on screens < 768px
- Main content fills full width on mobile
- Hamburger menu or similar pattern for mobile navigation
- No horizontal overflow on mobile viewports

### Task 2: Add Error Boundaries to Dashboard Widgets
**Files:** `src/app/page.tsx`, `src/components/dashboard/WidgetError.tsx`
**Problem:** `WidgetError` component exists but is never used. Widget query failures show generic error.
**Acceptance Criteria:**
- Each dashboard widget wrapped in error boundary
- Failed widgets show `WidgetError` component with retry option
- Other widgets continue to render when one fails

### Task 3: Replace `<img>` with Next.js `<Image />`
**Files:** 7 component files with `<img>` tags
**Problem:** Using raw `<img>` bypasses Next.js image optimization (lazy loading, format conversion, sizing).
**Acceptance Criteria:**
- All team logo `<img>` tags replaced with `<Image />` from `next/image`
- Proper width/height attributes set
- No visual regressions
- ESLint image warnings eliminated

### Task 4: Remove Console Statements
**Files:** `src/lib/queries/dashboard.ts`, `src/lib/queries/games.ts`, `src/components/GamesList.tsx`, `src/app/teams/page.tsx`, `src/app/error.tsx`
**Problem:** Console.error/log calls in production code.
**Acceptance Criteria:**
- All console.log/console.error statements removed or replaced with proper error handling
- Error boundary in `error.tsx` can keep console.error (standard Next.js pattern)
- No console output in normal app operation

### Task 5: Fix Sidebar Navigation - Remove Disabled Routes
**Files:** `src/components/Sidebar.tsx`
**Problem:** Sidebar has disabled links for `/rankings`, `/matchups`, `/explore`, `/favorites` that go nowhere.
**Acceptance Criteria:**
- Remove disabled route stubs that aren't planned for near-term
- Clean navigation with only working routes
- Optional: link `/rankings` to `/analytics` rankings view

### Task 6: Clean Up Unused Import
**Files:** `src/components/analytics/ScatterPlotClient.tsx`
**Problem:** Unused `DataPoint` type import.
**Acceptance Criteria:**
- Remove unused import
- No TypeScript errors after cleanup

---

## Validation

After all tasks complete:
1. `npm run typecheck` — no errors
2. `npm run test` — all tests pass
3. `npm run lint` — clean (zero warnings)
4. `npm run build` — successful production build
5. Manual: Test mobile viewport (320px, 375px, 768px), dark mode, all routes

---

## Parallel Execution Plan

**Wave 1 (no file conflicts):**
- Task 1 (Mobile layout) — touches `layout.tsx`, `Sidebar.tsx`
- Task 3 (Image optimization) — touches 7 component files
- Task 4 (Console cleanup) — touches query files and `error.tsx`

**Wave 2 (after Wave 1):**
- Task 2 (Error boundaries) — touches `page.tsx`
- Task 5 (Sidebar nav) — touches `Sidebar.tsx`
- Task 6 (Unused import) — touches `ScatterPlotClient.tsx`
