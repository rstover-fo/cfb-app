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
 */
import { ContainerBuilder, MessageFlags, TextDisplayBuilder } from 'discord.js'
import { splitMessage } from '../format.js'

export interface AnswerPayload {
  components: ContainerBuilder[]
  flags: MessageFlags.IsComponentsV2
}

export interface AnswerRenderOptions {
  /** Container accent bar, e.g. a team's brand color as 0xRRGGBB. */
  accentColor?: number
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
  return splitMessage(text).map(chunk => {
    const container = new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(chunk)
    )
    if (opts.accentColor != null) container.setAccentColor(opts.accentColor)
    return { components: [container], flags: MessageFlags.IsComponentsV2 }
  })
}
