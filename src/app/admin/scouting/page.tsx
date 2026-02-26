// cfb-app/src/app/admin/scouting/page.tsx
'use client'

import React, { useEffect, useState } from 'react'
import { getPendingLinks, reviewPendingLink } from '@/lib/queries/scouting'
import { PendingLink } from '@/lib/types/scouting'
import { CheckCircle, XCircle, Loader2, Database, AlertTriangle } from 'lucide-react'

export default function ScoutingAdminPage() {
  const [links, setLinks] = useState<PendingLink[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewingId, setReviewingId] = useState<number | null>(null)
  const [reviewingStatus, setReviewingStatus] = useState<'approved' | 'rejected' | null>(null)

  const fetchLinks = async () => {
    setLoading(true)
    const data = await getPendingLinks('pending')
    setLinks(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchLinks()
  }, [])

  const handleReview = async (id: number, status: 'approved' | 'rejected') => {
    setReviewingId(id)
    setReviewingStatus(status)
    const success = await reviewPendingLink(id, status)
    if (success) {
      setLinks(prev => prev.filter(link => link.id !== id))
    } else {
      alert('Failed to update link status')
    }
    setReviewingId(null)
    setReviewingStatus(null)
  }

  const getScoreColor = (score: number) => {
    if (score > 0.85) return 'text-[var(--color-positive)]'
    if (score > 0.6) return 'text-[var(--color-run)]'
    return 'text-[var(--color-negative)]'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 text-[var(--accent)] animate-spin" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="flex items-center justify-between mb-8 border-b border-[var(--border)] pb-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)] font-serif flex items-center gap-3">
            <Database className="h-8 w-8 text-[var(--accent)]" />
            Agent Orchestration Control Plane
          </h1>
          <p className="text-[var(--text-secondary)] mt-2">
            Review and calibrate agent-matched entities and scouting intelligence.
          </p>
        </div>
        <div className="px-3 py-1 rounded border border-[var(--border)] bg-[var(--bg-surface-alt)] text-[var(--text-primary)] font-bold text-sm">
          {links.length} Matches Pending Review
        </div>
      </div>

      <div className="space-y-6">
        {links.length === 0 ? (
          <div className="bg-[var(--bg-surface)] border-2 border-dashed border-[var(--border)] py-16 rounded-xl text-center">
            <CheckCircle className="h-16 w-16 text-[var(--color-positive)] opacity-20 mx-auto mb-4" />
            <p className="text-[var(--text-primary)] font-bold text-lg">No pending links found.</p>
            <p className="text-[var(--text-muted)] mt-1">Agent matching confidence is currently within thresholds.</p>
          </div>
        ) : (
          links.map((link) => (
            <div key={link.id} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-[var(--shadow-soft)] overflow-hidden">
              <div className="p-6 border-b border-[var(--border)]">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-bold font-serif flex items-center gap-3 text-[var(--text-primary)]">
                      {link.source_name}
                      <span className="text-[var(--text-muted)] font-normal">→</span>
                      <span className="text-[var(--accent)]">Roster Match Candidate</span>
                    </h3>
                    <div className="flex items-center gap-2 mt-2">
                       <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-[var(--bg-surface-alt)] text-[var(--text-secondary)]">
                        Method: {link.match_method}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">Source: {link.source_team || 'Unknown Team'}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-3xl font-bold font-serif ${getScoreColor(link.match_score)}`}>
                      {(link.match_score * 100).toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest">Confidence</div>
                  </div>
                </div>
              </div>
              <div className="p-6 bg-[var(--bg-surface-alt)]/30 flex flex-col md:flex-row gap-6">
                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] shadow-sm">
                      <div className="text-[10px] text-[var(--text-muted)] font-black uppercase mb-2 flex items-center gap-1">
                        Source Metadata
                      </div>
                      <div className="text-sm font-bold text-[var(--text-primary)]">
                         {link.source_context?.position || 'POS'} | {link.source_context?.year || 'YEAR'}
                      </div>
                    </div>
                    <div className="p-4 bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] shadow-sm">
                      <div className="text-[10px] text-[var(--text-muted)] font-black uppercase mb-2 flex items-center gap-1">
                         Target ID
                      </div>
                      <div className="text-sm font-bold text-[var(--accent)]">
                        {link.candidate_roster_id || 'NO MATCH'}
                      </div>
                    </div>
                  </div>

                  {link.match_score < 0.7 && (
                    <div className="flex items-start gap-2 p-3 bg-[var(--color-negative)]/10 border border-[var(--color-negative)]/20 rounded-lg text-xs font-medium text-[var(--color-negative)]">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      Low confidence match. Manual validation recommended before approving.
                    </div>
                  )}
                </div>

                <div className="flex flex-row md:flex-col justify-center gap-3 shrink-0">
                  <button 
                    className="flex items-center justify-center px-4 py-2 rounded-lg font-bold text-sm bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--color-positive)] hover:text-white transition-all gap-2 disabled:opacity-50"
                    onClick={() => handleReview(link.id, 'approved')}
                    disabled={reviewingId === link.id}
                  >
                    {reviewingId === link.id && reviewingStatus === 'approved' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    Approve
                  </button>
                  <button 
                    className="flex items-center justify-center px-4 py-2 rounded-lg font-bold text-sm bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--color-negative)] hover:text-white transition-all gap-2 disabled:opacity-50"
                    onClick={() => handleReview(link.id, 'rejected')}
                    disabled={reviewingId === link.id}
                  >
                    {reviewingId === link.id && reviewingStatus === 'rejected' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

