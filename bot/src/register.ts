/**
 * Guild slash-command registration, shared by startup (index.ts) and the
 * manual script (scripts/register-commands.ts). Registers the full command
 * set to every guild in allowedGuildIds -- a PUT replaces the guild's whole
 * list, so repeated runs are idempotent and removals propagate too.
 *
 * Registration requires the application to be authorized in the target
 * guild WITH the applications.commands scope; without it Discord answers
 * 50001 Missing Access. That failure mode is why registration also runs at
 * startup: a guild authorized after the last manual run gets its commands
 * on the next deploy/restart instead of waiting for someone to remember
 * the script.
 */
import { REST, Routes } from 'discord.js'
import type { BotConfig } from './config.js'
import { commands } from './commands/index.js'

export async function registerCommands(
  config: Pick<BotConfig, 'discordToken' | 'discordAppId' | 'allowedGuildIds'>
): Promise<void> {
  const rest = new REST().setToken(config.discordToken)
  const body = commands.map(c => c.definition.toJSON())

  for (const guildId of config.allowedGuildIds) {
    const result = (await rest.put(Routes.applicationGuildCommands(config.discordAppId, guildId), {
      body,
    })) as unknown[]
    console.log(`[bot] Registered ${result.length} command(s) to guild ${guildId}`)
  }
}
