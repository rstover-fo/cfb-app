import type { GameRecap as GameRecapData } from '@/lib/types/database'

interface GameRecapProps {
  recap: GameRecapData
}

function formatGeneratedDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// AI-generated recap block. headline/recap are LLM prose from
// api.game_recaps (see src/lib/queries/games.ts's getGameRecap) -- rendered
// as plain-text React children only, never dangerouslySetInnerHTML, since
// the source is untrusted LLM output.
export function GameRecap({ recap }: GameRecapProps) {
  // The recap is written as one or two paragraphs separated by a blank
  // line; split defensively in case the model emits a single block.
  const paragraphs = recap.recap
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-4 sm:p-6">
      <h2 className="font-headline text-xl sm:text-2xl text-[var(--text-primary)] mb-3">
        {recap.headline}
      </h2>

      <div className="space-y-3">
        {paragraphs.map((paragraph, i) => (
          <p key={i} className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
            {paragraph}
          </p>
        ))}
      </div>

      <p className="mt-4 pt-3 border-t border-[var(--border)] text-xs text-[var(--text-muted)] italic">
        AI-generated recap &middot; {formatGeneratedDate(recap.generated_at)}
      </p>
    </div>
  )
}
