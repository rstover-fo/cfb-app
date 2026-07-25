/**
 * @testing-library/user-event isn't installed in this project (see
 * GameTabSelector.test.tsx / TeamPageClient.tabs.test.tsx for the same
 * constraint), so form interaction here uses fireEvent directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SignInForm } from '../SignInForm'
import type { MagicLinkState } from '@/app/account/actions'

const requestMagicLink = vi.fn()

vi.mock('@/app/account/actions', () => ({
  requestMagicLink: (prevState: MagicLinkState, formData: FormData) =>
    requestMagicLink(prevState, formData),
}))

beforeEach(() => {
  requestMagicLink.mockReset()
})

describe('SignInForm', () => {
  it('renders an email input and submit button', () => {
    render(<SignInForm />)

    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send magic link' })).toBeInTheDocument()
  })

  it('shows the "check your email" success state after a successful submit', async () => {
    requestMagicLink.mockResolvedValue({ status: 'sent' })

    render(<SignInForm next="/predictions" />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rob@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send magic link' }))

    expect(await screen.findByText('Check your email')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  })

  it('shows the error message when the action reports an error', async () => {
    requestMagicLink.mockResolvedValue({ status: 'error', message: 'Enter a valid email address.' })

    render(<SignInForm />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send magic link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.')
  })

  it('forwards `next` as a hidden field', () => {
    render(<SignInForm next="/predictions?week=3" />)

    const hidden = document.querySelector('input[name="next"]') as HTMLInputElement
    expect(hidden).toBeInTheDocument()
    expect(hidden.value).toBe('/predictions?week=3')
  })
})
