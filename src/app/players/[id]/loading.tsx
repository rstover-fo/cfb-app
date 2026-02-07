export default function PlayerDetailLoading() {
  return (
    <div className="p-8 animate-pulse">
      {/* Back link skeleton */}
      <div className="h-4 w-32 bg-[var(--bg-surface-alt)] rounded mb-6" />

      {/* Bio header skeleton */}
      <div className="card p-6 mb-8">
        <div className="flex items-start gap-6">
          <div className="h-16 w-16 bg-[var(--bg-surface-alt)] rounded-full" />
          <div className="flex-1 space-y-3">
            <div className="h-8 w-56 bg-[var(--bg-surface-alt)] rounded" />
            <div className="h-4 w-40 bg-[var(--bg-surface-alt)] rounded" />
            <div className="flex gap-4">
              <div className="h-4 w-20 bg-[var(--bg-surface-alt)] rounded" />
              <div className="h-4 w-20 bg-[var(--bg-surface-alt)] rounded" />
              <div className="h-4 w-24 bg-[var(--bg-surface-alt)] rounded" />
            </div>
          </div>
        </div>
      </div>

      {/* Stats table skeleton */}
      <div className="card overflow-hidden mb-8">
        <div className="bg-[var(--bg-surface-alt)] h-10 border-b border-[var(--border)]" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3 border-b border-[var(--border)]">
            <div className="h-4 w-24 bg-[var(--bg-surface-alt)] rounded" />
            <div className="h-4 w-16 bg-[var(--bg-surface-alt)] rounded" />
            <div className="h-4 w-16 bg-[var(--bg-surface-alt)] rounded" />
            <div className="h-4 w-16 bg-[var(--bg-surface-alt)] rounded" />
          </div>
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="card p-6 h-72 bg-[var(--bg-surface-alt)] rounded" />
        <div className="card p-6 h-72 bg-[var(--bg-surface-alt)] rounded" />
      </div>
    </div>
  )
}
