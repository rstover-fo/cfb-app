/**
 * Shared renderer for conversational answers, used by BOTH answer paths:
 * /ask (src/commands/ask.ts) and @-mentions (src/mention.ts). Before this
 * existed the two paths each called splitMessage() and sent bare strings,
 * so any change to how an answer looks had to be made twice.
 *
 * Answers render as Components V2 containers rather than plain content.
 * Two constraints shape the design:
 *
 * 1. Rendering happens DOWNSTREAM of askClaude(), never inside it.
 *    askClaude() must keep returning `text` as a plain string because
 *    evals/run.ts reads it for regex assertions, maxChars, and judge
 *    prompts -- and memory.ts stores it as conversation history.
 *
 * 2. Opting a message into Components V2 disables its `content`, `embeds`,
 *    `poll`, and `stickers` fields, and the flag cannot be removed from a
 *    message once sent. That is per-MESSAGE, so error/refusal paths still
 *    send plain strings or embeds as their own separate messages -- what the
 *    API rejects is a container and a `content` string in ONE payload.
 *
 * Chart images (from the render_chart MCP tool, see src/claude.ts's
 * ChartInfo/askClaude) render as a MediaGallery attached to the FIRST
 * payload's container, using the chart's external URL directly -- the bot
 * has no ATTACH_FILES permission, so `attachment://` is never an option, and
 * external image URLs need only Embed Links. The URL is stripped out of the
 * chunked text first (splitMessage is URL-unaware and could otherwise cut a
 * bare URL mid-string at a chunk boundary).
 */
import { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, TextDisplayBuilder } from 'discord.js'
import { splitMessage } from '../format.js'
import type { ChartInfo } from '../claude.js'

export interface AnswerPayload {
  components: ContainerBuilder[]
  flags: MessageFlags.IsComponentsV2
}

export interface AnswerRenderOptions {
  /** Container accent bar, e.g. a team's brand color as 0xRRGGBB. */
  accentColor?: number
  /** Chart(s) to render as a MediaGallery on the first payload. Extracted
   * structurally from tool results (src/claude.ts) -- never derived from
   * `text` here. */
  charts?: ChartInfo[]
}

/**
 * Removes a chart's URL from the answer text before chunking, so
 * splitMessage (URL-unaware) can't slice it mid-string at a chunk boundary.
 * Only strips URLs actually passed in `charts` -- never anything merely
 * chart-shaped -- so if chart extraction ever misses one, that URL survives
 * as a plain clickable link in the text instead of vanishing outright.
 * Cleans up any blank line the removal leaves behind.
 */
function stripChartUrls(text: string, charts: ChartInfo[]): string {
  let result = text
  for (const chart of charts) {
    result = result.split(chart.url).join('')
  }
  // Collapse runs of 3+ newlines (a removed URL's own line plus the
  // paragraph breaks around it) down to a single blank line, and trim
  // leftover trailing/leading whitespace on each line the removal produced.
  return result
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Renders an answer into one payload per chunk. Most answers fit a single
 * container -- splitMessage's cap is sized against the Components V2 text
 * budget -- but long ones still split, and each extra payload is a separate
 * message on both paths (followUp for /ask, another reply for mentions).
 *
 * Returns [] for blank input, matching splitMessage's contract; both call
 * sites already branch on that to show their own "came back empty" message.
 */
export function buildAnswerPayloads(text: string, opts: AnswerRenderOptions = {}): AnswerPayload[] {
  const charts = opts.charts ?? []
  const strippedText = charts.length > 0 ? stripChartUrls(text, charts) : text

  const payloads = splitMessage(strippedText).map(chunk => {
    const container = new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(chunk)
    )
    if (opts.accentColor != null) container.setAccentColor(opts.accentColor)
    return { components: [container], flags: MessageFlags.IsComponentsV2 as const }
  })

  const firstContainer = payloads[0]?.components[0]
  if (firstContainer && charts.length > 0) {
    const gallery = new MediaGalleryBuilder().addItems(
      charts.map(chart => new MediaGalleryItemBuilder().setURL(chart.url).setDescription(chart.alt))
    )
    firstContainer.addMediaGalleryComponents(gallery)
  }

  return payloads
}
