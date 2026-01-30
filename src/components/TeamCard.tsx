import Link from 'next/link'
import { Team } from '@/lib/types/database'

interface TeamCardProps {
  team: Team
}

export function TeamCard({ team }: TeamCardProps) {
  const slug = team.school.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  return (
    <Link
      href={`/teams/${slug}`}
      className="block p-4 border rounded-lg hover:border-blue-500 hover:shadow-md transition-all"
      style={{ borderLeftColor: team.color || '#6b7280', borderLeftWidth: '4px' }}
    >
      <div className="flex items-center gap-3">
        {team.logo && (
          <img
            src={team.logo}
            alt={`${team.school} logo`}
            className="w-10 h-10 object-contain"
          />
        )}
        <div>
          <h2 className="font-semibold text-lg">{team.school}</h2>
          <p className="text-sm text-gray-500">{team.conference || 'Independent'}</p>
        </div>
      </div>
    </Link>
  )
}
