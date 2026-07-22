/**
 * Slash command registry. Each command module exports a `Command`:
 * a discord.js slash-command definition plus its execute() (and, for
 * team-name options, autocomplete()) handler. index.ts (gateway wiring) and
 * scripts/register-commands.ts both consume `commands`/`commandsByName`
 * rather than importing individual command modules.
 */
import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js'
import type { SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js'

export type SlashCommandDefinition = SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder

export interface Command {
  definition: SlashCommandDefinition
  execute(interaction: ChatInputCommandInteraction): Promise<void>
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>
}

import { rankingsCommand } from './rankings.js'
import { scoresCommand } from './scores.js'
import { teamCommand } from './team.js'
import { matchupCommand } from './matchup.js'
import { edgesCommand } from './edges.js'
import { leadersCommand } from './leaders.js'
import { playerCommand } from './player.js'
import { askCommand } from './ask.js'
import { helpCommand } from './help.js'

export const commands: Command[] = [
  rankingsCommand,
  scoresCommand,
  teamCommand,
  matchupCommand,
  edgesCommand,
  leadersCommand,
  playerCommand,
  askCommand,
  helpCommand,
]

export const commandsByName: Map<string, Command> = new Map(commands.map(c => [c.definition.name, c]))
