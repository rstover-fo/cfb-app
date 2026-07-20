'use client'

import type { Icon as PhosphorIcon } from '@phosphor-icons/react'

export interface EmptyStateAction {
  label: string
  onClick: () => void
}

interface EmptyStateProps {
  /** Phosphor icon component, e.g. MagnifyingGlass, CalendarBlank. */
  icon: PhosphorIcon
  /** Short one-line explanation of why nothing is showing. */
  title: string
  /** Optional supporting detail (e.g. which filters are active). */
  description?: string
  /** Optional suggested next action, e.g. "Clear filters". */
  action?: EmptyStateAction
  /** Optional secondary action, e.g. "View all seasons". */
  secondaryAction?: EmptyStateAction
  className?: string
}

/**
 * House-style empty state: icon + one-line explanation + suggested action.
 * Announced to assistive tech as a polite status update so screen reader
 * users hear that a search/filter genuinely returned nothing (as opposed
 * to the page having failed to load).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center text-center gap-3 py-10 px-4 ${className}`}
    >
      <Icon size={40} weight="thin" className="text-[var(--text-muted)]" aria-hidden="true" />

      <div className="space-y-1">
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        {description && (
          <p className="text-sm text-[var(--text-muted)] max-w-sm">{description}</p>
        )}
      </div>

      {(action || secondaryAction) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
          {action && (
            <button
              onClick={action.onClick}
              className="px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] bg-[var(--bg-surface-alt)] hover:bg-[var(--border)] rounded transition-colors"
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
