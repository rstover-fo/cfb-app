import { Fragment } from 'react'

// Splits on **bold** while keeping the delimiters so we know which spans to
// wrap in <strong>. Every other span (including the raw ** for an
// unterminated marker) renders as plain text -- never HTML.
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g).filter((part) => part.length > 0)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
    }
    return <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>
  })
}

interface MarkdownishTextProps {
  text: string
}

/**
 * Tiny, dependency-free renderer for assistant chat text: recognizes
 * `#`/`##`/`###` headers, `-`/`*`/`1.` list items, and `**bold**` inline --
 * everything else is plain whitespace-preserved prose.
 *
 * No HTML parsing anywhere: every branch renders through React text
 * children, never dangerouslySetInnerHTML, the same rule GameRecap follows
 * for the same reason -- this text is untrusted LLM output.
 */
export function MarkdownishText({ text }: MarkdownishTextProps) {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  if (blocks.length === 0) return null

  return (
    <div className="space-y-2">
      {blocks.map((block, blockIndex) => {
        const lines = block.split('\n')
        const headerMatch = lines.length === 1 ? lines[0].match(/^(#{1,3})\s+(.*)$/) : null

        if (headerMatch) {
          const level = headerMatch[1].length
          const content = headerMatch[2]
          const className =
            level === 1
              ? 'font-headline text-lg'
              : level === 2
                ? 'font-headline text-base'
                : 'font-semibold text-sm'
          return (
            <p key={blockIndex} className={className}>
              {renderInline(content, `h-${blockIndex}`)}
            </p>
          )
        }

        const isList = lines.every((line) => /^\s*([-*]|\d+\.)\s+/.test(line))
        if (isList) {
          return (
            <ul key={blockIndex} className="list-disc pl-5 space-y-1">
              {lines.map((line, lineIndex) => {
                const content = line.replace(/^\s*([-*]|\d+\.)\s+/, '')
                return (
                  <li key={lineIndex} className="text-sm leading-relaxed">
                    {renderInline(content, `li-${blockIndex}-${lineIndex}`)}
                  </li>
                )
              })}
            </ul>
          )
        }

        return (
          <p key={blockIndex} className="text-sm leading-relaxed whitespace-pre-wrap">
            {lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {renderInline(line, `p-${blockIndex}-${lineIndex}`)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
