import { describe, it, expect, vi, beforeEach } from 'vitest'

const { setLoreEnabledMock } = vi.hoisted(() => ({ setLoreEnabledMock: vi.fn() }))
vi.mock('../../settings.js', () => ({ setLoreEnabled: setLoreEnabledMock }))

import { loreCommand } from '../lore.js'
import { fakeChatInputInteraction } from './helpers.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loreCommand', () => {
  it('persists off and confirms publicly', async () => {
    setLoreEnabledMock.mockResolvedValue(undefined)
    const interaction = fakeChatInputInteraction({ strings: { state: 'off' } })

    await loreCommand.execute(interaction)

    expect(setLoreEnabledMock).toHaveBeenCalledWith(false)
    const reply = interaction.reply.mock.calls[0][0] as string
    expect(reply).toContain('off')
    expect(reply).toContain('/lore on')
  })

  it('persists on', async () => {
    setLoreEnabledMock.mockResolvedValue(undefined)
    const interaction = fakeChatInputInteraction({ strings: { state: 'on' } })

    await loreCommand.execute(interaction)

    expect(setLoreEnabledMock).toHaveBeenCalledWith(true)
  })

  it('never throws when persistence fails, replies with an error embed', async () => {
    setLoreEnabledMock.mockRejectedValue(new Error('disk full'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const interaction = fakeChatInputInteraction({ strings: { state: 'off' } })

    await expect(loreCommand.execute(interaction)).resolves.toBeUndefined()
    expect(interaction.reply).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
