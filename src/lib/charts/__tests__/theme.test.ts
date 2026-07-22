import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { resolveColor, useChartTheme } from '../theme'

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('class')
  document.documentElement.removeAttribute('data-theme')
})

describe('resolveColor', () => {
  it('resolves a var(--x) reference against documentElement', () => {
    document.documentElement.style.setProperty('--color-run', '#841617')
    expect(resolveColor('var(--color-run)')).toBe('#841617')
  })

  it('resolves a bare --x reference against documentElement', () => {
    document.documentElement.style.setProperty('--text-muted', '#666666')
    expect(resolveColor('--text-muted')).toBe('#666666')
  })

  it('returns non-var input unchanged (e.g. a literal hex color)', () => {
    expect(resolveColor('#333333')).toBe('#333333')
  })

  it('falls back to #999 when the CSS variable is unset', () => {
    expect(resolveColor('var(--totally-unset-var)')).toBe('#999')
  })
})

describe('useChartTheme', () => {
  it('fires the callback (via requestAnimationFrame) when data-theme flips', async () => {
    vi.useFakeTimers()
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })
    const onThemeChange = vi.fn()

    renderHook(() => useChartTheme(onThemeChange))

    document.documentElement.setAttribute('data-theme', 'dark')

    // MutationObserver callbacks fire as microtasks; flush them.
    await vi.waitFor(() => expect(onThemeChange).toHaveBeenCalledTimes(1))

    rafSpy.mockRestore()
    vi.useRealTimers()
  })

  it('fires the callback when the class attribute changes', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })
    const onThemeChange = vi.fn()

    renderHook(() => useChartTheme(onThemeChange))

    document.documentElement.className = 'dark'

    await vi.waitFor(() => expect(onThemeChange).toHaveBeenCalledTimes(1))

    rafSpy.mockRestore()
  })

  it('disconnects the observer on unmount', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })
    const onThemeChange = vi.fn()

    const { unmount } = renderHook(() => useChartTheme(onThemeChange))
    unmount()

    document.documentElement.setAttribute('data-theme', 'dark')

    // Give any (incorrectly still-connected) observer a chance to fire.
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(onThemeChange).not.toHaveBeenCalled()

    rafSpy.mockRestore()
  })
})
