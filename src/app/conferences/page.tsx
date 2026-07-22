import type { Metadata } from 'next'
import { UsersThree } from '@phosphor-icons/react/dist/ssr'
import { getConferenceComparison, getConferenceHeadToHead } from '@/lib/queries/conferences'
import { CURRENT_SEASON } from '@/lib/queries/constants'
import { ConferenceTable } from '@/components/conferences/ConferenceTable'
import { HeadToHeadGrid } from '@/components/conferences/HeadToHeadGrid'

export const metadata: Metadata = {
  title: 'Conferences | CFB Team 360',
  description: 'Conference-level SP+, EPA, recruiting, and non-conference performance, with head-to-head records.',
}

// Trailing window width for the head-to-head section's default season range
// ("recent era" -- the last 10 seasons through the table's season).
const RECENT_ERA_SEASONS = 10

// Conference-level comparison table + a pick-two head-to-head panel. Falls
// back one season when the current season's aggregates aren't computed yet
// (early in the year, before enough games have been played) -- api.
// conference_comparison legitimately returns zero rows in that window, not
// an error.
export default async function ConferencesPage() {
  let season = CURRENT_SEASON
  let rows = await getConferenceComparison(season)

  if (rows.length === 0) {
    season = CURRENT_SEASON - 1
    rows = await getConferenceComparison(season)
  }

  const conferences = rows.map(r => r.conference)
  // Rows arrive pre-sorted strongest-first by avg_sp_rating -- the top two
  // are sensible head-to-head defaults.
  const [defaultConf1, defaultConf2] = conferences
  const seasonStart = season - RECENT_ERA_SEASONS + 1

  const initialH2H =
    defaultConf1 && defaultConf2
      ? await getConferenceHeadToHead(defaultConf1, defaultConf2, seasonStart, season)
      : []

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          Conferences
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2 max-w-2xl">
          Conference-level SP+, EPA, recruiting, and non-conference performance, ranked strongest first.
        </p>
        {rows.length > 0 && season !== CURRENT_SEASON && (
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Showing {season} — {CURRENT_SEASON} data isn&apos;t available yet.
          </p>
        )}
      </header>

      {rows.length === 0 ? (
        // EmptyState is a client component and an icon function isn't
        // RSC-serializable across the server/client boundary -- mirrors
        // models/page.tsx's inline convention instead of importing it.
        <div className="flex flex-col items-center gap-2 py-12 text-center" role="status" aria-live="polite">
          <UsersThree size={40} weight="thin" className="text-[var(--text-muted)]" aria-hidden="true" />
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Conference aggregates publish with the warehouse&apos;s next refresh.
          </p>
        </div>
      ) : (
        <>
          <section className="mb-10">
            <ConferenceTable rows={rows} />
          </section>

          {defaultConf1 && defaultConf2 && (
            <section>
              <h2 className="font-headline text-xl text-[var(--text-primary)] mb-4">Head-to-Head</h2>
              <HeadToHeadGrid
                conferences={conferences}
                defaultConf1={defaultConf1}
                defaultConf2={defaultConf2}
                seasonStart={seasonStart}
                seasonEnd={season}
                initialRows={initialH2H}
              />
            </section>
          )}
        </>
      )}
    </div>
  )
}
