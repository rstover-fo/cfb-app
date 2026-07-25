import type { Metadata } from 'next'

/**
 * DRAFT CONTENT -- not reviewed by a lawyer.
 *
 * Modeled on the language live comparables use (Action Network, RotoWire,
 * TeamRankings). Required before charging; see docs/MONETIZATION_ROADMAP.md
 * Phase 0. Have counsel read this before the first paid transaction.
 */

export const metadata: Metadata = {
  title: 'Disclaimer | CFB Team 360',
  description:
    'CFB Team 360 publishes college football analytics for entertainment and informational purposes only.',
}

export default function DisclaimerPage() {
  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          Disclaimer
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          What this site is, what it isn&apos;t, and what we do and don&apos;t claim
        </p>
      </header>

      <div className="max-w-3xl space-y-6 font-body text-[var(--text-secondary)] text-sm sm:text-base leading-relaxed">
        <section className="space-y-3">
          <h2 className="font-headline text-xl text-[var(--text-primary)]">
            Entertainment and informational purposes only
          </h2>
          <p>
            CFB Team 360 publishes statistical analysis, model outputs, and commentary about college
            football. Everything on this site is provided for entertainment and informational
            purposes only. <strong className="text-[var(--text-primary)] font-medium">This site does
            not accept, place, facilitate, or broker wagers of any kind</strong>, and nothing here
            should be read as a recommendation to place one.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-headline text-xl text-[var(--text-primary)]">
            No guarantees
          </h2>
          <p>
            No outcome is guaranteed. Past model performance does not predict future results. The
            models on this site are wrong regularly and by design &mdash; a model that beats the
            closing line more often than not is still wrong a large share of the time. Any figure we
            publish describes what already happened in a backtest, not what will happen next.
          </p>
          <p>
            We make no warranty as to the accuracy or completeness of the data or projections shown
            here. Data arrives from third-party sources and refreshes on a schedule, not in real
            time, so figures may be stale or incorrect.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-headline text-xl text-[var(--text-primary)]">
            Methodology is public
          </h2>
          <p>
            We publish how the models work and how they have performed, including the seasons they
            performed badly, on the{' '}
            <a href="/models" className="underline hover:text-[var(--text-primary)] transition-colors">
              Models
            </a>{' '}
            page. Every accuracy figure comes from a walk-forward backtest in which the model only
            sees information that would have been available before kickoff.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-headline text-xl text-[var(--text-primary)]">
            Age
          </h2>
          <p>
            This site is intended for users 18 years of age or older.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-headline text-xl text-[var(--text-primary)]">
            If gambling is a problem for you
          </h2>
          <p>
            Help is available and free. Call{' '}
            <strong className="text-[var(--text-primary)] font-medium">1-800-GAMBLER</strong>. In New
            York, call 877-8-HOPENY or text HOPENY (467369). In Connecticut, call 888-789-7777. In
            Maryland, visit mdgamblinghelp.org. Please make use of these resources if you need them.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-headline text-xl text-[var(--text-primary)]">
            Affiliation and trademarks
          </h2>
          <p>
            CFB Team 360 is an independent analytics site. It is not affiliated with, endorsed by,
            sponsored by, or approved by the NCAA, any athletic conference, any member institution,
            or ESPN. All team names, logos, and marks are the property of their respective owners
            and appear here solely to identify the teams the data describes.
          </p>
          <p>
            College football data is sourced from{' '}
            <a
              href="https://collegefootballdata.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[var(--text-primary)] transition-colors"
            >
              CollegeFootballData.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  )
}
