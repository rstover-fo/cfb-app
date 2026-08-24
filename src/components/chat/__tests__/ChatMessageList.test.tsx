import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatMessageList } from '../ChatMessageList'
import type { EveMessage } from 'eve/react'

function userMessage(text: string): EveMessage {
  return { id: 'u1', role: 'user', parts: [{ type: 'text', text }] }
}

function assistantMessage(parts: EveMessage['parts']): EveMessage {
  return { id: 'a1', role: 'assistant', parts }
}

describe('ChatMessageList', () => {
  it('shows an empty-state prompt when there are no messages yet', () => {
    render(<ChatMessageList messages={[]} />)
    expect(screen.getByText(/Ask about a team/)).toBeInTheDocument()
  })

  it('renders user and assistant text turns', () => {
    render(
      <ChatMessageList
        messages={[
          userMessage('How good is Oklahoma this year?'),
          assistantMessage([{ type: 'text', text: 'Oklahoma ranks 4th in offensive EPA.' }]),
        ]}
      />
    )

    expect(screen.getByText('How good is Oklahoma this year?')).toBeInTheDocument()
    expect(screen.getByText('Oklahoma ranks 4th in offensive EPA.')).toBeInTheDocument()
    expect(screen.getByText('The Savant')).toBeInTheDocument()
  })

  it('renders bold and list markdown-ish formatting without any raw HTML', () => {
    const { container } = render(
      <ChatMessageList
        messages={[
          assistantMessage([
            {
              type: 'text',
              text: '**Top 3 teams**\n\n- Oklahoma\n- Texas\n- Ohio State',
            },
          ]),
        ]}
      />
    )

    expect(screen.getByText('Top 3 teams').tagName).toBe('STRONG')
    expect(screen.getByText('Oklahoma').tagName).toBe('LI')
    expect(container.querySelector('script')).toBeNull()
  })

  it('renders a tool-activity line while a non-chart tool is running', () => {
    render(
      <ChatMessageList
        messages={[
          assistantMessage([
            {
              type: 'dynamic-tool',
              toolCallId: 'call-1',
              toolName: 'get_rankings',
              state: 'input-available',
              input: {},
            },
          ]),
        ]}
      />
    )

    expect(screen.getByText(/Get Rankings/)).toBeInTheDocument()
  })

  it('renders nothing for a completed non-chart tool call', () => {
    render(
      <ChatMessageList
        messages={[
          assistantMessage([
            {
              type: 'dynamic-tool',
              toolCallId: 'call-1',
              toolName: 'get_rankings',
              state: 'output-available',
              input: {},
              output: { rankings: [] },
            },
          ]),
        ]}
      />
    )

    expect(screen.queryByText(/Get Rankings/)).not.toBeInTheDocument()
  })

  it('renders a chart image for a completed render_chart tool call', () => {
    render(
      <ChatMessageList
        messages={[
          assistantMessage([
            {
              type: 'dynamic-tool',
              toolCallId: 'call-2',
              toolName: 'render_chart',
              state: 'output-available',
              input: {},
              output: JSON.stringify({
                url: 'https://cfb-app.example.com/api/chart/abc.png',
                alt: 'EPA trend',
              }),
            },
          ]),
        ]}
      />
    )

    const img = screen.getByRole('img', { name: 'EPA trend' })
    expect(img).toHaveAttribute('src', 'https://cfb-app.example.com/api/chart/abc.png')
  })

  it('renders a friendly note when a render_chart tool call errors', () => {
    render(
      <ChatMessageList
        messages={[
          assistantMessage([
            {
              type: 'dynamic-tool',
              toolCallId: 'call-3',
              toolName: 'render_chart',
              state: 'output-error',
              input: {},
              errorText: 'boom',
            },
          ]),
        ]}
      />
    )

    expect(screen.getByText(/Couldn.t render that chart/)).toBeInTheDocument()
  })

  it('renders a friendly note when render_chart output is malformed', () => {
    render(
      <ChatMessageList
        messages={[
          assistantMessage([
            {
              type: 'dynamic-tool',
              toolCallId: 'call-4',
              toolName: 'render_chart',
              state: 'output-available',
              input: {},
              output: 'not valid json',
            },
          ]),
        ]}
      />
    )

    expect(screen.getByText(/Couldn.t render that chart/)).toBeInTheDocument()
  })
})
