# Debug: Situational Data Not Loading in Production

**Issue:** The Situational tab shows "Down & distance data not available" even though the `get_down_distance_splits` RPC exists in production Supabase.

**Root Cause Candidates:**
1. RPC returning an error (check `downDistanceResult.error`)
2. RPC returning empty array (data exists but no matches)
3. Team name mismatch between `teams.school` and `core.plays.offense`
4. Schema permissions - RPC might not have access to `core.plays`

---

## Task 1: Add Debug Logging

**Files:** `src/app/teams/[slug]/page.tsx`

Add temporary console.log to see what the RPC returns:

```tsx
const downDistanceResult = await supabase.rpc('get_down_distance_splits', {
  p_team: team.school,
  p_season: currentSeason
})
console.log('Down distance result:', {
  team: team.school,
  error: downDistanceResult.error,
  dataLength: downDistanceResult.data?.length,
  data: downDistanceResult.data?.slice(0, 2) // first 2 rows
})
```

Deploy to Vercel, check Function Logs for the output.

---

## Task 2: Test RPC Directly in Supabase

Run in SQL editor with exact team name from the app:

```sql
-- Check exact team names in plays table
SELECT DISTINCT offense FROM core.plays WHERE offense ILIKE '%alabama%' LIMIT 5;

-- Test RPC with exact name
SELECT * FROM get_down_distance_splits('Alabama', 2024);
```

If team name differs (e.g., "Alabama Crimson Tide" vs "Alabama"), that's the issue.

---

## Task 3: Fix Team Name Matching (if needed)

If names don't match, update the RPC to handle variations:

```sql
-- Option A: Use ILIKE matching
WHERE p.offense ILIKE p_team || '%'

-- Option B: Create a mapping table
-- Option C: Normalize team names in both tables
```

---

## Task 4: Verify Schema Permissions

Check that the function has access to `core` schema:

```sql
-- Check function owner and permissions
SELECT proname, proowner::regrole, proacl
FROM pg_proc
WHERE proname = 'get_down_distance_splits';

-- Grant if needed
GRANT USAGE ON SCHEMA core TO anon, authenticated;
GRANT SELECT ON core.plays TO anon, authenticated;
GRANT SELECT ON core.games TO anon, authenticated;
```

---

## Task 5: Remove Debug Logging

Once fixed, remove the console.log statements and deploy clean version.

---

## Quick Verification

After each fix, test with:
```
https://your-app.vercel.app/teams/alabama
```

Click Situational tab - should show heatmaps with data.
