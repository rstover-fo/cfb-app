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
import { isAllowedGuild, loadConfig } from './config.js'
import { loadEnvFileIfPresent } from './env.js'
import { commandsByName } from './commands/index.js'
import { errorEmbed } from './format.js'
import { handleMention } from './mention.js'
import { registerCommands } from './register.js'
import { startSettlementLoop } from './settlement.js'

const HOME_SERVER_ONLY_MESSAGE = 'This bot is only available in its home server.'

export function createClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  })
}

export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (interaction.isChatInputCommand()) {
    // Slash commands are registered per-guild (register-commands.ts), so
    // they shouldn't be invocable elsewhere -- this is defense in depth
    // against the Discord application's Public Bot setting. Reply
    // ephemerally rather than silently: the user is staring at a spinner
    // and the 3s interaction deadline applies.
    if (!isAllowedGuild(interaction.guildId)) {
      await interaction.reply({ content: HOME_SERVER_ONLY_MESSAGE, flags: MessageFlags.Ephemeral }).catch(() => {})
      return
    }

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
    if (!isAllowedGuild(interaction.guildId)) {
      await interaction.respond([]).catch(() => {})
      return
    }

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

export async function handleMessageCreate(message: Message): Promise<void> {
  try {
    // handleMention catches its own errors and replies with a friendly
    // message -- this is the last-resort backstop (mirrors handleInteraction)
    // so a messageCreate can never take the process down.
    await handleMention(message)
  } catch (err) {
    console.error('[bot] Unhandled messageCreate error:', err)
  }
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
  loadEnvFileIfPresent()
  const config = loadConfig()

  // Keep guild slash commands in sync with the code on every boot
  // (idempotent PUT per guild). Non-fatal by design: a Discord API blip
  // must not keep the gateway down, and `npm run register` remains the
  // manual recovery lever. Await it so a registration burst can't race
  // the first interactions after login.
  try {
    await registerCommands(config)
  } catch (err) {
    console.error('[bot] Command registration failed (continuing to login):', err)
  }

  const client = createClient()
  client.once(Events.ClientReady, readyClient => {
    console.log(`[bot] Logged in as ${readyClient.user.tag}`)
    // Prediction-ledger settlement: hourly, self-catching, zero MCP calls
    // when no picks are open. unref()'d, so it never holds the process.
    startSettlementLoop()
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
