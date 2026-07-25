/**
 * Registers all slash command definitions against every guild in
 * DISCORD_GUILD_ID (instant propagation, unlike global commands which can
 * take up to an hour to appear). Run via `npm run register` after setting
 * DISCORD_TOKEN, DISCORD_APP_ID, and DISCORD_GUILD_ID in the environment/.env.
 *
 * DISCORD_GUILD_ID doubles as the runtime allowlist (config.ts's
 * allowedGuildIds) -- registering to only the first guild would leave any
 * additional configured guild with the runtime gate open but no slash
 * commands actually registered, a broken half-state.
 */
import { REST, Routes } from 'discord.js'
import { loadConfig } from '../src/config.js'
import { loadEnvFileIfPresent } from '../src/env.js'
import { commands } from '../src/commands/index.js'

async function main(): Promise<void> {
  loadEnvFileIfPresent()
  const config = loadConfig()
  const rest = new REST().setToken(config.discordToken)
  const body = commands.map(c => c.definition.toJSON())

  for (const guildId of config.allowedGuildIds) {
    const result = (await rest.put(Routes.applicationGuildCommands(config.discordAppId, guildId), {
      body,
    })) as unknown[]

    console.log(`Registered ${result.length} command(s) to guild ${guildId}:`)
    for (const command of commands) console.log(`  /${command.definition.name}`)
  }
}

main().catch(err => {
  console.error('Failed to register commands:', err)
  process.exit(1)
})
