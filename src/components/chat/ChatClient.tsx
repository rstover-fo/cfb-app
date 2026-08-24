'use client'

import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { useEveAgent, type EveMessage } from 'eve/react'
import { PaperPlaneTilt, WarningCircle, CircleNotch } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ChatMessageList } from './ChatMessageList'

interface ChatClientProps {
  displayName: string
  discordSnowflake: string | null
}

function lastUserText(messages: readonly EveMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== 'user') continue
    const textPart = message.parts.find((part) => part.type === 'text')
    return textPart && 'text' in textPart ? textPart.text : null
  }
  return null
}

/**
 * Authenticated chat surface for the app-hosted eve agent, wired on
 * `useEveAgent()` from `eve/react` (same-origin default: no `agent`/`host`
 * option needed, since withEve() in next.config.ts mounts the one agent at
 * /eve/v1/* and requests carry the Supabase session cookie automatically).
 *
 * `data.messages` is eve's default UIMessage-compatible projection --
 * text/reasoning/tool/authorization parts -- rendered by ChatMessageList.
 * `status` drives the disabled/thinking/error affordances here.
 */
export function ChatClient({ displayName, discordSnowflake }: ChatClientProps) {
  const { data, status, send } = useEveAgent()
  const [draft, setDraft] = useState('')

  const isBusy = status === 'submitted' || status === 'streaming'

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || isBusy) return
    setDraft('')
    try {
      await send(text)
    } catch {
      // The snapshot's status/error already reflect the failure -- the
      // error banner below is what the visitor sees.
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      e.currentTarget.form?.requestSubmit()
    }
  }

  function handleRetry() {
    const text = lastUserText(data.messages)
    if (text) void send(text)
  }

  return (
    <div className="flex flex-col h-[70vh] min-h-[420px] rounded-lg border-[1.5px] border-[var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-soft)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-[var(--border)]">
        <p className="text-xs text-[var(--text-muted)] truncate">
          Signed in as <span className="text-[var(--text-secondary)] font-medium">{displayName}</span>
          {discordSnowflake && <span className="hidden sm:inline"> &middot; Discord {discordSnowflake}</span>}
        </p>
        {status === 'submitted' && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--text-muted)] italic">
            <CircleNotch size={12} weight="bold" className="animate-spin" aria-hidden="true" />
            Thinking…
          </span>
        )}
      </div>

      <ChatMessageList messages={data.messages} />

      {status === 'error' && (
        <div
          role="alert"
          className="mx-4 sm:mx-6 mb-3 flex items-center justify-between gap-3 rounded border border-[var(--color-negative)] bg-[var(--color-negative)]/10 px-3 py-2"
        >
          <span className="flex items-center gap-2 text-sm text-[var(--color-negative)]">
            <WarningCircle size={16} weight="thin" aria-hidden="true" />
            The Savant didn&apos;t respond. Give it another try.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={handleRetry}>
            Try again
          </Button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-[var(--border)] p-3 sm:p-4">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about a team, a matchup, a stat…"
          rows={1}
          disabled={isBusy}
          aria-label="Message"
          className="flex-1 resize-none rounded border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-run)] focus:border-transparent disabled:opacity-60"
        />
        <Button type="submit" size="icon" disabled={isBusy || draft.trim().length === 0} aria-label="Send message">
          <PaperPlaneTilt size={18} weight="fill" />
        </Button>
      </form>
    </div>
  )
}
