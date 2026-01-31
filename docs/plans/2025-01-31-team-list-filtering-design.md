# Team List Filtering Design

## Problem

The home page shows ~1,900 teams when users primarily care about the 136 FBS programs. The flat alphabetical grid is overwhelming and lacks organization.

## Solution

Add division filtering (FBS by default) and conference tabs to organize teams logically.

## UI Structure

```
┌─────────────────────────────────────────────────────────┐
│  All Teams                                              │
│  2024 Season · 136 FBS Programs                         │
│                                                         │
│  ┌──────────┐                                           │
│  │ FBS  ▾   │  ← Division dropdown (FBS default)        │
│  └──────────┘                                           │
│                                                         │
│  [All] [SEC] [Big Ten] [Big 12] [ACC] ...              │
│                                                         │
│  ┌──────────────┐                                       │
│  │ 🔍 Search... │                                       │
│  └──────────────┘                                       │
│                                                         │
│  [Team Cards Grid]                                      │
└─────────────────────────────────────────────────────────┘
```

## Components

| Component | Status | Description |
|-----------|--------|-------------|
| `DivisionDropdown` | New | FBS/FCS/All selector |
| `ConferenceTabs` | New | Horizontal tabs, dynamic based on division |
| `TeamSearch` | Existing | Filters within current selection |
| `TeamList` | Modify | Add state management for filters |
| `TeamCard` | Existing | No changes |

## State Management

Client-side filtering in `TeamList.tsx`:

```typescript
const [division, setDivision] = useState<'fbs' | 'fcs' | 'all'>('fbs')
const [conference, setConference] = useState<string>('all')
const [searchQuery, setSearchQuery] = useState('')
```

**Filter chain:**
1. Filter by division (`classification === division`)
2. Filter by conference (if not 'all')
3. Filter by search query
4. Render grid

**Conference tabs derived from filtered division:**
```typescript
const conferences = [...new Set(
  teams
    .filter(t => division === 'all' || t.classification === division)
    .map(t => t.conference)
    .filter(Boolean)
)].sort()
```

When division changes, reset conference to 'all'.

## Styling

**Division Dropdown:**
```tsx
<select className="px-3 py-1.5 text-sm border-[1.5px] border-[var(--border)]
  rounded-sm bg-[var(--bg-surface)] text-[var(--text-secondary)]">
```

**Conference Tabs:**
- Match existing `TeamTabs.tsx` styling
- `border-[var(--color-run)]` for active state
- Horizontal scroll on mobile (`overflow-x-auto`)

**Header:**
- Dynamic: "{count} {division} Programs" or "{count} {conference} Teams"

## Edge Cases

- Empty search results: "No teams found matching '{query}'"
- Division change resets conference to 'all'
- Mobile: horizontal scroll for conference tabs

## Future Enhancements (not in scope)

- URL state persistence (`?division=fbs&conference=sec`)
- Remember user's last selection (localStorage)

## Files to Modify

1. `src/components/TeamList.tsx` - Add filtering state and logic
2. `src/app/page.tsx` - Update header for dynamic counts
3. New: `src/components/DivisionDropdown.tsx` (optional, can inline)
4. New: `src/components/ConferenceTabs.tsx` (optional, can inline)
