interface WidgetSkeletonProps {
  title?: string
  rows?: number
  className?: string
}

export function WidgetSkeleton({ title, rows = 5, className = '' }: WidgetSkeletonProps) {
  return (
    <div className={`card p-4 ${className}`}>
      {/* Title skeleton */}
      {title ? (
        <div className="mb-4 pb-3 border-b border-[var(--border)]">
          <span className="text-sm font-medium text-[var(--text-muted)]">{title}</span>
        </div>
      ) : (
        <div className="h-5 w-32 bg-[var(--bg-surface-alt)] animate-pulse rounded mb-4" />
      )}

      {/* Content skeleton rows */}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            {/* Logo placeholder */}
            <div className="h-8 w-8 bg-[var(--bg-surface-alt)] animate-pulse rounded-full flex-shrink-0" />
            {/* Text placeholder */}
            <div className="flex-1 h-4 bg-[var(--bg-surface-alt)] animate-pulse rounded" />
            {/* Value placeholder */}
            <div className="h-4 w-12 bg-[var(--bg-surface-alt)] animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
