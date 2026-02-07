export default function PlayersLoading() {
  return (
    <div className="p-8 animate-pulse">
      <div className="mb-8">
        <div className="h-8 w-40 bg-[var(--bg-surface-alt)] rounded mb-2" />
        <div className="h-4 w-72 bg-[var(--bg-surface-alt)] rounded" />
      </div>

      {/* Search bar skeleton */}
      <div className="h-10 w-64 bg-[var(--bg-surface-alt)] rounded mb-6" />

      {/* Category tabs skeleton */}
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-24 bg-[var(--bg-surface-alt)] rounded" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="card overflow-hidden">
        <div className="bg-[var(--bg-surface-alt)] h-10 border-b border-[var(--border)]" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-[var(--border)]">
            <div className="h-4 w-8 bg-[var(--bg-surface-alt)] rounded" />
            <div className="h-4 w-36 bg-[var(--bg-surface-alt)] rounded" />
            <div className="h-4 w-24 bg-[var(--bg-surface-alt)] rounded" />
            <div className="h-4 w-16 bg-[var(--bg-surface-alt)] rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}
