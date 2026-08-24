import type { User } from '@supabase/supabase-js'
import { getSessionUser, getDiscordSnowflake } from '@/lib/supabase/auth-server'
import { ChatSignInCard } from '@/components/chat/ChatSignInCard'
import { ChatClient } from '@/components/chat/ChatClient'
import { WidgetErrorBoundary } from '@/components/dashboard/WidgetErrorBoundary'

export const metadata = {
  title: 'Ask the Savant | CFB Team 360',
  description: 'Chat with the house analytics agent -- rankings, matchups, EPA, and model output, in plain English.',
}

interface ChatPageProps {
  searchParams: Promise<{ error?: string }>
}

function resolveDisplayName(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined
  const candidate = meta?.full_name ?? meta?.name ?? meta?.user_name
  if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate
  return user.email ?? 'there'
}

// Only /chat itself requires auth to use -- the route is otherwise public,
// so signed-out visitors still get a real page (a sign-in card) rather than
// a middleware redirect loop. See middleware.ts's matcher + gate.
export default async function ChatPage({ searchParams }: ChatPageProps) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams])

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          Ask the Savant
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-2xl">
          Chat with the house analytics agent -- rankings, matchups, EPA, and model output, in plain English.
        </p>
      </header>

      {user ? (
        <WidgetErrorBoundary title="Ask the Savant">
          <ChatClient displayName={resolveDisplayName(user)} discordSnowflake={getDiscordSnowflake(user)} />
        </WidgetErrorBoundary>
      ) : (
        <ChatSignInCard errorParam={params.error} />
      )}
    </div>
  )
}
