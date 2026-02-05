export function teamNameToSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

export function slugToTeamName(slug: string): string {
  // This is approximate — we'll look up the actual team by slug
  return slug.split('-').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ')
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function formatRank(rank: number): string {
  if (rank === 1) return '1st'
  if (rank === 2) return '2nd'
  if (rank === 3) return '3rd'
  return `${rank}th`
}

// Shared select dropdown styling
export const selectClassName = `px-3 py-2 text-sm border-[1.5px] border-[var(--border)] rounded-sm
  bg-[var(--bg-surface)] text-[var(--text-primary)]
  cursor-pointer hover:border-[var(--text-muted)] transition-colors
  appearance-none bg-no-repeat bg-right pr-8`

export const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236B635A' d='M3 4.5L6 8l3-3.5H3z'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center'
}
