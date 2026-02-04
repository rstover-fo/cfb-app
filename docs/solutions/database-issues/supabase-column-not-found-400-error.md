---
title: "Games Page 400 Error - Invalid Column Selection in Supabase Query"
tags:
  - supabase
  - postgrest
  - schema-mismatch
  - cfb-360
  - debugging
  - nextjs
category: database-issues
module: src/lib/queries/games.ts
symptoms:
  - "Something went wrong" error on Games page
  - 400 Bad Request from /rest/v1/games endpoint
  - PostgREST column selection error
  - Page loads but displays error boundary
created: 2026-02-04
---

# Supabase Query 400 Error - Non-Existent Column Selection

## Problem Symptom

After merging a PR, the Games page displayed "Something went wrong" with Error ID shown. The page had been working in development but failed in production.

## Investigation Steps

1. **Checked Supabase API logs** - Found 400 errors on `/rest/v1/games` endpoint
2. **Examined the failing query URL** - Saw it was selecting `home_conference` and `away_conference`
3. **Verified database schema** - These columns don't exist in the `games` table
4. **Traced the code** - Found the columns defined in `GAME_COLUMNS` constant and `GameWithTeams` interface

## Root Cause

The `games` table schema does not include `home_conference` or `away_conference` columns. These columns were assumed to exist based on the planning document but were never part of the actual schema. Conference information is stored in the `teams_with_logos` table.

**Actual `games` table columns:**
```
id, season, week, start_date, home_team, home_points, away_team,
away_points, completed, conference_game, neutral_site
```

**What the code expected:**
```
id, season, week, start_date, home_team, away_team, home_points,
away_points, home_conference, away_conference, conference_game, completed
```

PostgREST returns 400 Bad Request when you select columns that don't exist.

## Solution

### 1. Remove non-existent columns from query

**File:** `src/lib/queries/games.ts`

```typescript
// Before (broken)
const GAME_COLUMNS = `
  id, season, week, start_date, home_team, away_team,
  home_points, away_points, home_conference, away_conference,
  conference_game, completed
`

// After (fixed)
const GAME_COLUMNS = `
  id, season, week, start_date, home_team, away_team,
  home_points, away_points, conference_game, completed
`
```

### 2. Update TypeScript interface

```typescript
// Before
export interface GameWithTeams {
  // ...
  home_conference: string | null
  away_conference: string | null
  // ...
}

// After - removed conference fields
export interface GameWithTeams {
  id: number
  season: number
  week: number
  start_date: string
  home_team: string
  away_team: string
  home_points: number
  away_points: number
  conference_game: boolean
  completed: boolean
  homeLogo: string | null
  homeColor: string | null
  awayLogo: string | null
  awayColor: string | null
}
```

### 3. Move conference filtering to in-memory

Since conference data lives in `teams_with_logos`, use the team lookup for filtering:

```typescript
// Add conference to team lookup
export interface TeamLookupData {
  logo: string | null
  color: string | null
  conference: string | null  // Added
}

// Filter in-memory instead of at database level
return (data ?? [])
  .filter(g => teamLookup.has(g.home_team) && teamLookup.has(g.away_team))
  .filter(g => {
    if (!filter.conference) return true
    const homeConf = teamLookup.get(g.home_team)?.conference
    const awayConf = teamLookup.get(g.away_team)?.conference
    return homeConf === filter.conference || awayConf === filter.conference
  })
```

## Verification

1. **Check Supabase logs** - Should see 200 responses instead of 400
2. **Test the page** - Games page should load without error
3. **Test conference filter** - Should correctly filter by conference using team data

```sql
-- Verify actual schema
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'games';
```

## Prevention

1. **Generate TypeScript types from Supabase schema**
   ```bash
   npx supabase gen types typescript --project-id YOUR_ID > src/types/database.ts
   ```

2. **Verify columns exist before writing queries**
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'your_table';
   ```

3. **Add integration tests that run actual queries against test database**

4. **Use explicit column selection (not `select('*')`)** - makes it clear what's expected

## Related Issues

- Logo rendering also failed due to missing Next.js image domain config
- Week tabs UI needed improvement for post-season organization

## Commits

- `da65097` - fix(games): remove non-existent home_conference/away_conference columns
- `8acbf4b` - fix(games): add ESPN image domains and improve week tabs UI

## Key Lesson

> PostgREST returns 400 (not 404 or 500) for invalid column selection. Check API logs when you see generic "Something went wrong" errors - the URL will show exactly which columns are problematic.
