/**
 * Gateway entrypoint: wires up the Discord client, dispatches
 * interactionCreate to the command registry, and installs process-level
 * error guards so a bad interaction or unhandled rejection never kills the
 * bot. The gateway only starts when this module is run directly (`tsx
 * src/index.ts` / `node dist/index.js`) -- importing it (as tests do) never
 * logs in.
 */
import {
  Client,
  GatewayIntentBits,
  Events,
  MessageFlags,
  type Interaction,
  type InteractionReplyOptions,
  type Message,
} from 'discord.js'
import { loadConfig } from './config.js'
import { commandsByName } from './commands/index.js'
import { errorEmbed } from './format.js'

export function createClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  })
}

export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (interaction.isChatInputCommand()) {
    const command = commandsByName.get(interaction.commandName)
    if (!command) return

    try {
      await command.execute(interaction)
    } catch (err) {
      // Command modules already catch their own errors and reply with an
      // errorEmbed -- this is the last-resort backstop for anything that
      // still escapes (e.g. the reply/followUp call itself failing).
      const embed = errorEmbed('Something went wrong', err instanceof Error ? err.message : String(err))
      const payload: InteractionReplyOptions = { embeds: [embed], flags: MessageFlags.Ephemeral }
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {})
      } else {
        await interaction.reply(payload).catch(() => {})
      }
    }
    return
  }

  if (interaction.isAutocomplete()) {
    const command = commandsByName.get(interaction.commandName)
    if (!command?.autocomplete) return

    try {
      await command.autocomplete(interaction)
    } catch {
      // Autocomplete has no user-facing error surface -- fail silently with
      // an empty choice list rather than leaving Discord waiting.
      await interaction.respond([]).catch(() => {})
    }
  }
}

// @-mention conversational handling lands in Phase B (claude.ts + mention.ts
// -- strip the mention, run the conversational Claude path, reply/typing
// loop). This stub keeps the wiring point visible without doing anything yet.
async function handleMessageCreate(_message: Message): Promise<void> {
  // Intentionally empty until Phase B.
}

function wireProcessGuards(): void {
  process.on('unhandledRejection', reason => {
    console.error('[bot] Unhandled rejection:', reason)
  })
  process.on('uncaughtException', err => {
    console.error('[bot] Uncaught exception:', err)
    process.exit(1)
  })
}

async function main(): Promise<void> {
  wireProcessGuards()
  const config = loadConfig()

  const client = createClient()
  client.once(Events.ClientReady, readyClient => {
    console.log(`[bot] Logged in as ${readyClient.user.tag}`)
  })
  client.on(Events.InteractionCreate, interaction => {
    void handleInteraction(interaction)
  })
  client.on(Events.MessageCreate, message => {
    void handleMessageCreate(message)
  })

  await client.login(config.discordToken)
}

const isEntryPoint = process.argv[1] != null && import.meta.url === `file://${process.argv[1]}`
if (isEntryPoint) {
  main().catch(err => {
    console.error('[bot] Fatal startup error:', err)
    process.exit(1)
  })
}
