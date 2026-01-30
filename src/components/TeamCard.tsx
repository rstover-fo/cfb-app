import Link from 'next/link'
import { Team } from '@/lib/types/database'

interface TeamCardProps {
  team: Team
}

function TeamInitials({ school }: { school: string }) {
  const initials = school
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="w-[120px] h-[120px] rounded-full bg-[var(--bg-surface-alt)] flex items-center justify-center">
      <span className="font-headline text-3xl text-[var(--text-muted)]">
        {initials}
      </span>
    </div>
  )
}

export function TeamCard({ team }: TeamCardProps) {
  const slug = team.school.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  return (
    <Link
      href={`/teams/${slug}`}
      className="card block p-6 hover:border-[var(--color-run)]"
    >
      {/* Logo Area */}
      <div className="flex justify-center mb-4">
        {team.logo ? (
          <img
            src={team.logo}
            alt={`${team.school} logo`}
            className="w-[120px] h-[120px] object-contain"
          />
        ) : (
          <TeamInitials school={team.school} />
        )}
      </div>

      {/* Team Name */}
      <div className="text-center mb-4">
        <h2 className="font-headline text-xl text-[var(--text-primary)] underline-sketch inline-block">
          {team.school}
        </h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {team.conference || 'Independent'}
        </p>
      </div>

      {/* Stats Preview - placeholder for now */}
      <div className="flex justify-between text-sm border-t border-[var(--border)] pt-4">
        <div className="text-center">
          <p className="text-[var(--text-muted)]">EPA</p>
          <p className="text-[var(--text-primary)] font-medium">--</p>
        </div>
        <div className="text-center">
          <p className="text-[var(--text-muted)]">W-L</p>
          <p className="text-[var(--text-primary)] font-medium">--</p>
        </div>
        <div className="text-center">
          <p className="text-[var(--text-muted)]">Rank</p>
          <p className="text-[var(--text-primary)] font-medium">--</p>
        </div>
      </div>
    </Link>
  )
}
