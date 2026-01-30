# UI Refresh Phase 2 Design

**Date**: 2026-01-30
**Status**: Approved
**Builds on**: `2026-01-30-ui-refresh-design.md` (Phase 1 complete)

## Overview

Complete the remaining UI refresh features: Rough.js visualizations, functional theme toggle, and paper texture overlay.

---

## 1. Drive Patterns - Rough.js Integration

### Changes
Replace standard SVG paths with Rough.js-rendered arcs for hand-drawn aesthetic.

### Updated Outcome Colors (Editorial Palette)
| Outcome | Color Variable | Hex |
|---------|---------------|-----|
| Touchdown | `--color-positive` | #4A7A5C |
| Field Goal | `--color-field-goal` | #5A7AC4 |
| Punt | `--color-neutral` | #6B635A |
| Turnover | `--color-negative` | #A65A5A |
| Turnover on Downs | `--color-run` | #C47A5A |
| End of Half | `--color-pass` | #5C5A7A |

### Rough.js Settings
```js
{
  roughness: 0.6,
  strokeWidth: 2,
  bowing: 0.8
}
```

### Animation
- Arcs animate by outcome group (touchdowns first, then field goals, etc.)
- 150ms stagger between arcs within each group
- Uses CSS `stroke-dasharray` + `stroke-dashoffset` for draw effect

### Filter Buttons
Updated to editorial style:
```css
.filter-btn {
  border: 1.5px solid var(--border);
  border-radius: 2px;
}
.filter-btn.active {
  background: var(--bg-surface-alt);
  border-color: var(--color-run);
}
```

---

## 2. Historical Trajectory Chart

### New Component
`src/components/team/TrajectoryChart.tsx`

### Data Source
`team_season_trajectory` table (already fetched on team detail page)

### Metrics (Toggle Between)
- **Wins** (default)
- **EPA** (offensive efficiency)
- **National Rank**

### Rough.js Rendering
```js
// Line
rc.linearPath(points, {
  roughness: 0.5,
  bowing: 0.3,
  stroke: 'var(--color-run)',
  strokeWidth: 2
})

// Data points
rc.circle(x, y, 8, {
  fill: 'var(--bg-surface)',
  stroke: 'var(--color-run)'
})
```

### Animation
- Line draws left-to-right over 800ms
- Points fade in as line reaches them
- Metric toggle triggers full redraw animation

### Empty State
Muted text: "Historical data not available for this team."

---

## 3. Theme Toggle

### New Hook
`src/hooks/useTheme.ts`

```ts
interface UseThemeReturn {
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  resolvedTheme: 'light' | 'dark'
}
```

### Storage
- Key: `cfb-theme`
- Values: `'light'` | `'dark'` | `'system'`
- Default: `'system'` (follows OS preference)

### Implementation

1. **ThemeProvider** in `layout.tsx`:
   - Inline script prevents flash (reads localStorage before hydration)
   - Sets `data-theme` attribute on `<html>`

2. **Updated ThemeToggle.tsx**:
   - Cycles: System → Light → Dark → System
   - Shows icon (Sun/Moon) + label ("System", "Light", "Dark")

3. **CSS changes** in `globals.css`:
```css
[data-theme="dark"] {
  --bg-primary: #1A1814;
  --bg-surface: #252019;
  /* ... other dark tokens */
}

/* Fallback for system preference when no explicit choice */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --bg-primary: #1A1814;
    /* ... */
  }
}
```

---

## 4. Paper Texture Overlay

### New Component
`src/components/PaperTexture.tsx`

### Implementation
SVG filter using `feTurbulence` for procedural noise:

```tsx
<svg style={{ position: 'absolute', width: 0, height: 0 }}>
  <filter id="grain">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" />
    <feColorMatrix type="saturate" values="0" />
  </filter>
</svg>

<div className="paper-texture" />
```

### CSS
```css
:root {
  --paper-opacity: 0.07;
}

[data-theme="dark"] {
  --paper-opacity: 0.04;
}

.paper-texture {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  filter: url(#grain);
  opacity: var(--paper-opacity);
  mix-blend-mode: multiply;
}

[data-theme="dark"] .paper-texture {
  mix-blend-mode: overlay;
}
```

### Tuning
`--paper-opacity` exposed as CSS variable for easy adjustment in dev tools. Starting at 7% light / 4% dark.

---

## Files to Create/Modify

### New Files
- `src/hooks/useTheme.ts`
- `src/components/PaperTexture.tsx`
- `src/components/team/TrajectoryChart.tsx`

### Modified Files
- `src/app/layout.tsx` (ThemeProvider, PaperTexture)
- `src/app/globals.css` (theme selectors, paper texture styles)
- `src/components/ThemeToggle.tsx` (functional toggle)
- `src/components/Sidebar.tsx` (update ThemeToggle usage)
- `src/components/visualizations/DrivePatterns.tsx` (Rough.js)
- `src/components/visualizations/FootballField.tsx` (editorial colors)
- `src/app/teams/[slug]/page.tsx` (use TrajectoryChart)

---

## Implementation Order

1. **Theme Toggle** - Foundation for testing both modes
2. **Paper Texture** - Quick win, applies globally
3. **Drive Patterns** - Rough.js integration
4. **Trajectory Chart** - New component with Rough.js

---

## Dependencies

Already installed:
- `roughjs` (from Phase 1)
- `@phosphor-icons/react` (from Phase 1)

No new dependencies needed.
