'use client'

import { WarningCircle, ArrowClockwise } from '@phosphor-icons/react'

interface WidgetErrorProps {
  title: string
  message?: string
  onRetry?: () => void
}

export function WidgetError({ title, message, onRetry }: WidgetErrorProps) {
  return (
    <div className="card p-4">
      {/* Title */}
      <div className="mb-4 pb-3 border-b border-[var(--border)]">
        <span className="text-sm font-medium text-[var(--text-muted)]">{title}</span>
      </div>

      {/* Error content */}
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <WarningCircle size={32} weight="thin" className="text-[var(--color-negative)] mb-3" />
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          {message || 'Unable to load data'}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--text-primary)]
                       bg-[var(--bg-surface-alt)] hover:bg-[var(--border)]
                       rounded transition-colors"
          >
            <ArrowClockwise size={16} weight="thin" />
            Try again
          </button>
        )}
      </div>
    </div>
  )
}
