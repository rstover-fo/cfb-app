'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { PlayerProfile } from '@/app/players/[id]/actions'
import { teamNameToSlug } from '@/lib/utils'

const YEAR_LABELS: Record<number, string> = {
  1: 'Fr.',
  2: 'So.',
  3: 'Jr.',
  4: 'Sr.',
}

function formatHeight(inches: number): string {
  const feet = Math.floor(inches / 12)
  const remainder = inches % 12
  return `${feet}'${remainder}"`
}

function renderStars(count: number): string {
  const filled = Math.min(Math.max(Math.round(count), 0), 5)
  const empty = 5 - filled
  return '\u25CF'.repeat(filled) + '\u25CB'.repeat(empty)
}

interface PlayerBioHeaderProps {
  player: PlayerProfile
}

export function PlayerBioHeader({ player }: PlayerBioHeaderProps) {
  const yearLabel = player.year != null
    ? (player.year >= 5 ? 'Sr.' : YEAR_LABELS[player.year] ?? `Yr ${player.year}`)
    : null

  const hasRecruiting = player.stars != null

  return (
    <div className="card p-6">
      <div className="flex items-start gap-4">
        {/* Team logo */}
        {player.logo && (
          <Image
            src={player.logo}
            alt={`${player.team} logo`}
            width={32}
            height={32}
            unoptimized
            className="flex-shrink-0 mt-1"
          />
        )}

        <div className="flex-1 min-w-0">
          {/* Name */}
          <h1 className="font-headline text-2xl text-[var(--text-primary)]">
            {player.name}
          </h1>

          {/* Position / Jersey / Year */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {player.position && (
              <span className="inline-block px-2 py-0.5 text-xs rounded bg-[var(--bg-surface-alt)] text-[var(--text-secondary)] border border-[var(--border)]">
                {player.position}
              </span>
            )}
            {player.jersey != null && (
              <span className="text-sm text-[var(--text-muted)]">
                #{player.jersey}
              </span>
            )}
            {yearLabel && (
              <span className="text-sm text-[var(--text-muted)]">
                {yearLabel}
              </span>
            )}
          </div>

          {/* Physical / Hometown */}
          <div className="flex items-center gap-3 mt-2 text-sm text-[var(--text-secondary)] flex-wrap">
            {player.height != null && (
              <span>{formatHeight(player.height)}</span>
            )}
            {player.weight != null && (
              <span>{player.weight} lbs</span>
            )}
            {(player.home_city || player.home_state) && (
              <span className="text-[var(--text-muted)]">
                {[player.home_city, player.home_state].filter(Boolean).join(', ')}
              </span>
            )}
          </div>

          {/* Team link */}
          <div className="mt-2">
            <Link
              href={`/teams/${teamNameToSlug(player.team)}`}
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline transition-colors"
            >
              {player.team}
            </Link>
          </div>

          {/* Recruiting data */}
          {hasRecruiting && (
            <div className="mt-3 pt-3 border-t border-[var(--border)]">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                Recruiting
              </p>
              <div className="flex items-center gap-3 text-sm flex-wrap">
                {player.stars != null && (
                  <span
                    className="text-[var(--color-run)] tracking-wider"
                    title={`${player.stars}-star recruit`}
                  >
                    {renderStars(player.stars)}
                  </span>
                )}
                {player.recruit_rating != null && (
                  <span className="tabular-nums text-[var(--text-secondary)]">
                    {player.recruit_rating.toFixed(4)}
                  </span>
                )}
                {player.national_ranking != null && (
                  <span className="text-[var(--text-muted)]">
                    Natl #{player.national_ranking}
                  </span>
                )}
                {player.recruit_class != null && (
                  <span className="text-[var(--text-muted)]">
                    Class of {player.recruit_class}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
