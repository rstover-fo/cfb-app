/**
 * Covers registerCommands (src/register.ts): the shared registration used
 * by both bot startup and `npm run register` -- one PUT of the full command
 * set per allowed guild, using the configured token and app id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { restPutMock, setTokenMock, guildCommandsRouteMock } = vi.hoisted(() => ({
  restPutMock: vi.fn(),
  setTokenMock: vi.fn(),
  guildCommandsRouteMock: vi.fn((appId: string, guildId: string) => `/route/${appId}/${guildId}`),
}))

vi.mock('discord.js', () => ({
  REST: class {
    setToken(token: string) {
      setTokenMock(token)
      return this
    }
    put(...args: unknown[]) {
      return restPutMock(...args)
    }
  },
  Routes: { applicationGuildCommands: guildCommandsRouteMock },
}))

vi.mock('../commands/index.js', () => ({
  commands: [
    { definition: { toJSON: () => ({ name: 'ask' }) } },
    { definition: { toJSON: () => ({ name: 'picks' }) } },
  ],
}))

import { registerCommands } from '../register.js'

const CONFIG = {
  discordToken: 'token-123',
  discordAppId: 'app-456',
  allowedGuildIds: ['guild-1', 'guild-2'],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  restPutMock.mockResolvedValue([{ name: 'ask' }, { name: 'picks' }])
})

describe('registerCommands', () => {
  it('PUTs the full command set to every allowed guild with the configured credentials', async () => {
    await registerCommands(CONFIG)

    expect(setTokenMock).toHaveBeenCalledWith('token-123')
    expect(guildCommandsRouteMock).toHaveBeenCalledWith('app-456', 'guild-1')
    expect(guildCommandsRouteMock).toHaveBeenCalledWith('app-456', 'guild-2')
    expect(restPutMock).toHaveBeenCalledTimes(2)
    expect(restPutMock).toHaveBeenCalledWith('/route/app-456/guild-1', {
      body: [{ name: 'ask' }, { name: 'picks' }],
    })
  })

  it('one failing guild does not block the rest; failures surface as one aggregate error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    restPutMock.mockRejectedValueOnce(new Error('Missing Access'))
    restPutMock.mockResolvedValueOnce([{ name: 'ask' }, { name: 'picks' }])

    await expect(registerCommands(CONFIG)).rejects.toThrow('command registration failed for guild(s): guild-1')

    // guild-2 was still registered despite guild-1's rejection.
    expect(restPutMock).toHaveBeenCalledTimes(2)
    expect(guildCommandsRouteMock).toHaveBeenCalledWith('app-456', 'guild-2')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('resolves cleanly when every guild registers', async () => {
    await expect(registerCommands(CONFIG)).resolves.toBeUndefined()
  })
})
