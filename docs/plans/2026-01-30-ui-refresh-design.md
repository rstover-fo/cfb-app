# CFB Team 360 UI Refresh Design

**Date**: 2026-01-30
**Status**: Approved
**Inspiration**: Happycapy editorial aesthetic

## Overview

Complete visual refresh of cfb-app with a "vintage sports journalism" aesthetic featuring hand-drawn illustrations, warm editorial colors, and animated data presentation.

### Key Design Decisions

| Decision | Choice |
|----------|--------|
| Visual Style | Editorial / hand-drawn / pencil-sketch |
| Team Logos | AI-generated pencil-sketch batch (indexed in `ref.teams__logos`) |
| Typography | Libre Baskerville (headlines) + DM Sans (body) |
| Icons | Phosphor thin |
| Color Approach | Muted semantic colors on warm cream |
| Dark Mode | Inverted editorial (warm charcoal, not pure black) |
| Animation Level | "Data comes alive" for prebuilt features |
| Future: Ad-hoc exploration | Full interactive experience |

---

## 1. Foundation: Design Tokens

### Color Tokens

```css
/* Light Mode */
--bg-primary: #F5F0E8;       /* Cream - main background */
--bg-surface: #FFFFFF;       /* White - cards, elevated surfaces */
--bg-surface-alt: #EDE8DF;   /* Darker cream - subtle sections */

--text-primary: #1A1814;     /* Near-black - headlines, emphasis */
--text-secondary: #4A4740;   /* Warm dark gray - body text */
--text-muted: #6B635A;       /* Warm medium gray - labels, captions */

--border: #D9D2C7;           /* Warm light gray - card borders, dividers */

/* Dark Mode (Inverted Editorial) */
--bg-primary: #1A1814;       /* Warm charcoal */
--bg-surface: #252019;       /* Deep brown */
--bg-surface-alt: #302920;   /* Slightly lighter */

--text-primary: #F5F0E8;     /* Cream */
--text-secondary: #C9C2B7;   /* Muted cream */
--text-muted: #8A847A;       /* Warm gray */

--border: #3D362E;           /* Subtle warm border */
```

### Semantic Colors (Both Modes)

```css
--color-run: #C47A5A;        /* Burnt sienna - rushing plays */
--color-pass: #5C5A7A;       /* Muted indigo - passing plays */
--color-positive: #4A7A5C;   /* Forest green - touchdowns, good outcomes */
--color-negative: #A65A5A;   /* Brick red - turnovers, bad outcomes */
--color-neutral: #6B635A;    /* Graphite - punts, neutral */
--color-field-goal: #5A7AC4; /* Muted blue - field goals */
```

### Typography

```css
--font-headline: 'Libre Baskerville', Georgia, serif;
--font-body: 'DM Sans', system-ui, sans-serif;

--text-4xl: 2.25rem;   /* Page titles */
--text-2xl: 1.5rem;    /* Section headers */
--text-xl: 1.25rem;    /* Card titles, large values */
--text-lg: 1.125rem;   /* Subheadings */
--text-base: 1rem;     /* Body */
--text-sm: 0.875rem;   /* Labels, captions */
```

### Shadows

```css
--shadow-soft: 0 4px 20px rgba(26, 24, 20, 0.08);
--shadow-hover: 0 8px 30px rgba(26, 24, 20, 0.12);
```

---

## 2. Sketch Aesthetic Treatment

### Paper Texture

Subtle noise/grain overlay on backgrounds:

```css
.bg-paper {
  background-image: url('/textures/paper-grain.png');
  background-blend-mode: multiply;
  opacity: 0.03;
}
```

### Hand-Drawn Borders

Use SVG filters or Rough.js for imperfect borders:

```css
.card-sketched {
  border: 1.5px solid var(--border);
  border-radius: 2px; /* Barely rounded */
  filter: url(#sketchy-filter);
}
```

### Line-Drawn Icons

Phosphor Icons (thin weight) - stroke-based, hand-drawn feel.

```bash
npm install @phosphor-icons/react
```

### Chart Styling with Rough.js

```bash
npm install roughjs
```

```js
import rough from 'roughjs';
// Renders SVG paths with sketchy, hand-drawn stroke
rc.path(arcPath, { roughness: 0.6, strokeWidth: 2, bowing: 0.8 });
```

---

## 3. Global Chrome: Sidebar + Header

### Collapsible Sidebar (240px expanded / 64px collapsed)

```
┌────────────────────────┐
│  [logo] CFB 360    [<] │  ← Collapse toggle
├────────────────────────┤
│  🔍 Search        ⌘K   │
├────────────────────────┤
│  🏠 Home               │  ← Selected: bg-surface-alt + left accent
│  🏈 Teams              │
│  📊 Rankings           │
│  ⚔️  Matchups          │
├────────────────────────┤
│  🧭 Explorations  soon │  ← Future feature badge
│  ⭐ Favorites          │
├────────────────────────┤
│  [spacer]              │
├────────────────────────┤
│  ☀️/🌙 Theme toggle    │
│  ⚙️  Settings          │
└────────────────────────┘
```

**Sidebar Icons (Phosphor Thin)**

| Menu Item | Phosphor Icon |
|-----------|---------------|
| Search | `MagnifyingGlass` |
| Home | `House` |
| Teams | `Football` |
| Rankings | `ListNumbers` |
| Matchups | `SwordsCrossed` |
| Explorations | `Compass` |
| Favorites | `Star` |
| Theme toggle | `Sun` / `Moon` |
| Settings | `GearSix` |

**Styling**

```css
.sidebar {
  background: var(--bg-surface);
  border-right: 1.5px solid var(--border);
  transition: width 200ms ease;
}

.nav-item.active {
  background: var(--bg-surface-alt);
  border-left: 3px solid var(--color-run);
}

.nav-icon {
  stroke-width: 1.5;
  color: var(--text-muted);
  width: 20px;
  height: 20px;
}
```

### Contextual Header

Page-specific header (app name lives in sidebar):

```
┌─────────────────────────────────────────────────────────────┐
│  Oklahoma                                      [Share] [⋮]  │
│  SEC · 2024 Season                                          │
│  ~~~~~~~~~~~~~~~~ (hand-drawn underline)                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Team Cards

Vintage trading card style for the teams grid.

```
┌─────────────────────────────────────┐
│     [Pencil-sketch team logo]       │
│            120 x 120                │
├─────────────────────────────────────┤
│         Oklahoma Sooners            │  ← Libre Baskerville
│         ~~~~~~~~~~~~~~~~~~          │  ← Hand-drawn underline
│              SEC                    │  ← DM Sans, muted
├─────────────────────────────────────┤
│  EPA        W-L        Rank         │
│  0.072      6-7        #85          │
└─────────────────────────────────────┘
```

**Styling**

```css
.team-card {
  background: var(--bg-surface);
  border: 1.5px solid var(--border);
  border-radius: 3px;
  padding: 24px;
  box-shadow: var(--shadow-soft);
  transition: all 200ms ease;
}

.team-card:hover {
  box-shadow: var(--shadow-hover);
  transform: translateY(-2px);
  border-color: var(--color-run);
}
```

**Grid Layout**

```css
.teams-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 24px;
}
```

**Logo Fallback**: Styled team initials in Libre Baskerville if logo missing.

---

## 5. Metrics Cards

KPI cards with high contrast and count-up animations.

```
┌─────────────────────────────────────┐
│  EPA per Play              ⓘ       │
│                                     │
│           0.072                     │  ← Animated count-up
│           ~~~~~                     │
│                                     │
│  ▼ 210th nationally                 │
└─────────────────────────────────────┘
```

**Typography Hierarchy**

| Element | Font | Size | Color |
|---------|------|------|-------|
| Label | DM Sans | `--text-sm` | `--text-muted` |
| Value | Libre Baskerville | `--text-4xl` | `--text-primary` |
| Context | DM Sans | `--text-sm` | `--text-secondary` |

**Value Colors**

```css
.metric-value.positive { color: var(--color-positive); }
.metric-value.negative { color: var(--color-negative); }
.metric-value.neutral { color: var(--text-primary); }
```

**Animation**

```js
useEffect(() => {
  animate(0, value, {
    duration: 800,
    easing: 'easeOut',
    onUpdate: (v) => setDisplayValue(v.toFixed(3))
  });
}, [value]);
```

---

## 6. Style Profile

Run/pass balance visualization with EPA breakdowns.

```
┌──────────────────────────────────────────────────────────┐
│   [Balanced]    [Balanced Tempo]      67.8 plays/game    │
│                                                          │
│   Run 51%  ████████████░░░░░░░░░░░░░░░░░░  Pass 46%      │
│            ← burnt sienna | muted indigo →               │
│                                                          │
├────────────────────────┬─────────────────────────────────┤
│     RUSHING            │         PASSING                 │
│     Offense EPA: 0.180 │         Offense EPA: 0.136      │
│     Defense EPA: -0.016│         Defense EPA: 0.278      │
└────────────────────────┴─────────────────────────────────┘
```

**Balance Bar Animation**: Segments grow from center outward (400ms ease-out).

**Visual Cues**:
- Rushing column: faint burnt sienna left border
- Passing column: faint muted indigo left border

---

## 7. Drive Patterns

Football field visualization with Rough.js sketch treatment.

**Filter Buttons**

```css
.filter-btn {
  background: transparent;
  border: 1.5px solid var(--border);
  border-radius: 2px;
  padding: 8px 16px;
}

.filter-btn.active {
  background: var(--bg-surface-alt);
  border-color: var(--color-run);
}
```

**Field Treatment**

| Element | Style |
|---------|-------|
| Field background | Subtle texture, muted green `#3D6B47` |
| Yard lines | Rough.js rendered, slight wobble |
| End zones | Crosshatch shading pattern |
| Field border | Hand-drawn frame |

**Drive Arcs (Rough.js)**

```js
rc.arc(x, y, width, height, startAngle, endAngle, false, {
  stroke: getOutcomeColor(outcome),
  strokeWidth: 2,
  roughness: 0.6,
  bowing: 0.8
});
```

**Hover Interaction**:
- Arc thickens
- Other arcs fade to 30% opacity
- Tooltip with drive details

**Animation**: Arcs draw sequentially (150ms stagger).

---

## 8. Historical Trajectory

Multi-season trend chart with hand-drawn line.

```
   Wins
    12 ┤                        ●
    10 ┤              ●                   ●
     8 ┤    ●                                     ●
     6 ┤                                               ●
       └────┴────┴────┴────┴────┴────┴────┴────┴────
          2019  2020  2021  2022  2023  2024

   [Wins]   [EPA]   [Rank]   ← Metric toggles
```

**Rough.js Line**

```js
rc.linearPath(points, {
  stroke: var(--color-run),
  strokeWidth: 2,
  roughness: 0.5,
  bowing: 0.3
});
```

**Animation**: Line draws left to right (800ms), points pop in as line reaches them.

**Empty State**: Pencil sketch of empty clipboard with "Historical data not yet available" message.

---

## Implementation Priority

| Priority | Component | Scope |
|----------|-----------|-------|
| 1 | Foundation tokens | Create CSS custom properties file |
| 2 | Typography setup | Add Libre Baskerville + DM Sans |
| 3 | Global chrome | Sidebar + contextual header |
| 4 | Team cards | Redesign grid cards |
| 5 | Metrics cards | High-contrast + animations |
| 6 | Style Profile | Run/pass balance redesign |
| 7 | Drive Patterns | Rough.js integration |
| 8 | Historical Trajectory | Fix broken section + new chart |

---

## Dependencies to Add

```bash
npm install @phosphor-icons/react roughjs
```

**Fonts** (via next/font or Google Fonts):
- Libre Baskerville (400, 700)
- DM Sans (400, 500, 700)

---

## Assets Needed

1. **Paper texture**: `/public/textures/paper-grain.png` (subtle noise pattern)
2. **SVG filter**: Sketchy border filter definition
3. **Team logos**: AI-generated pencil-sketch batch (future sprint)
4. **App logo**: Pencil-sketch "CFB 360" mark

---

## Future Considerations

- **Ad-hoc Exploration page**: Full interactive experience (separate design needed)
- **Team logo generation**: Batch generation with consistent prompt template
- **Storybook**: Component documentation once patterns stabilize
