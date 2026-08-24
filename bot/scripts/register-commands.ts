/**
 * Manual slash-command registration against every guild in DISCORD_GUILD_ID.
 * Registration also runs automatically at bot startup (src/index.ts via
 * src/register.ts); this script remains the standalone lever for registering
 * without booting the gateway. Run via `npm run register` after setting
 * DISCORD_TOKEN, DISCORD_APP_ID, and DISCORD_GUILD_ID in the environment/.env.
 *
 * DISCORD_GUILD_ID doubles as the runtime allowlist (config.ts's
 * allowedGuildIds) -- registering to only the first guild would leave any
 * additional configured guild with the runtime gate open but no slash
 * commands actually registered, a broken half-state.
 */
import { loadConfig } from '../src/config.js'
import { loadEnvFileIfPresent } from '../src/env.js'
import { registerCommands } from '../src/register.js'

async function main(): Promise<void> {
  loadEnvFileIfPresent()
  await registerCommands(loadConfig())
}

main().catch(err => {
  console.error('Failed to register commands:', err)
  process.exit(1)
})
