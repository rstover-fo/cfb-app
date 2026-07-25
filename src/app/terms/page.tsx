import type { Metadata } from 'next'

/**
 * DRAFT CONTENT -- not reviewed by a lawyer.
 *
 * Written against the Phase 1/2 architecture that does not exist yet:
 * Supabase Auth accounts, a one-time non-auto-renewing season pass sold via
 * Stripe Checkout, and a daily-capped chat agent. Revisit when those ship, and
 * have counsel read this before the first paid transaction.
 * See docs/MONETIZATION_ROADMAP.md Phase 0.
 */

export const metadata: Metadata = {
  title: 'Terms of Service | CFB Team 360',
  description: 'Terms governing use of CFB Team 360.',
}

const LAST_UPDATED = 'July 25, 2026'

export default function TermsPage() {
  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          Terms of Service
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">Last updated {LAST_UPDATED}</p>
      </header>

      <div className="max-w-3xl space-y-6 font-body text-[var(--text-secondary)] text-sm sm:text-base leading-relaxed">
        <section className="space-y-3">
          <h2 className="font-headline text-xl text-[var(--text-primary)]">1. Acceptance</h2>
          <p>
            By using CFB Team 360 (the &ldquo;Site&rdquo;) you agree to these Terms. If you do not
            agree, please do not use the Site.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-headline text-xl text-[var(--text-primary)]">2. What the Site is</h2>
          <p>
            The Site publishes college football statistics, model projections, and commentary for
            entertainment and informational purposes only. It does not accept, place, facilitate, or
            broker wagers. See our{' '}
            <a href="/disclaimer" className="underline hover:text-[var(--text-primary)] transition-colors">
              Disclaimer
            </a>{' '}
            for the full statement, which is incorporated into these Terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-headline text-xl text-[var(--text-primary)]">3. Eligibility</h2>
          <p>You must be at least 18 years old to use the Site.</p>
        </section>

        <section className="space-y-3">
          <h2 className="font-headline text-xl text-[var(--text-primary)]">4. Accounts</h2>
          <p>
            Some features require an account. You are responsible for activity under your account and
            for keeping access to your email secure, since sign-in uses emailed links. Do not share
            your account. We may suspend or terminate accounts that abuse the Site, attempt to
            circumvent access controls or usage limits, or violate these Terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-headline text-xl text-[var(--text-primary)]">
            5. Paid access and refunds
          </h2>
          <p>
            Some content requires a paid pass. Passes are sold as{' '}
            <strong className="text-[var(--text-primary)] font-medium">one-time purchases that do
            not automatically renew</strong>. You will not be charged again unless you make another
            purchase. A pass grants access for the period stated at checkout and expires at the end
            of it.
          </p>
          <p>
            Payments are processed by Stripe; we never receive or store your card details. Except
            where required by law, payments are non-refundable and there are no credits for partially
            used periods. Prices may change, but a change never affects a pass you have already
            bought.
          </p>
          <p>
            Access is personal to you. Do not share credentials, resell access, or redistribute paid
            content.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-headline text-xl text-[var(--text-primary)]">6. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>scrape, crawl, or bulk-extract data from the Site;</li>
            <li>redistribute, resell, or republish data or projections obtained from the Site;</li>
            <li>circumvent rate limits, usage caps, paywalls, or authentication;</li>
            <li>use the Site to build a competing dataset or data product;</li>
            <li>interfere with the Site&apos;s operation or security.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-headline text-xl text-[var(--text-primary)]">
            7. Third-party data and marks
          </h2>
          <p>
            College football data is sourced from third parties including{' '}
            <a
              href="https://collegefootballdata.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[var(--text-primary)] transition-colors"
            >
              CollegeFootballData.com
            </a>
            , and remains subject to their terms. Team names, logos, and marks belong to their
            respective owners. The Site is independent and is not affiliated with, endorsed by, or
            sponsored by the NCAA, any conference, any member institution, or ESPN.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-headline text-xl text-[var(--text-primary)]">
            8. No warranty; limitation of liability
          </h2>
          <p>
            The Site is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without
            warranties of any kind, express or implied, including accuracy, completeness,
            merchantability, or fitness for a particular purpose. Data may be delayed, incomplete, or
            wrong.
          </p>
          <p>
            To the fullest extent permitted by law, our total liability arising from your use of the
            Site is limited to the amount you paid us in the twelve months before the claim. We are
            not liable for indirect, incidental, or consequential damages, including any losses
            arising from decisions you make based on content on the Site.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-headline text-xl text-[var(--text-primary)]">9. Changes</h2>
          <p>
            We may update these Terms. Material changes will be reflected in the &ldquo;last
            updated&rdquo; date above. Continued use after a change constitutes acceptance.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-headline text-xl text-[var(--text-primary)]">10. Contact</h2>
          <p>Questions about these Terms can be sent to the address listed on the Site.</p>
        </section>
      </div>
    </div>
  )
}
