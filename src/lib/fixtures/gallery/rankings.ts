/**
 * Rankings-family chart fixtures (BumpsChart).
 *
 * REAL-SEEDED (2026-07-22, CFBD MCP `get_rankings({ season: 2025, poll: "AP
 * Top 25", week })` for weeks 5, 7, 9, 11, 13, 15): every rank/school pair
 * below is the tool's actual response for that week -- full AP Top 25 each
 * week, exercising the ~25-peer-series density the BumpsChart Gate C
 * ruling (docs/chart-style-spec.md §9) is written for. `color` is the only
 * derived field (hand map in ./shared, muted fallback).
 */
import { teamColor } from './shared'

interface RawWeek {
  week: number
  schools: [rank: number, school: string][]
}

const RAW_WEEKS: RawWeek[] = [
  {
    week: 5,
    schools: [
      [1, 'Ohio State'], [2, 'Miami'], [3, 'Penn State'], [4, 'LSU'], [5, 'Georgia'],
      [6, 'Oregon'], [7, 'Oklahoma'], [8, 'Florida State'], [9, 'Texas A&M'], [10, 'Texas'],
      [11, 'Indiana'], [12, 'Texas Tech'], [13, 'Ole Miss'], [14, 'Iowa State'], [15, 'Tennessee'],
      [16, 'Georgia Tech'], [17, 'Alabama'], [18, 'Vanderbilt'], [19, 'Michigan'], [20, 'Missouri'],
      [21, 'USC'], [22, 'Notre Dame'], [23, 'Illinois'], [24, 'TCU'], [25, 'BYU'],
    ],
  },
  {
    week: 7,
    schools: [
      [1, 'Ohio State'], [2, 'Miami'], [3, 'Oregon'], [4, 'Ole Miss'], [5, 'Texas A&M'],
      [6, 'Oklahoma'], [7, 'Indiana'], [8, 'Alabama'], [9, 'Texas Tech'], [10, 'Georgia'],
      [11, 'LSU'], [12, 'Tennessee'], [13, 'Georgia Tech'], [14, 'Missouri'], [15, 'Michigan'],
      [16, 'Notre Dame'], [17, 'Illinois'], [18, 'BYU'], [19, 'Virginia'], [20, 'Vanderbilt'],
      [21, 'Arizona State'], [22, 'Iowa State'], [23, 'Memphis'], [24, 'South Florida'], [25, 'Florida State'],
    ],
  },
  {
    week: 9,
    schools: [
      [1, 'Ohio State'], [2, 'Indiana'], [3, 'Texas A&M'], [4, 'Alabama'], [5, 'Georgia'],
      [6, 'Oregon'], [7, 'Georgia Tech'], [8, 'Ole Miss'], [9, 'Miami'], [10, 'Vanderbilt'],
      [11, 'BYU'], [12, 'Notre Dame'], [13, 'Oklahoma'], [14, 'Texas Tech'], [15, 'Missouri'],
      [16, 'Virginia'], [17, 'Tennessee'], [18, 'South Florida'], [19, 'Louisville'], [20, 'LSU'],
      [21, 'Cincinnati'], [22, 'Texas'], [23, 'Illinois'], [24, 'Arizona State'], [25, 'Michigan'],
    ],
  },
  {
    week: 11,
    schools: [
      [1, 'Ohio State'], [2, 'Indiana'], [3, 'Texas A&M'], [4, 'Alabama'], [5, 'Georgia'],
      [6, 'Oregon'], [7, 'Ole Miss'], [8, 'BYU'], [9, 'Texas Tech'], [10, 'Notre Dame'],
      [11, 'Oklahoma'], [12, 'Virginia'], [13, 'Texas'], [14, 'Louisville'], [15, 'Vanderbilt'],
      [16, 'Georgia Tech'], [17, 'Utah'], [18, 'Miami'], [19, 'Missouri'], [20, 'USC'],
      [21, 'Michigan'], [22, 'Memphis'], [23, 'Tennessee'], [24, 'Washington'], [25, 'Cincinnati'],
    ],
  },
  {
    week: 13,
    schools: [
      [1, 'Ohio State'], [2, 'Indiana'], [3, 'Texas A&M'], [4, 'Georgia'], [5, 'Ole Miss'],
      [6, 'Oregon'], [6, 'Texas Tech'], [8, 'Oklahoma'], [9, 'Notre Dame'], [10, 'Alabama'],
      [11, 'BYU'], [12, 'Vanderbilt'], [13, 'Utah'], [14, 'Miami'], [15, 'Georgia Tech'],
      [16, 'USC'], [17, 'Texas'], [18, 'Michigan'], [19, 'Virginia'], [20, 'Tennessee'],
      [21, 'James Madison'], [22, 'North Texas'], [23, 'Missouri'], [24, 'Tulane'], [25, 'Houston'],
    ],
  },
  {
    week: 15,
    schools: [
      [1, 'Ohio State'], [2, 'Indiana'], [3, 'Georgia'], [4, 'Oregon'], [5, 'Texas Tech'],
      [6, 'Ole Miss'], [7, 'Texas A&M'], [8, 'Oklahoma'], [9, 'Notre Dame'], [10, 'Alabama'],
      [11, 'BYU'], [12, 'Miami'], [13, 'Vanderbilt'], [14, 'Texas'], [15, 'Utah'],
      [16, 'Virginia'], [17, 'USC'], [18, 'Michigan'], [19, 'James Madison'], [20, 'North Texas'],
      [21, 'Tulane'], [22, 'Arizona'], [23, 'Navy'], [24, 'Georgia Tech'], [25, 'Missouri'],
    ],
  },
]

export const BUMPS_DATA = RAW_WEEKS.map(({ week, schools }) => ({
  week,
  rankings: schools.map(([rank, school]) => ({ rank, school, color: teamColor(school) })),
}))

export const BUMPS_POLL = 'AP Top 25'
