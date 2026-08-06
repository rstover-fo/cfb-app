import { vi } from 'vitest'

/** The guild ID these fakes default to -- tests that exercise the runtime guild
 * gate (index.test.ts) should set DISCORD_GUILD_ID to include this value. */
export const TEST_GUILD_ID = 'test-guild'

interface FakeOptions {
  strings?: Record<string, string>
  integers?: Record<string, number>
  /** Subcommand name for subcommands-only commands (interaction.options.getSubcommand()). */
  subcommand?: string
  focused?: string
  guildId?: string | null
}

/** Minimal ChatInputCommandInteraction stand-in covering what command execute()s touch. */
export function fakeChatInputInteraction(options: FakeOptions = {}) {
  return {
    options: {
      getString: vi.fn((name: string) => options.strings?.[name] ?? null),
      getInteger: vi.fn((name: string) => options.integers?.[name] ?? null),
      getSubcommand: vi.fn(() => {
        if (!options.subcommand) throw new Error('No subcommand configured on this fake interaction')
        return options.subcommand
      }),
      getFocused: vi.fn(() => options.focused ?? ''),
    },
    user: { id: 'test-user' },
    channelId: 'test-channel',
    guildId: options.guildId === undefined ? TEST_GUILD_ID : options.guildId,
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
export function fakeAutocompleteInteraction(focused: string, guildId: string | null = TEST_GUILD_ID) {
  return {
    options: { getFocused: vi.fn(() => focused) },
    guildId,
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

/** Pulls the first component's (the Components V2 ContainerBuilder's) plain-object
 * JSON out of a reply()/editReply()/followUp() mock call. Sibling to
 * firstEmbedJson() for the CV2 payload shape buildAnswerPayloads() produces
 * (src/render/answer.ts): `{ components: [ContainerBuilder], flags }`. */
export function firstComponentJson(mockFn: ReturnType<typeof vi.fn>, callIndex = 0): Record<string, unknown> {
  const call = mockFn.mock.calls[callIndex]?.[0] as { components: { toJSON: () => Record<string, unknown> }[] }
  const component = call.components[0]
  if (!component) throw new Error('No component found in reply payload')
  return component.toJSON()
}
