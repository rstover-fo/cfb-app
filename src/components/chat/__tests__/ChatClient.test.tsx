import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatClient } from '../ChatClient'

const sendMock = vi.fn()
let mockSnapshot: {
  data: { messages: unknown[] }
  status: 'ready' | 'submitted' | 'streaming' | 'error'
}

// Per the task's mocking convention: eve/react's useEveAgent is the one
// piece of runtime surface ChatClient depends on that we don't own.
vi.mock('eve/react', () => ({
  useEveAgent: () => ({
    ...mockSnapshot,
    error: undefined,
    events: [],
    session: undefined,
    send: sendMock,
    cancel: vi.fn(),
    reset: vi.fn(),
    resume: vi.fn(),
    respond: vi.fn(),
  }),
}))

describe('ChatClient', () => {
  beforeEach(() => {
    sendMock.mockReset()
    mockSnapshot = { data: { messages: [] }, status: 'ready' }
  })

  it('renders the signed-in display name and an empty-state prompt', () => {
    render(<ChatClient displayName="Boomer Sooner" discordSnowflake="123456789012345678" />)

    expect(screen.getByText(/Boomer Sooner/)).toBeInTheDocument()
    expect(screen.getByText(/Discord 123456789012345678/)).toBeInTheDocument()
    expect(screen.getByText(/Ask about a team/)).toBeInTheDocument()
  })

  it('sends the typed message on submit and clears the input', () => {
    render(<ChatClient displayName="Boomer Sooner" discordSnowflake={null} />)

    const textbox = screen.getByLabelText('Message') as HTMLTextAreaElement
    fireEvent.change(textbox, { target: { value: 'How good is OU?' } })
    fireEvent.submit(textbox.closest('form')!)

    expect(sendMock).toHaveBeenCalledWith('How good is OU?')
    expect(textbox.value).toBe('')
  })

  it('does not send an empty or whitespace-only message', () => {
    render(<ChatClient displayName="Boomer Sooner" discordSnowflake={null} />)

    const textbox = screen.getByLabelText('Message')
    fireEvent.change(textbox, { target: { value: '   ' } })
    fireEvent.submit(textbox.closest('form')!)

    expect(sendMock).not.toHaveBeenCalled()
  })

  it('disables the input while a turn is streaming', () => {
    mockSnapshot = { data: { messages: [] }, status: 'streaming' }
    render(<ChatClient displayName="Boomer Sooner" discordSnowflake={null} />)

    expect(screen.getByLabelText('Message')).toBeDisabled()
  })

  it('shows a "Thinking" indicator once a turn is submitted', () => {
    mockSnapshot = { data: { messages: [] }, status: 'submitted' }
    render(<ChatClient displayName="Boomer Sooner" discordSnowflake={null} />)

    expect(screen.getByText(/Thinking/)).toBeInTheDocument()
  })

  it('shows a retry banner on error and resends the last user message', () => {
    mockSnapshot = {
      data: {
        messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'How good is OU?' }] }],
      },
      status: 'error',
    }
    render(<ChatClient displayName="Boomer Sooner" discordSnowflake={null} />)

    expect(screen.getByRole('alert')).toHaveTextContent(/didn.t respond/)

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(sendMock).toHaveBeenCalledWith('How good is OU?')
  })
})
