/**
 * Team-name autocomplete for slash-command options.
 *
 * data/teams.json is a hand-maintained, case-sensitive list of FBS school
 * names, matching this app's database naming conventions (cross-checked
 * against src/lib/queries/shared.ts's FBS_CONFERENCES in the parent app and
 * its query test fixtures). FBS membership and school names change most
 * offseasons (conference realignment, new FBS entrants, renamed schools) --
 * refresh this list every offseason rather than trusting it indefinitely.
 * Search tools (query_team, get_leaderboard) can confirm/correct an exact
 * spelling if a school seems to be missing or misspelled here.
 */
import teams from './data/teams.json' with { type: 'json' }

const TEAM_NAMES: readonly string[] = teams as readonly string[]
const MAX_CHOICES = 25

/**
 * Case-insensitive substring match against the FBS team list, capped at
 * Discord's 25-choice autocomplete limit. Returned values are the exact,
 * case-sensitive school names the database expects.
 */
export function autocompleteTeams(query: string): string[] {
  const q = query.trim().toLowerCase()
  if (q.length === 0) return TEAM_NAMES.slice(0, MAX_CHOICES)
  return TEAM_NAMES.filter(name => name.toLowerCase().includes(q)).slice(0, MAX_CHOICES)
}
