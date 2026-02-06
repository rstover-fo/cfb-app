---
title: "Mobile Responsive Sidebar & Polish Sprint"
date: 2026-02-06
author: Rob Stover
category: ui-bugs
tags:
  - mobile-responsive
  - error-boundaries
  - next-image
  - react-19
  - sidebar
  - dashboard
  - code-cleanup
status: completed
module: components/Sidebar, components/dashboard, app/layout
symptoms:
  - Sidebar not visible on mobile (hardcoded ml-60)
  - Dashboard crashes propagate to entire page (no error boundaries)
  - Raw img tags bypass Next.js optimization
  - console.error in production code
  - React 19 lint errors with useEffect+setState
pr: https://github.com/rstover-fo/cfb-app/pull/8
---

# Mobile Responsive Sidebar & Polish Sprint

## Problem

The CFB 360 dashboard had several polish issues blocking production readiness:

1. **Sidebar not mobile-responsive** - hardcoded `ml-60` margin, no hamburger menu, no overlay
2. **No error boundaries** - a single widget failure crashed the entire dashboard
3. **Raw `<img>` tags** - bypassed Next.js image optimization across 6 components
4. **Console statements in production** - `console.error` left in query files
5. **React 19 lint errors** - `useEffect + setState` and `useRef` during render patterns rejected

## Root Cause

- Sidebar was built desktop-first without mobile breakpoints
- Error boundaries require class components (not available via hooks)
- External ESPN CDN logos need `unoptimized` prop on `<Image>`
- React 19 strict lint rules flag synchronous setState in effects and ref access during render

## Solution

### 1. Mobile Responsive Sidebar

Use `translate-x` for mobile show/hide, `md:translate-x-0` for desktop always-visible:

```tsx
<aside className={`
  fixed left-0 top-0 h-full w-60
  ${collapsed ? 'md:w-16' : 'md:w-60'}
  ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
  md:translate-x-0
`}>
```

Hamburger button hidden on desktop:
```tsx
<button className="fixed top-3 left-3 z-50 md:hidden" />
```

Main content padding to avoid hamburger overlap:
```tsx
<main className="ml-0 pt-14 md:pt-0 md:ml-60">
```

Collapsed state only affects desktop labels:
```tsx
<span className={`text-sm ${collapsed ? 'md:hidden' : ''}`}>{label}</span>
```

### 2. React 19 State-Based Route Tracking

Instead of `useEffect + setState` (lint error) or `useRef` during render (lint error):

```tsx
const [prevPathname, setPrevPathname] = useState(pathname)
if (prevPathname !== pathname) {
  setPrevPathname(pathname)
  if (mobileOpen) setMobileOpen(false)
}
```

`useEffect` is safe for event listeners (async setState):
```tsx
useEffect(() => {
  if (!mobileOpen) return
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setMobileOpen(false)
  }
  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [mobileOpen])
```

### 3. Error Boundaries

Class component with `componentDidCatch` for dev-only logging:

```tsx
export class WidgetErrorBoundary extends Component<Props, State> {
  static getDerivedStateFromError() { return { hasError: true } }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (process.env.NODE_ENV === 'development') {
      console.error(`[WidgetErrorBoundary] ${this.props.title}:`, error, errorInfo)
    }
  }

  handleRetry = () => { this.setState({ hasError: false }) }
}
```

Wrap pattern: `ErrorBoundary > Suspense > Widget`:
```tsx
<WidgetErrorBoundary title="Top Movers">
  <Suspense fallback={<WidgetSkeleton title="Top Movers" rows={6} />}>
    <TopMoversWidget />
  </Suspense>
</WidgetErrorBoundary>
```

### 4. Next.js Image

Replace `<img>` with `<Image>` using `unoptimized` for external URLs:

```tsx
import Image from 'next/image'

<Image src={team.logo} alt="" width={24} height={24} unoptimized />
```

### 5. Code Cleanup

- Removed `console.error` from `dashboard.ts`, `games.ts`, `GamesList.tsx`, `teams/page.tsx`
- Removed unused `DataPoint` interface from `ScatterPlotClient.tsx`
- Removed disabled nav routes (`/rankings`, `/matchups`, `/explore`, `/favorites`)

## Prevention

### Mobile Responsive
- Default to mobile, override with `md:` for desktop
- Use `translate-x` for overlays, not conditional rendering
- Always add `pt-14 md:pt-0` when using fixed mobile headers
- Test at 375px, 768px, 1024px viewports

### React 19 Lint
- Use state-based tracking for "previous value" patterns
- Never `setState` inside `useEffect` synchronously
- Never access `useRef` during render phase
- `useEffect` is fine for event listeners with proper cleanup

### Error Boundaries
- Wrap every async/Suspense component in an error boundary
- Always implement `componentDidCatch` for logging
- Gate `console.error` behind `process.env.NODE_ENV === 'development'`

### Code Quality
- No `console.error` in production - errors caught by boundaries
- Run `npm run lint` before every commit
- Regular dead code audits

## Files Changed

| File | Change |
|------|--------|
| `Sidebar.tsx` | Mobile hamburger, backdrop, escape key, route auto-close |
| `layout.tsx` | `ml-0 pt-14 md:pt-0 md:ml-60` |
| `WidgetErrorBoundary.tsx` | New error boundary component |
| `page.tsx` (dashboard) | Wrapped 4 widgets in error boundaries |
| 6 component files | `<img>` to `<Image>` migration |
| 4 query/component files | Removed `console.error` |
| `ScatterPlotClient.tsx` | Removed unused `DataPoint` interface |

## Validation

- TypeScript: clean
- ESLint: 0 errors, 0 warnings
- Tests: 12/12 passing
- Build: successful
- Browser: all routes, widgets, theme toggle verified

## Related

- [Supabase Column Not Found](/docs/solutions/database-issues/supabase-column-not-found-400-error.md)
- [Sprint Plan](/docs/SPRINT_PLAN.md)
- [UI Refresh Implementation Plan](/docs/plans/2026-01-30-ui-refresh-implementation.md)
