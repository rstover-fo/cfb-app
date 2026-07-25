import Image from 'next/image'

/**
 * Single source of truth for how a team is visually identified across the app.
 *
 * Every team logo in the product renders through this component so the whole
 * site's team-branding strategy is one env flag, not 23 call sites:
 *
 *   NEXT_PUBLIC_TEAM_LOGOS=espn   (default) hotlink the ESPN CDN asset
 *   NEXT_PUBLIC_TEAM_LOGOS=off              neutral color-chip mark instead
 *
 * Why that switch exists: logo URLs come from `teams_with_logos.logo`, which
 * points at `a.espncdn.com`. ESPN can referer-block those at any time, and a
 * paid product displaying them sits in murkier territory than a free one (see
 * docs/MONETIZATION_ROADMAP.md, Phase 0). The flag is the escape hatch.
 *
 * `unoptimized` is deliberate and load-bearing -- it keeps the browser
 * fetching straight from ESPN so our server never reproduces the bytes. Do not
 * remove it, and do not add a self-hosted logo set without licensing or
 * redrawing the artwork first.
 */

const LOGO_SOURCE = process.env.NEXT_PUBLIC_TEAM_LOGOS ?? 'espn'

/**
 * Whether third-party team logos may render at all.
 *
 * Exported for the one place that legitimately cannot use <TeamMark>:
 * ScatterPlot draws logo points as native SVG <image> elements (a deliberate
 * chart-spec exemption so logo rasters are never roughified). It must consult
 * this directly, otherwise flipping NEXT_PUBLIC_TEAM_LOGOS=off would silently
 * leave ESPN logos on the scatter plot -- exactly the scenario the flag exists
 * for. Any future non-JSX logo render must do the same.
 */
export function teamLogosEnabled(): boolean {
  return LOGO_SOURCE !== 'off'
}

/** Below this pixel size the initials are illegible, so render a bare chip. */
const MIN_WIDTH_FOR_INITIALS = 32

/** "Ohio State" -> "OS". Mirrors the old TeamCard/TeamInitials behavior. */
export function teamInitials(school: string): string {
  return school
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export interface TeamMarkProps {
  /** School name -- drives the alt text and the fallback initials. */
  school: string
  /** ESPN logo URL from `teams_with_logos.logo`. Null/absent falls back. */
  logo?: string | null
  /** Team hex color, used as the fallback chip background. */
  color?: string | null
  width: number
  height: number
  /** Sizing/layout classes. Applied to whichever branch renders. */
  className?: string
  /** Overrides the default alt text (the school name). */
  alt?: string
}

export function TeamMark({
  school,
  logo,
  color,
  width,
  height,
  className = '',
  alt,
}: TeamMarkProps) {
  const label = alt ?? school

  if (teamLogosEnabled() && logo) {
    return (
      <Image
        src={logo}
        alt={label}
        width={width}
        height={height}
        className={className}
        unoptimized
      />
    )
  }

  // Fallback: a color chip. Matches what the widgets rendered before this
  // component existed, plus initials once there is room for them.
  const showInitials = width >= MIN_WIDTH_FOR_INITIALS

  return (
    <div
      role="img"
      aria-label={label}
      className={`rounded-full ${showInitials ? 'flex items-center justify-center' : ''} ${className}`}
      style={{ backgroundColor: color || 'var(--bg-surface-alt)' }}
    >
      {showInitials && (
        <span
          className="font-headline leading-none text-[var(--text-muted)]"
          style={{ fontSize: Math.round(width * 0.38) }}
        >
          {teamInitials(school)}
        </span>
      )}
    </div>
  )
}
