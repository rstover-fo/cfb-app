import type { EveMessage, EveMessagePart, EveDynamicToolPart } from 'eve/react'
import { CircleNotch, Sparkle } from '@phosphor-icons/react'
import { MarkdownishText } from './markdownish'
import { parseChartResult } from './parseChartResult'

const RUNNING_STATES = new Set<EveDynamicToolPart['state']>([
  'input-streaming',
  'input-available',
  'approval-requested',
  'approval-responded',
])

function isRunning(state: EveDynamicToolPart['state']): boolean {
  return RUNNING_STATES.has(state)
}

function humanizeToolName(part: EveDynamicToolPart): string {
  const raw = part.toolMetadata?.eve?.name ?? part.toolName
  return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function ToolActivityLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] italic">
      <CircleNotch size={12} weight="bold" className="animate-spin" aria-hidden="true" />
      {label}…
    </div>
  )
}

function ToolPart({ part }: { part: EveDynamicToolPart }) {
  if (part.toolName === 'render_chart') {
    if (part.state === 'output-available' && !part.partial) {
      const chart = parseChartResult(part.output)
      if (chart) {
        // Absolute cross-origin URL from a tool result, not a static app
        // asset next/image can optimize; next.config.ts's remotePatterns is
        // out of scope for this task.
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={chart.url}
            alt={chart.alt}
            className="mt-1 max-w-full rounded border border-[var(--border)]"
          />
        )
      }
      return <p className="text-xs text-[var(--color-negative)] italic">Couldn&apos;t render that chart.</p>
    }
    if (part.state === 'output-error' || part.state === 'output-denied') {
      return <p className="text-xs text-[var(--color-negative)] italic">Couldn&apos;t render that chart.</p>
    }
    if (isRunning(part.state)) {
      return <ToolActivityLine label="Rendering chart" />
    }
    return null
  }

  if (isRunning(part.state)) {
    return <ToolActivityLine label={humanizeToolName(part)} />
  }

  // Terminal, non-chart tool calls fade back into the transcript once done --
  // the assistant's own text already narrates the result.
  return null
}

function MessagePart({ part, partKey }: { part: EveMessagePart; partKey: string }) {
  switch (part.type) {
    case 'text':
      return part.text.trim() ? <MarkdownishText key={partKey} text={part.text} /> : null
    case 'dynamic-tool':
      return <ToolPart key={partKey} part={part} />
    default:
      return null
  }
}

interface ChatMessageListProps {
  messages: readonly EveMessage[]
}

export function ChatMessageList({ messages }: ChatMessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-6">
        <p className="text-sm text-[var(--text-muted)] max-w-sm">
          Ask about a team, a matchup, a stat leaderboard, or how the model sees an upcoming game.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
      {messages.map((message) => (
        <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-[85%] sm:max-w-[75%] rounded-lg px-4 py-2.5 ${
              message.role === 'user'
                ? 'bg-[var(--color-run)] text-[var(--accent-foreground)]'
                : 'bg-[var(--bg-surface-alt)] text-[var(--text-primary)]'
            }`}
          >
            {message.role === 'assistant' && (
              <div className="flex items-center gap-1.5 mb-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <Sparkle size={12} weight="fill" aria-hidden="true" />
                The Savant
              </div>
            )}
            <div className="space-y-2">
              {message.parts.map((part, i) => (
                <MessagePart key={i} part={part} partKey={`${message.id}-${i}`} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
