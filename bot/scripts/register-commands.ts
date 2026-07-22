/**
 * Registers all slash command definitions against a single guild
 * (instant propagation, unlike global commands which can take up to an
 * hour to appear). Run via `npm run register` after setting DISCORD_TOKEN,
 * DISCORD_APP_ID, and DISCORD_GUILD_ID in the environment/.env.
 */
import { REST, Routes } from 'discord.js'
import { loadConfig } from '../src/config.js'
import { commands } from '../src/commands/index.js'

async function main(): Promise<void> {
  const config = loadConfig()
  const rest = new REST().setToken(config.discordToken)
  const body = commands.map(c => c.definition.toJSON())

  const result = (await rest.put(Routes.applicationGuildCommands(config.discordAppId, config.discordGuildId), {
    body,
  })) as unknown[]

  console.log(`Registered ${result.length} command(s) to guild ${config.discordGuildId}:`)
  for (const command of commands) console.log(`  /${command.definition.name}`)
}

main().catch(err => {
  console.error('Failed to register commands:', err)
  process.exit(1)
})
