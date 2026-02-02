# Situational Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the four remaining situational analytics sub-tabs: Red Zone, Field Position, Home vs Away, and vs Conference.

**Architecture:** Each feature follows the same pattern: (1) Create Supabase RPC to aggregate play data, (2) Add TypeScript types, (3) Create view component, (4) Wire into SituationalView. All views show offense/defense side-by-side comparison with key metrics cards.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase RPC, existing CSS custom properties

---

## Task 1: Add TypeScript Types for All Features

**Files:**
- Modify: `src/lib/types/database.ts`

**Step 1: Add interfaces for all four features**

Add to the end of `src/lib/types/database.ts`:

```typescript
export interface RedZoneSplit {
  side: 'offense' | 'defense'
  trips: number
  touchdowns: number
  field_goals: number
  turnovers: number
  td_rate: number
  fg_rate: number
  scoring_rate: number
  points_per_trip: number
  epa_per_play: number
}

export interface FieldPositionSplit {
  zone: 'own_1_20' | 'own_21_50' | 'opp_49_21' | 'opp_20_1'
  zone_label: string
  side: 'offense' | 'defense'
  play_count: number
  success_rate: number
  epa_per_play: number
  yards_per_play: number
  scoring_rate: number
}

export interface HomeAwaySplit {
  location: 'home' | 'away'
  games: number
  wins: number
  win_pct: number
  points_per_game: number
  points_allowed_per_game: number
  epa_per_play: number
  success_rate: number
  yards_per_play: number
}

export interface ConferenceSplit {
  opponent_type: 'conference' | 'non_conference'
  games: number
  wins: number
  win_pct: number
  points_per_game: number
  points_allowed_per_game: number
  epa_per_play: number
  success_rate: number
  margin_per_game: number
}
```

**Step 2: Verify with build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/lib/types/database.ts
git commit -m "feat: add types for remaining situational features"
```

---

## Task 2: Create Red Zone RPC

**Files:**
- Supabase SQL Editor (manual)

**Step 1: Create the RPC in Supabase**

Run in Supabase SQL editor:

```sql
CREATE OR REPLACE FUNCTION get_red_zone_splits(
  p_team TEXT,
  p_season INT
)
RETURNS TABLE (
  side TEXT,
  trips BIGINT,
  touchdowns BIGINT,
  field_goals BIGINT,
  turnovers BIGINT,
  td_rate NUMERIC,
  fg_rate NUMERIC,
  scoring_rate NUMERIC,
  points_per_trip NUMERIC,
  epa_per_play NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH red_zone_drives AS (
    SELECT
      CASE WHEN d.offense = p_team THEN 'offense' ELSE 'defense' END AS side,
      d.id AS drive_id,
      d.scoring,
      d.drive_result,
      d.start_yardline
    FROM core.drives d
    JOIN core.games g ON d.game_id = g.id
    WHERE g.season = p_season
      AND (d.offense = p_team OR d.defense = p_team)
      AND d.start_yardline <= 20
      AND d.start_yardline > 0
  ),
  red_zone_plays AS (
    SELECT
      CASE WHEN p.offense = p_team THEN 'offense' ELSE 'defense' END AS side,
      p.epa
    FROM core.plays p
    JOIN core.games g ON p.game_id = g.id
    WHERE g.season = p_season
      AND (p.offense = p_team OR p.defense = p_team)
      AND p.yard_line <= 20
      AND p.yard_line > 0
  )
  SELECT
    rzd.side::TEXT,
    COUNT(DISTINCT rzd.drive_id)::BIGINT AS trips,
    COUNT(DISTINCT CASE WHEN rzd.drive_result = 'TD' THEN rzd.drive_id END)::BIGINT AS touchdowns,
    COUNT(DISTINCT CASE WHEN rzd.drive_result = 'FG' THEN rzd.drive_id END)::BIGINT AS field_goals,
    COUNT(DISTINCT CASE WHEN rzd.drive_result IN ('INT', 'FUMBLE', 'INT TD', 'FUMBLE TD') THEN rzd.drive_id END)::BIGINT AS turnovers,
    ROUND(COUNT(DISTINCT CASE WHEN rzd.drive_result = 'TD' THEN rzd.drive_id END)::NUMERIC / NULLIF(COUNT(DISTINCT rzd.drive_id), 0), 3) AS td_rate,
    ROUND(COUNT(DISTINCT CASE WHEN rzd.drive_result = 'FG' THEN rzd.drive_id END)::NUMERIC / NULLIF(COUNT(DISTINCT rzd.drive_id), 0), 3) AS fg_rate,
    ROUND(COUNT(DISTINCT CASE WHEN rzd.drive_result IN ('TD', 'FG') THEN rzd.drive_id END)::NUMERIC / NULLIF(COUNT(DISTINCT rzd.drive_id), 0), 3) AS scoring_rate,
    ROUND((COUNT(DISTINCT CASE WHEN rzd.drive_result = 'TD' THEN rzd.drive_id END) * 7 + COUNT(DISTINCT CASE WHEN rzd.drive_result = 'FG' THEN rzd.drive_id END) * 3)::NUMERIC / NULLIF(COUNT(DISTINCT rzd.drive_id), 0), 2) AS points_per_trip,
    ROUND((SELECT AVG(rzp.epa) FROM red_zone_plays rzp WHERE rzp.side = rzd.side)::NUMERIC, 3) AS epa_per_play
  FROM red_zone_drives rzd
  GROUP BY rzd.side;
END;
$$ LANGUAGE plpgsql;
```

**Step 2: Verify RPC works**

Run in SQL editor:
```sql
SELECT * FROM get_red_zone_splits('Alabama', 2024);
```

Expected: Returns 2 rows (offense, defense)

---

## Task 3: Create Field Position RPC

**Files:**
- Supabase SQL Editor (manual)

**Step 1: Create the RPC in Supabase**

Run in Supabase SQL editor:

```sql
CREATE OR REPLACE FUNCTION get_field_position_splits(
  p_team TEXT,
  p_season INT
)
RETURNS TABLE (
  zone TEXT,
  zone_label TEXT,
  side TEXT,
  play_count BIGINT,
  success_rate NUMERIC,
  epa_per_play NUMERIC,
  yards_per_play NUMERIC,
  scoring_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH zoned_plays AS (
    SELECT
      CASE
        WHEN p.offense = p_team THEN 'offense'
        ELSE 'defense'
      END AS side,
      CASE
        WHEN p.offense = p_team THEN
          CASE
            WHEN p.yard_line >= 80 THEN 'own_1_20'
            WHEN p.yard_line >= 50 THEN 'own_21_50'
            WHEN p.yard_line >= 20 THEN 'opp_49_21'
            ELSE 'opp_20_1'
          END
        ELSE
          CASE
            WHEN p.yard_line <= 20 THEN 'own_1_20'
            WHEN p.yard_line <= 50 THEN 'own_21_50'
            WHEN p.yard_line <= 80 THEN 'opp_49_21'
            ELSE 'opp_20_1'
          END
      END AS zone,
      p.epa,
      p.success,
      p.yards_gained,
      CASE WHEN p.scoring = true THEN 1 ELSE 0 END AS scored
    FROM core.plays p
    JOIN core.games g ON p.game_id = g.id
    WHERE g.season = p_season
      AND (p.offense = p_team OR p.defense = p_team)
      AND p.yard_line IS NOT NULL
  )
  SELECT
    zp.zone::TEXT,
    CASE zp.zone
      WHEN 'own_1_20' THEN 'Own 1-20'
      WHEN 'own_21_50' THEN 'Own 21-50'
      WHEN 'opp_49_21' THEN 'Opp 49-21'
      WHEN 'opp_20_1' THEN 'Red Zone'
    END::TEXT AS zone_label,
    zp.side::TEXT,
    COUNT(*)::BIGINT AS play_count,
    ROUND(AVG(zp.success::INT)::NUMERIC, 3) AS success_rate,
    ROUND(AVG(zp.epa)::NUMERIC, 3) AS epa_per_play,
    ROUND(AVG(zp.yards_gained)::NUMERIC, 1) AS yards_per_play,
    ROUND(AVG(zp.scored)::NUMERIC, 3) AS scoring_rate
  FROM zoned_plays zp
  GROUP BY zp.zone, zp.side
  ORDER BY zp.side,
    CASE zp.zone
      WHEN 'own_1_20' THEN 1
      WHEN 'own_21_50' THEN 2
      WHEN 'opp_49_21' THEN 3
      WHEN 'opp_20_1' THEN 4
    END;
END;
$$ LANGUAGE plpgsql;
```

**Step 2: Verify RPC works**

Run in SQL editor:
```sql
SELECT * FROM get_field_position_splits('Alabama', 2024);
```

Expected: Returns 8 rows (4 zones × 2 sides)

---

## Task 4: Create Home vs Away RPC

**Files:**
- Supabase SQL Editor (manual)

**Step 1: Create the RPC in Supabase**

Run in Supabase SQL editor:

```sql
CREATE OR REPLACE FUNCTION get_home_away_splits(
  p_team TEXT,
  p_season INT
)
RETURNS TABLE (
  location TEXT,
  games BIGINT,
  wins BIGINT,
  win_pct NUMERIC,
  points_per_game NUMERIC,
  points_allowed_per_game NUMERIC,
  epa_per_play NUMERIC,
  success_rate NUMERIC,
  yards_per_play NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH game_results AS (
    SELECT
      CASE
        WHEN g.home_team = p_team THEN 'home'
        ELSE 'away'
      END AS location,
      g.id AS game_id,
      CASE
        WHEN g.home_team = p_team THEN g.home_points
        ELSE g.away_points
      END AS points_for,
      CASE
        WHEN g.home_team = p_team THEN g.away_points
        ELSE g.home_points
      END AS points_against,
      CASE
        WHEN (g.home_team = p_team AND g.home_points > g.away_points) OR
             (g.away_team = p_team AND g.away_points > g.home_points)
        THEN 1 ELSE 0
      END AS won
    FROM core.games g
    WHERE g.season = p_season
      AND (g.home_team = p_team OR g.away_team = p_team)
      AND g.home_points IS NOT NULL
  ),
  play_stats AS (
    SELECT
      CASE
        WHEN g.home_team = p_team THEN 'home'
        ELSE 'away'
      END AS location,
      p.epa,
      p.success,
      p.yards_gained
    FROM core.plays p
    JOIN core.games g ON p.game_id = g.id
    WHERE g.season = p_season
      AND p.offense = p_team
  )
  SELECT
    gr.location::TEXT,
    COUNT(DISTINCT gr.game_id)::BIGINT AS games,
    SUM(gr.won)::BIGINT AS wins,
    ROUND(SUM(gr.won)::NUMERIC / NULLIF(COUNT(DISTINCT gr.game_id), 0), 3) AS win_pct,
    ROUND(AVG(gr.points_for)::NUMERIC, 1) AS points_per_game,
    ROUND(AVG(gr.points_against)::NUMERIC, 1) AS points_allowed_per_game,
    ROUND((SELECT AVG(ps.epa) FROM play_stats ps WHERE ps.location = gr.location)::NUMERIC, 3) AS epa_per_play,
    ROUND((SELECT AVG(ps.success::INT) FROM play_stats ps WHERE ps.location = gr.location)::NUMERIC, 3) AS success_rate,
    ROUND((SELECT AVG(ps.yards_gained) FROM play_stats ps WHERE ps.location = gr.location)::NUMERIC, 1) AS yards_per_play
  FROM game_results gr
  GROUP BY gr.location
  ORDER BY gr.location DESC;
END;
$$ LANGUAGE plpgsql;
```

**Step 2: Verify RPC works**

Run in SQL editor:
```sql
SELECT * FROM get_home_away_splits('Alabama', 2024);
```

Expected: Returns 2 rows (home, away)

---

## Task 5: Create vs Conference RPC

**Files:**
- Supabase SQL Editor (manual)

**Step 1: Create the RPC in Supabase**

Run in Supabase SQL editor:

```sql
CREATE OR REPLACE FUNCTION get_conference_splits(
  p_team TEXT,
  p_season INT
)
RETURNS TABLE (
  opponent_type TEXT,
  games BIGINT,
  wins BIGINT,
  win_pct NUMERIC,
  points_per_game NUMERIC,
  points_allowed_per_game NUMERIC,
  epa_per_play NUMERIC,
  success_rate NUMERIC,
  margin_per_game NUMERIC
) AS $$
DECLARE
  v_team_conference TEXT;
BEGIN
  -- Get team's conference
  SELECT conference INTO v_team_conference
  FROM teams
  WHERE school = p_team;

  RETURN QUERY
  WITH game_results AS (
    SELECT
      CASE
        WHEN opp.conference = v_team_conference THEN 'conference'
        ELSE 'non_conference'
      END AS opponent_type,
      g.id AS game_id,
      CASE
        WHEN g.home_team = p_team THEN g.home_points
        ELSE g.away_points
      END AS points_for,
      CASE
        WHEN g.home_team = p_team THEN g.away_points
        ELSE g.home_points
      END AS points_against,
      CASE
        WHEN (g.home_team = p_team AND g.home_points > g.away_points) OR
             (g.away_team = p_team AND g.away_points > g.home_points)
        THEN 1 ELSE 0
      END AS won
    FROM core.games g
    JOIN teams opp ON opp.school = CASE WHEN g.home_team = p_team THEN g.away_team ELSE g.home_team END
    WHERE g.season = p_season
      AND (g.home_team = p_team OR g.away_team = p_team)
      AND g.home_points IS NOT NULL
  ),
  play_stats AS (
    SELECT
      CASE
        WHEN opp.conference = v_team_conference THEN 'conference'
        ELSE 'non_conference'
      END AS opponent_type,
      p.epa,
      p.success
    FROM core.plays p
    JOIN core.games g ON p.game_id = g.id
    JOIN teams opp ON opp.school = CASE WHEN g.home_team = p_team THEN g.away_team ELSE g.home_team END
    WHERE g.season = p_season
      AND p.offense = p_team
  )
  SELECT
    gr.opponent_type::TEXT,
    COUNT(DISTINCT gr.game_id)::BIGINT AS games,
    SUM(gr.won)::BIGINT AS wins,
    ROUND(SUM(gr.won)::NUMERIC / NULLIF(COUNT(DISTINCT gr.game_id), 0), 3) AS win_pct,
    ROUND(AVG(gr.points_for)::NUMERIC, 1) AS points_per_game,
    ROUND(AVG(gr.points_against)::NUMERIC, 1) AS points_allowed_per_game,
    ROUND((SELECT AVG(ps.epa) FROM play_stats ps WHERE ps.opponent_type = gr.opponent_type)::NUMERIC, 3) AS epa_per_play,
    ROUND((SELECT AVG(ps.success::INT) FROM play_stats ps WHERE ps.opponent_type = gr.opponent_type)::NUMERIC, 3) AS success_rate,
    ROUND(AVG(gr.points_for - gr.points_against)::NUMERIC, 1) AS margin_per_game
  FROM game_results gr
  GROUP BY gr.opponent_type
  ORDER BY gr.opponent_type;
END;
$$ LANGUAGE plpgsql;
```

**Step 2: Verify RPC works**

Run in SQL editor:
```sql
SELECT * FROM get_conference_splits('Alabama', 2024);
```

Expected: Returns 2 rows (conference, non_conference)

---

## Task 6: Create RedZoneView Component

**Files:**
- Create: `src/components/team/RedZoneView.tsx`

**Step 1: Create the component**

Create `src/components/team/RedZoneView.tsx`:

```tsx
'use client'

import { RedZoneSplit } from '@/lib/types/database'

interface RedZoneViewProps {
  data: RedZoneSplit[] | null
}

function StatCard({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <div className="card p-4 text-center">
      <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">{label}</p>
      <p className="font-headline text-3xl text-[var(--text-primary)]">{value}</p>
      {subtext && <p className="text-xs text-[var(--text-secondary)] mt-1">{subtext}</p>}
    </div>
  )
}

function RedZoneSection({ title, data }: { title: string; data: RedZoneSplit }) {
  return (
    <div>
      <h3 className="font-headline text-lg text-[var(--text-primary)] mb-4">{title}</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Scoring Rate"
          value={`${(data.scoring_rate * 100).toFixed(0)}%`}
          subtext={`${data.touchdowns + data.field_goals} scores / ${data.trips} trips`}
        />
        <StatCard
          label="TD Rate"
          value={`${(data.td_rate * 100).toFixed(0)}%`}
          subtext={`${data.touchdowns} touchdowns`}
        />
        <StatCard
          label="FG Rate"
          value={`${(data.fg_rate * 100).toFixed(0)}%`}
          subtext={`${data.field_goals} field goals`}
        />
        <StatCard
          label="Pts/Trip"
          value={data.points_per_trip.toFixed(1)}
          subtext={`${data.epa_per_play.toFixed(2)} EPA/play`}
        />
      </div>
    </div>
  )
}

export function RedZoneView({ data }: RedZoneViewProps) {
  if (!data || data.length === 0) {
    return (
      <p className="text-[var(--text-muted)] text-center py-8">
        Red zone data not available for this team.
      </p>
    )
  }

  const offense = data.find(d => d.side === 'offense')
  const defense = data.find(d => d.side === 'defense')

  return (
    <div className="space-y-8">
      {offense && <RedZoneSection title="Offense (When in opponent's red zone)" data={offense} />}
      {defense && <RedZoneSection title="Defense (When opponent is in our red zone)" data={defense} />}
    </div>
  )
}
```

**Step 2: Verify with build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/team/RedZoneView.tsx
git commit -m "feat: add RedZoneView component"
```

---

## Task 7: Create FieldPositionView Component

**Files:**
- Create: `src/components/team/FieldPositionView.tsx`

**Step 1: Create the component**

Create `src/components/team/FieldPositionView.tsx`:

```tsx
'use client'

import { FieldPositionSplit } from '@/lib/types/database'

interface FieldPositionViewProps {
  data: FieldPositionSplit[] | null
}

function getZoneColor(epa: number): string {
  if (epa >= 0.15) return 'var(--color-positive)'
  if (epa >= 0) return 'var(--bg-surface-alt)'
  if (epa >= -0.15) return 'var(--color-neutral)'
  return 'var(--color-negative)'
}

function FieldZoneBar({ zones, side }: { zones: FieldPositionSplit[]; side: 'offense' | 'defense' }) {
  const sideZones = zones.filter(z => z.side === side)
  const orderedZones = ['own_1_20', 'own_21_50', 'opp_49_21', 'opp_20_1']

  return (
    <div>
      <h3 className="font-headline text-lg text-[var(--text-primary)] mb-4">
        {side === 'offense' ? 'Offense' : 'Defense'}
      </h3>

      {/* Field visualization */}
      <div className="card p-4 mb-4">
        <div className="flex gap-1 h-16 rounded overflow-hidden">
          {orderedZones.map(zoneId => {
            const zone = sideZones.find(z => z.zone === zoneId)
            if (!zone) return null
            return (
              <div
                key={zoneId}
                className="flex-1 flex flex-col items-center justify-center text-xs"
                style={{ backgroundColor: getZoneColor(zone.epa_per_play) }}
              >
                <span className="font-medium text-[var(--text-primary)]">
                  {(zone.success_rate * 100).toFixed(0)}%
                </span>
                <span className="text-[var(--text-muted)]">{zone.zone_label}</span>
              </div>
            )
          })}
        </div>
        <div className="flex justify-between text-xs text-[var(--text-muted)] mt-2">
          <span>← Own End Zone</span>
          <span>Opponent End Zone →</span>
        </div>
      </div>

      {/* Stats table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left py-2 text-[var(--text-muted)] font-normal">Zone</th>
              <th className="text-right py-2 text-[var(--text-muted)] font-normal">Plays</th>
              <th className="text-right py-2 text-[var(--text-muted)] font-normal">Success</th>
              <th className="text-right py-2 text-[var(--text-muted)] font-normal">EPA/Play</th>
              <th className="text-right py-2 text-[var(--text-muted)] font-normal">Yds/Play</th>
            </tr>
          </thead>
          <tbody>
            {orderedZones.map(zoneId => {
              const zone = sideZones.find(z => z.zone === zoneId)
              if (!zone) return null
              return (
                <tr key={zoneId} className="border-b border-[var(--border)]">
                  <td className="py-2 text-[var(--text-primary)]">{zone.zone_label}</td>
                  <td className="py-2 text-right text-[var(--text-secondary)]">{zone.play_count}</td>
                  <td className="py-2 text-right text-[var(--text-primary)]">
                    {(zone.success_rate * 100).toFixed(0)}%
                  </td>
                  <td className={`py-2 text-right ${zone.epa_per_play >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                    {zone.epa_per_play.toFixed(3)}
                  </td>
                  <td className="py-2 text-right text-[var(--text-secondary)]">
                    {zone.yards_per_play.toFixed(1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function FieldPositionView({ data }: FieldPositionViewProps) {
  if (!data || data.length === 0) {
    return (
      <p className="text-[var(--text-muted)] text-center py-8">
        Field position data not available for this team.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <FieldZoneBar zones={data} side="offense" />
      <FieldZoneBar zones={data} side="defense" />
    </div>
  )
}
```

**Step 2: Verify with build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/team/FieldPositionView.tsx
git commit -m "feat: add FieldPositionView component"
```

---

## Task 8: Create HomeAwayView Component

**Files:**
- Create: `src/components/team/HomeAwayView.tsx`

**Step 1: Create the component**

Create `src/components/team/HomeAwayView.tsx`:

```tsx
'use client'

import { House, AirplaneTilt } from '@phosphor-icons/react'
import { HomeAwaySplit } from '@/lib/types/database'

interface HomeAwayViewProps {
  data: HomeAwaySplit[] | null
}

function ComparisonRow({
  label,
  homeValue,
  awayValue,
  format = 'number',
  higherIsBetter = true
}: {
  label: string
  homeValue: number
  awayValue: number
  format?: 'number' | 'percent' | 'decimal'
  higherIsBetter?: boolean
}) {
  const formatValue = (v: number) => {
    if (format === 'percent') return `${(v * 100).toFixed(0)}%`
    if (format === 'decimal') return v.toFixed(3)
    return v.toFixed(1)
  }

  const homeBetter = higherIsBetter ? homeValue > awayValue : homeValue < awayValue
  const awayBetter = higherIsBetter ? awayValue > homeValue : awayValue < homeValue

  return (
    <div className="grid grid-cols-3 gap-4 py-3 border-b border-[var(--border)]">
      <div className={`text-right ${homeBetter ? 'text-[var(--color-positive)] font-medium' : 'text-[var(--text-secondary)]'}`}>
        {formatValue(homeValue)}
      </div>
      <div className="text-center text-[var(--text-muted)] text-sm">{label}</div>
      <div className={`text-left ${awayBetter ? 'text-[var(--color-positive)] font-medium' : 'text-[var(--text-secondary)]'}`}>
        {formatValue(awayValue)}
      </div>
    </div>
  )
}

export function HomeAwayView({ data }: HomeAwayViewProps) {
  if (!data || data.length === 0) {
    return (
      <p className="text-[var(--text-muted)] text-center py-8">
        Home/away data not available for this team.
      </p>
    )
  }

  const home = data.find(d => d.location === 'home')
  const away = data.find(d => d.location === 'away')

  if (!home || !away) {
    return (
      <p className="text-[var(--text-muted)] text-center py-8">
        Incomplete home/away data.
      </p>
    )
  }

  return (
    <div className="card p-6 max-w-2xl mx-auto">
      {/* Headers */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-right">
          <div className="flex items-center justify-end gap-2">
            <House size={20} weight="duotone" className="text-[var(--color-run)]" />
            <span className="font-headline text-lg text-[var(--text-primary)]">Home</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">{home.games} games</p>
        </div>
        <div />
        <div className="text-left">
          <div className="flex items-center gap-2">
            <AirplaneTilt size={20} weight="duotone" className="text-[var(--color-pass)]" />
            <span className="font-headline text-lg text-[var(--text-primary)]">Away</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">{away.games} games</p>
        </div>
      </div>

      {/* Record */}
      <div className="grid grid-cols-3 gap-4 py-4 mb-2 bg-[var(--bg-surface-alt)] rounded">
        <div className="text-right">
          <span className="font-headline text-2xl text-[var(--text-primary)]">{home.wins}-{home.games - home.wins}</span>
        </div>
        <div className="text-center text-[var(--text-muted)] text-sm self-center">Record</div>
        <div className="text-left">
          <span className="font-headline text-2xl text-[var(--text-primary)]">{away.wins}-{away.games - away.wins}</span>
        </div>
      </div>

      {/* Comparison rows */}
      <ComparisonRow label="Win %" homeValue={home.win_pct} awayValue={away.win_pct} format="percent" />
      <ComparisonRow label="Points/Game" homeValue={home.points_per_game} awayValue={away.points_per_game} />
      <ComparisonRow label="Points Allowed" homeValue={home.points_allowed_per_game} awayValue={away.points_allowed_per_game} higherIsBetter={false} />
      <ComparisonRow label="EPA/Play" homeValue={home.epa_per_play} awayValue={away.epa_per_play} format="decimal" />
      <ComparisonRow label="Success Rate" homeValue={home.success_rate} awayValue={away.success_rate} format="percent" />
      <ComparisonRow label="Yards/Play" homeValue={home.yards_per_play} awayValue={away.yards_per_play} />
    </div>
  )
}
```

**Step 2: Verify with build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/team/HomeAwayView.tsx
git commit -m "feat: add HomeAwayView component"
```

---

## Task 9: Create ConferenceView Component

**Files:**
- Create: `src/components/team/ConferenceView.tsx`

**Step 1: Create the component**

Create `src/components/team/ConferenceView.tsx`:

```tsx
'use client'

import { ConferenceSplit } from '@/lib/types/database'

interface ConferenceViewProps {
  data: ConferenceSplit[] | null
  conference: string
}

function SplitCard({ title, data, subtitle }: { title: string; data: ConferenceSplit; subtitle: string }) {
  return (
    <div className="card p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-headline text-lg text-[var(--text-primary)]">{title}</h3>
        <span className="text-xs text-[var(--text-muted)]">{subtitle}</span>
      </div>

      {/* Record */}
      <div className="text-center mb-6">
        <span className="font-headline text-4xl text-[var(--text-primary)]">
          {data.wins}-{data.games - data.wins}
        </span>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {(data.win_pct * 100).toFixed(0)}% win rate
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-[var(--text-muted)]">Points/Game</p>
          <p className="font-headline text-xl text-[var(--text-primary)]">{data.points_per_game.toFixed(1)}</p>
        </div>
        <div>
          <p className="text-[var(--text-muted)]">Points Allowed</p>
          <p className="font-headline text-xl text-[var(--text-primary)]">{data.points_allowed_per_game.toFixed(1)}</p>
        </div>
        <div>
          <p className="text-[var(--text-muted)]">EPA/Play</p>
          <p className={`font-headline text-xl ${data.epa_per_play >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
            {data.epa_per_play.toFixed(3)}
          </p>
        </div>
        <div>
          <p className="text-[var(--text-muted)]">Avg Margin</p>
          <p className={`font-headline text-xl ${data.margin_per_game >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
            {data.margin_per_game >= 0 ? '+' : ''}{data.margin_per_game.toFixed(1)}
          </p>
        </div>
      </div>
    </div>
  )
}

export function ConferenceView({ data, conference }: ConferenceViewProps) {
  if (!data || data.length === 0) {
    return (
      <p className="text-[var(--text-muted)] text-center py-8">
        Conference split data not available for this team.
      </p>
    )
  }

  const confData = data.find(d => d.opponent_type === 'conference')
  const nonConfData = data.find(d => d.opponent_type === 'non_conference')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {confData && (
        <SplitCard
          title={`vs ${conference}`}
          data={confData}
          subtitle={`${confData.games} games`}
        />
      )}
      {nonConfData && (
        <SplitCard
          title="vs Non-Conference"
          data={nonConfData}
          subtitle={`${nonConfData.games} games`}
        />
      )}
    </div>
  )
}
```

**Step 2: Verify with build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/team/ConferenceView.tsx
git commit -m "feat: add ConferenceView component"
```

---

## Task 10: Update Page to Fetch All Situational Data

**Files:**
- Modify: `src/app/teams/[slug]/page.tsx`

**Step 1: Add imports**

Add to imports in `src/app/teams/[slug]/page.tsx`:

```typescript
import { RedZoneSplit, FieldPositionSplit, HomeAwaySplit, ConferenceSplit } from '@/lib/types/database'
```

**Step 2: Add data fetching**

After the `downDistanceSplits` fetch, add:

```typescript
  // Fetch red zone splits
  const redZoneResult = await supabase.rpc('get_red_zone_splits', {
    p_team: team.school,
    p_season: currentSeason
  })
  const redZoneSplits = redZoneResult.error ? null : (redZoneResult.data as RedZoneSplit[] | null)

  // Fetch field position splits
  const fieldPosResult = await supabase.rpc('get_field_position_splits', {
    p_team: team.school,
    p_season: currentSeason
  })
  const fieldPositionSplits = fieldPosResult.error ? null : (fieldPosResult.data as FieldPositionSplit[] | null)

  // Fetch home/away splits
  const homeAwayResult = await supabase.rpc('get_home_away_splits', {
    p_team: team.school,
    p_season: currentSeason
  })
  const homeAwaySplits = homeAwayResult.error ? null : (homeAwayResult.data as HomeAwaySplit[] | null)

  // Fetch conference splits
  const confSplitResult = await supabase.rpc('get_conference_splits', {
    p_team: team.school,
    p_season: currentSeason
  })
  const conferenceSplits = confSplitResult.error ? null : (confSplitResult.data as ConferenceSplit[] | null)
```

**Step 3: Pass to TeamPageClient**

Update the return statement to include:

```typescript
      redZoneSplits={redZoneSplits}
      fieldPositionSplits={fieldPositionSplits}
      homeAwaySplits={homeAwaySplits}
      conferenceSplits={conferenceSplits}
```

**Step 4: Verify with build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build may fail (TeamPageClient doesn't accept these props yet)

---

## Task 11: Update TeamPageClient Props

**Files:**
- Modify: `src/components/team/TeamPageClient.tsx`

**Step 1: Add imports**

Add to imports:

```typescript
import { RedZoneSplit, FieldPositionSplit, HomeAwaySplit, ConferenceSplit } from '@/lib/types/database'
```

**Step 2: Update props interface**

Add to `TeamPageClientProps`:

```typescript
  redZoneSplits: RedZoneSplit[] | null
  fieldPositionSplits: FieldPositionSplit[] | null
  homeAwaySplits: HomeAwaySplit[] | null
  conferenceSplits: ConferenceSplit[] | null
```

**Step 3: Destructure new props**

Add to destructuring:

```typescript
  redZoneSplits,
  fieldPositionSplits,
  homeAwaySplits,
  conferenceSplits
```

**Step 4: Pass to SituationalView**

Update the SituationalView call:

```typescript
<SituationalView
  downDistanceData={downDistanceSplits}
  redZoneData={redZoneSplits}
  fieldPositionData={fieldPositionSplits}
  homeAwayData={homeAwaySplits}
  conferenceData={conferenceSplits}
  conference={team.conference || 'FBS'}
/>
```

**Step 5: Verify with build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build may fail (SituationalView doesn't accept these props yet)

---

## Task 12: Update SituationalView to Use All Features

**Files:**
- Modify: `src/components/team/SituationalView.tsx`

**Step 1: Add imports**

```typescript
import { DownDistanceSplit, RedZoneSplit, FieldPositionSplit, HomeAwaySplit, ConferenceSplit } from '@/lib/types/database'
import { DownDistanceHeatmap } from '@/components/visualizations/DownDistanceHeatmap'
import { KeySituationsCards } from './KeySituationsCards'
import { RedZoneView } from './RedZoneView'
import { FieldPositionView } from './FieldPositionView'
import { HomeAwayView } from './HomeAwayView'
import { ConferenceView } from './ConferenceView'
```

**Step 2: Update props interface**

```typescript
interface SituationalViewProps {
  downDistanceData: DownDistanceSplit[] | null
  redZoneData: RedZoneSplit[] | null
  fieldPositionData: FieldPositionSplit[] | null
  homeAwayData: HomeAwaySplit[] | null
  conferenceData: ConferenceSplit[] | null
  conference: string
}
```

**Step 3: Enable all tabs**

Update `SUB_TABS`:

```typescript
const SUB_TABS: SubTabConfig[] = [
  { id: 'down-distance', label: 'Down & Distance', enabled: true },
  { id: 'red-zone', label: 'Red Zone', enabled: true },
  { id: 'field-position', label: 'Field Position', enabled: true },
  { id: 'home-away', label: 'Home vs Away', enabled: true },
  { id: 'vs-conference', label: 'vs Conference', enabled: true },
]
```

**Step 4: Update component with all views**

Replace the content section with:

```typescript
export function SituationalView({
  downDistanceData,
  redZoneData,
  fieldPositionData,
  homeAwayData,
  conferenceData,
  conference
}: SituationalViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('down-distance')

  return (
    <div>
      {/* Sub-navigation */}
      <nav className="flex gap-2 mb-6 border-b border-[var(--border)] pb-4">
        {SUB_TABS.map(tab => {
          const isActive = activeSubTab === tab.id
          const isDisabled = !tab.enabled

          return (
            <button
              key={tab.id}
              disabled={isDisabled}
              onClick={() => tab.enabled && setActiveSubTab(tab.id)}
              className={`px-3 py-1.5 text-sm transition-all ${
                isActive
                  ? 'text-[var(--text-primary)] border-b-2 border-[var(--color-run)] -mb-[17px] pb-[15px]'
                  : isDisabled
                  ? 'text-[var(--text-muted)] opacity-50 cursor-not-allowed'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
              {isDisabled && <span className="ml-1 text-xs">(soon)</span>}
            </button>
          )
        })}
      </nav>

      {/* Content */}
      {activeSubTab === 'down-distance' && (
        <div>
          {downDistanceData && downDistanceData.length > 0 ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <DownDistanceHeatmap data={downDistanceData} side="offense" title="Offense" />
                <DownDistanceHeatmap data={downDistanceData} side="defense" title="Defense" />
              </div>
              <KeySituationsCards data={downDistanceData} />
            </>
          ) : (
            <p className="text-[var(--text-muted)] text-center py-8">
              Down & distance data not available for this team.
            </p>
          )}
        </div>
      )}

      {activeSubTab === 'red-zone' && (
        <RedZoneView data={redZoneData} />
      )}

      {activeSubTab === 'field-position' && (
        <FieldPositionView data={fieldPositionData} />
      )}

      {activeSubTab === 'home-away' && (
        <HomeAwayView data={homeAwayData} />
      )}

      {activeSubTab === 'vs-conference' && (
        <ConferenceView data={conferenceData} conference={conference} />
      )}
    </div>
  )
}
```

**Step 5: Verify with build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 6: Commit all wiring changes**

```bash
git add src/app/teams/[slug]/page.tsx src/components/team/TeamPageClient.tsx src/components/team/SituationalView.tsx
git commit -m "feat: wire up all situational features"
```

---

## Task 13: Final Build, Lint, and Push

**Files:** None (verification only)

**Step 1: Run linter**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run lint`

Expected: No errors

**Step 2: Run build**

Run: `cd /Users/robstover/Development/personal/cfb-app && npm run build`

Expected: Build succeeds

**Step 3: Test locally**

Run: `npm run dev`

Visit: `http://localhost:3000/teams/alabama`
Click through all Situational sub-tabs

**Step 4: Push to deploy**

```bash
git push
```

---

## Summary

This implementation adds four situational analytics views:

1. **Red Zone** - Scoring efficiency when inside opponent's 20 (TD rate, FG rate, points/trip)
2. **Field Position** - Performance by field zone with visual field representation
3. **Home vs Away** - Side-by-side comparison of home/road performance
4. **vs Conference** - Conference vs non-conference performance split

All views follow the established editorial design system and use the same data flow pattern as Down & Distance.
