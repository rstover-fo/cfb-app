import Link from 'next/link'

/**
 * Sitewide footer carrying the two notices Phase 0 of the monetization
 * roadmap requires before we charge anyone:
 *
 *  1. CFBD data attribution -- optional under their terms, but the cheapest
 *     goodwill available from a solo maintainer who can revoke our API key.
 *  2. A non-affiliation disclaimer. This is what every comparable does instead
 *     of buying a license (there is no editorial trademark license to buy --
 *     CLC only licenses merchandise). It does not immunize us, but courts do
 *     weigh a prominent disclaimer in the nominative-fair-use analysis
 *     (Toyota v. Tabari).
 *
 * See docs/MONETIZATION_ROADMAP.md, Phase 0.
 */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-[var(--border)] px-8 py-6 font-body text-[var(--text-muted)]">
      <div className="max-w-3xl space-y-3">
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <Link href="/disclaimer" className="hover:text-[var(--text-primary)] transition-colors">
            Disclaimer
          </Link>
          <Link href="/terms" className="hover:text-[var(--text-primary)] transition-colors">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-[var(--text-primary)] transition-colors">
            Privacy
          </Link>
          <Link href="/models" className="hover:text-[var(--text-primary)] transition-colors">
            Methodology
          </Link>
        </nav>

        <p className="text-[11px] leading-relaxed">
          Data:{' '}
          <a
            href="https://collegefootballdata.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--text-primary)] transition-colors"
          >
            CollegeFootballData.com
          </a>
          . For entertainment and informational purposes only. This site does not accept or
          facilitate wagers of any kind, and no outcome is guaranteed.
        </p>

        <p className="text-[11px] leading-relaxed">
          CFB Team 360 is an independent analytics site with no affiliation to, and no endorsement
          or sponsorship by, the NCAA, any conference, any member institution, or ESPN. All team
          names, logos, and marks are the property of their respective owners and are used here for
          identification in an informational context.
        </p>
      </div>
    </footer>
  )
}
