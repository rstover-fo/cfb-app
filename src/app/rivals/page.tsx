import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getFBSTeams, getTeamLookup } from '@/lib/queries/shared'
import { getMatchup, getMatchupGames } from '@/lib/queries/matchups'
import {
  RivalSelector,
  H2HRecordSummary,
  MatchupGamesTable,
  ScoringTrendChart,
} from '@/components/rivals'

export const metadata: Metadata = {
  title: 'Rivals · Head-to-Head | CFB Team 360',
  description: 'All-time head-to-head records, game history, and scoring trends between any two FBS programs.',
}

interface PageProps {
  searchParams: Promise<{ t1?: string; t2?: string }>
}

// Classic rivalries surfaced on the landing state as one-click quick links.
const CLASSIC_RIVALRIES: { a: string; b: string; label: string }[] = [
  { a: 'Oklahoma', b: 'Texas', label: 'Red River Rivalry' },
  { a: 'Alabama', b: 'Auburn', label: 'Iron Bowl' },
  { a: 'Ohio State', b: 'Michigan', label: 'The Game' },
  { a: 'Army', b: 'Navy', label: "America's Game" },
]

// Resolve a raw search-param value to its canonical FBS team name (case-insensitive).
function resolveTeam(raw: string | undefined, teams: string[]): string | null {
  if (!raw) return null
  return teams.find(t => t.toLowerCase() === raw.toLowerCase()) ?? null
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-headline text-xl text-[var(--text-primary)] mb-4">{children}</h2>
  )
}

async function RivalsContent({ teamA, teamB }: { teamA: string; teamB: string }) {
  const [matchup, games, teamLookup] = await Promise.all([
    getMatchup(teamA, teamB),
    getMatchupGames(teamA, teamB),
    getTeamLookup(),
  ])

  const teamAMeta = {
    name: teamA,
    logo: teamLookup.get(teamA)?.logo ?? null,
    color: teamLookup.get(teamA)?.color ?? null,
  }
  const teamBMeta = {
    name: teamB,
    logo: teamLookup.get(teamB)?.logo ?? null,
    color: teamLookup.get(teamB)?.color ?? null,
  }

  // Never-played pair: no summary row and no games on record.
  if (!matchup && games.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="font-headline text-lg text-[var(--text-primary)]">
          {teamA} and {teamB} have never met
        </p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          No completed games between these programs are on record. Pick a different matchup above.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-2">
        {matchup && (
          <H2HRecordSummary summary={matchup} teamAMeta={teamAMeta} teamBMeta={teamBMeta} />
        )}
        <div className="card p-6">
          <SectionTitle>Scoring Trend</SectionTitle>
          <ScoringTrendChart games={games} teamAMeta={teamAMeta} teamBMeta={teamBMeta} />
        </div>
      </div>

      <div className="card p-6">
        <SectionTitle>All Meetings</SectionTitle>
        <MatchupGamesTable games={games} teamAMeta={teamAMeta} teamBMeta={teamBMeta} />
      </div>
    </div>
  )
}

function ContentSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6 h-64 animate-pulse" />
        <div className="card p-6 h-64 animate-pulse" />
      </div>
      <div className="card p-6 h-80 animate-pulse" />
    </div>
  )
}

function RivalryLanding({ teams }: { teams: string[] }) {
  const available = CLASSIC_RIVALRIES.filter(
    r =>
      teams.some(t => t.toLowerCase() === r.a.toLowerCase()) &&
      teams.some(t => t.toLowerCase() === r.b.toLowerCase())
  )

  return (
    <div>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        Pick any two FBS programs above to see their all-time series, or jump into a classic rivalry.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {available.map(r => (
          <Link
            key={`${r.a}-${r.b}`}
            href={`/rivals?t1=${encodeURIComponent(r.a)}&t2=${encodeURIComponent(r.b)}`}
            className="card p-5 block group"
          >
            <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">{r.label}</p>
            <p className="mt-2 font-headline text-lg text-[var(--text-primary)] group-hover:text-[var(--color-run)] transition-colors">
              {r.a}
              <span className="text-[var(--text-muted)] font-normal"> vs </span>
              {r.b}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default async function RivalsPage({ searchParams }: PageProps) {
  const { t1, t2 } = await searchParams
  const teams = await getFBSTeams()

  const teamA = resolveTeam(t1, teams)
  const teamB = resolveTeam(t2, teams)
  const hasValidPair = teamA !== null && teamB !== null && teamA !== teamB

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          Rivals
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          Head-to-head history between any two FBS programs
        </p>
      </header>

      <div className="mb-8">
        <RivalSelector teams={teams} teamA={teamA ?? ''} teamB={teamB ?? ''} />
      </div>

      {hasValidPair ? (
        <Suspense key={`${teamA}::${teamB}`} fallback={<ContentSkeleton />}>
          <RivalsContent teamA={teamA} teamB={teamB} />
        </Suspense>
      ) : (
        <RivalryLanding teams={teams} />
      )}
    </div>
  )
}
