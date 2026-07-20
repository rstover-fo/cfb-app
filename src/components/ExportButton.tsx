'use client'

import { Download } from '@phosphor-icons/react'

interface ExportButtonProps {
  onClick: () => void
  disabled?: boolean
  label?: string
}

/**
 * Reusable export button component
 * Matches the app's visual style with editorial/paper aesthetic
 * Uses Phosphor Download icon
 */
export function ExportButton({
  onClick,
  disabled = false,
  label = 'Export to CSV',
}: ExportButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 px-3 py-2 rounded text-sm font-medium text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-alt)] active:bg-[var(--bg-surface)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label={label}
    >
      <Download size={18} weight="regular" />
      <span>{label}</span>
    </button>
  )
}
