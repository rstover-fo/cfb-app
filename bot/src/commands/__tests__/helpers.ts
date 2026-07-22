import { vi } from 'vitest'

interface FakeOptions {
  strings?: Record<string, string>
  integers?: Record<string, number>
  focused?: string
}

/** Minimal ChatInputCommandInteraction stand-in covering what command execute()s touch. */
export function fakeChatInputInteraction(options: FakeOptions = {}) {
  return {
    options: {
      getString: vi.fn((name: string) => options.strings?.[name] ?? null),
      getInteger: vi.fn((name: string) => options.integers?.[name] ?? null),
      getFocused: vi.fn(() => options.focused ?? ''),
    },
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    replied: false,
    deferred: false,
    // Intentionally `any`: this is a hand-rolled structural stand-in for
    // discord.js's ChatInputCommandInteraction, not the real class.
  } as any
}

/** Minimal AutocompleteInteraction stand-in. */
export function fakeAutocompleteInteraction(focused: string) {
  return {
    options: { getFocused: vi.fn(() => focused) },
    respond: vi.fn().mockResolvedValue(undefined),
    // Intentionally `any`: hand-rolled stand-in for AutocompleteInteraction.
  } as any
}

/** Pulls the first embed's plain-object JSON out of a reply()/followUp() mock call. */
export function firstEmbedJson(mockFn: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = mockFn.mock.calls[0]?.[0] as { embeds: { toJSON: () => Record<string, unknown> }[] }
  const embed = call.embeds[0]
  if (!embed) throw new Error('No embed found in reply payload')
  return embed.toJSON()
}
