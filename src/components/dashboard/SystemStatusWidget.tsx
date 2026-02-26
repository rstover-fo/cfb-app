// cfb-app/src/components/dashboard/SystemStatusWidget.tsx
import React from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Activity, Database, Cloud, Zap } from 'lucide-react'

export const SystemStatusWidget: React.FC = () => {
  // In a real app, these would come from an API endpoint or WebSocket
  const agents = [
    { name: 'Cub Crawler', status: 'idle', lastSeen: '2m ago', active: false },
    { name: 'Sentiment Aggregator', status: 'processing', lastSeen: 'Just now', active: true },
    { name: 'Embedding Vectorizer', status: 'idle', lastSeen: '15m ago', active: false }
  ]

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-200">
          <Activity className="h-4 w-4 text-blue-500" />
          Agent Orchestration Pulse
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {agents.map((agent) => (
          <div key={agent.name} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={`h-2.5 w-2.5 rounded-full ${agent.active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`} />
                {agent.active && (
                  <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping opacity-75" />
                )}
              </div>
              <div>
                <div className="text-xs font-medium text-slate-300">{agent.name}</div>
                <div className="text-[10px] text-slate-500 capitalize">{agent.status} • {agent.lastSeen}</div>
              </div>
            </div>
            {agent.active && (
              <Zap className="h-3 w-3 text-amber-500 animate-bounce" />
            )}
          </div>
        ))}

        <div className="pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between text-[10px] uppercase font-bold text-slate-500 tracking-wider">
            <span>Database Health</span>
            <span className="text-emerald-500">99.9%</span>
          </div>
          <div className="w-full bg-slate-800 h-1 mt-1 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full w-[99.9%]" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
