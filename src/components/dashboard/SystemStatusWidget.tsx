// cfb-app/src/components/dashboard/SystemStatusWidget.tsx
import React from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Activity, Database, Lightning } from '@phosphor-icons/react/dist/ssr'

export const SystemStatusWidget: React.FC = () => {
  // In a real app, these would come from an API endpoint or WebSocket
  const agents = [
    { name: 'Cub Crawler', status: 'idle', lastSeen: '2m ago', active: false },
    { name: 'Sentiment Aggregator', status: 'processing', lastSeen: 'Just now', active: true },
    { name: 'Embedding Vectorizer', status: 'idle', lastSeen: '15m ago', active: false }
  ]

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg shadow-[var(--shadow-soft)]">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <h4 className="text-sm font-bold flex items-center gap-2 text-[var(--text-primary)] font-serif">
          <Activity size={18} weight="bold" className="text-[var(--accent)]" />
          Agent Orchestration Pulse
        </h4>
      </div>
      <div className="p-4 space-y-4">
        {agents.map((agent) => (
          <div key={agent.name} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={`h-2 w-2 rounded-full ${agent.active ? 'bg-[var(--color-positive)] animate-pulse' : 'bg-[var(--border)]'}`} />
                {agent.active && (
                  <div className="absolute inset-0 h-2 w-2 rounded-full bg-[var(--color-positive)] animate-ping opacity-75" />
                )}
              </div>
              <div>
                <div className="text-xs font-bold text-[var(--text-secondary)]">{agent.name}</div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase font-black tracking-tighter">{agent.status} • {agent.lastSeen}</div>
              </div>
            </div>
            {agent.active && (
              <Lightning size={14} weight="fill" className="text-[var(--color-run)] animate-bounce" />
            )}
          </div>
        ))}

        <div className="pt-2 border-t border-[var(--border)]">
          <div className="flex items-center justify-between text-[10px] uppercase font-black text-[var(--text-muted)] tracking-wider">
            <span>Core Data Health</span>
            <span className="text-[var(--color-positive)]">99.9%</span>
          </div>
          <div className="w-full bg-[var(--bg-surface-alt)] h-1 mt-1 rounded-full overflow-hidden">
            <div className="bg-[var(--color-positive)] h-full w-[99.9%]" />
          </div>
        </div>
      </div>
    </div>
  )
}
