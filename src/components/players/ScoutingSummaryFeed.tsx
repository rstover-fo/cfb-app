// cfb-app/src/components/players/ScoutingSummaryFeed.tsx
import React from 'react'
import type { ScoutingReport } from '@/lib/types/scouting'
import { CalendarIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface ScoutingSummaryFeedProps {
  reports: ScoutingReport[]
  loading?: boolean
}

export const ScoutingSummaryFeed: React.FC<ScoutingSummaryFeedProps> = ({ 
  reports, 
  loading 
}) => {
  if (loading) {
    return (
      <div className="w-full bg-[var(--bg-surface-alt)] border border-[var(--border)] rounded-lg animate-pulse p-8 flex items-center justify-center">
        <span className="text-[var(--text-muted)]">Loading Intelligence...</span>
      </div>
    )
  }

  if (!reports || reports.length === 0) {
    return (
      <div className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-8 flex items-center justify-center">
        <span className="text-[var(--text-muted)] italic">No scouting intelligence available for this player.</span>
      </div>
    )
  }

  const getSentimentIcon = (score: number | null) => {
    if (score === null) return <Minus className="h-4 w-4 text-[var(--text-muted)]" />
    if (score > 0.3) return <TrendingUp className="h-4 w-4 text-[var(--color-positive)]" />
    if (score < -0.3) return <TrendingDown className="h-4 w-4 text-[var(--color-negative)]" />
    return <Minus className="h-4 w-4 text-[var(--text-muted)]" />
  }

  const getSentimentLabel = (score: number | null) => {
    if (score === null) return 'Neutral'
    if (score > 0.6) return 'Bullish'
    if (score > 0.2) return 'Rising'
    if (score < -0.6) return 'Bearish'
    if (score < -0.2) return 'Falling'
    return 'Neutral'
  }

  return (
    <div className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg shadow-[var(--shadow-soft)]">
      <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <h3 className="text-lg font-bold text-[var(--text-primary)] font-serif">
          Agent Scouting Reports
        </h3>
        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-muted)]">
          {reports.length} Reports Found
        </span>
      </div>
      <div className="p-6">
        <div className="max-h-[400px] overflow-y-auto pr-2 space-y-4">
          {reports.map((report) => (
            <div 
              key={report.id} 
              className="p-4 rounded border border-[var(--border)] bg-[var(--bg-surface-alt)]/50 hover:bg-[var(--bg-surface-alt)] transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--accent)]">{report.source_name}</span>
                  <div 
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded flex items-center gap-1.5 ${
                      getSentimentLabel(report.sentiment_score).includes('Bullish') ? 'bg-[var(--color-positive)]/10 text-[var(--color-positive)]' :
                      getSentimentLabel(report.sentiment_score).includes('Bearish') ? 'bg-[var(--color-negative)]/10 text-[var(--color-negative)]' :
                      'bg-[var(--bg-surface-alt)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {getSentimentIcon(report.sentiment_score)}
                    {getSentimentLabel(report.sentiment_score)}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-tighter">
                  <CalendarIcon className="h-3 w-3" />
                  {new Date(report.published_at || report.crawled_at).toLocaleDateString()}
                </div>
              </div>
              
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed italic">
                "{report.summary || "Agent intelligence pending summary generation..."}"
              </p>
              
              {report.source_url && (
                <div className="mt-3 flex justify-end">
                  <a 
                    href={report.source_url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)] underline underline-offset-2"
                  >
                    View Source Reference
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

