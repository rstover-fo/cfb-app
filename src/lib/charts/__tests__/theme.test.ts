import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { resolveColor, resolveHeatColor, useChartTheme } from '../theme'
import type { HeatLevel } from '../theme'

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('class')
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-team-theme')
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

describe('resolveHeatColor', () => {
  it('maps each level 1..5 to its --heat-N token', () => {
    const lightRamp = ['#D7B5B5', '#E9D6D6', '#E1E0DE', '#D2DED6', '#AEC3B6']
    lightRamp.forEach((hex, i) => {
      document.documentElement.style.setProperty(`--heat-${i + 1}`, hex)
    })

    for (const level of [1, 2, 3, 4, 5] as HeatLevel[]) {
      expect(resolveHeatColor(level)).toBe(lightRamp[level - 1])
    }
  })

  it('re-resolves to the current theme values after a flip', () => {
    document.documentElement.style.setProperty('--heat-1', '#D7B5B5')
    expect(resolveHeatColor(1)).toBe('#D7B5B5')

    // Simulate the dark-theme declaration taking over the custom property.
    document.documentElement.style.setProperty('--heat-1', '#523430')
    expect(resolveHeatColor(1)).toBe('#523430')
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

  it('fires the callback when data-team-theme flips (accent-token re-skin)', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })
    const onThemeChange = vi.fn()

    renderHook(() => useChartTheme(onThemeChange))

    // Team theming rewrites the --accent* tokens some charts bake into
    // rough ink (accent selection rings), so it must trigger a redraw too.
    document.documentElement.setAttribute('data-team-theme', 'ou')

    await vi.waitFor(() => expect(onThemeChange).toHaveBeenCalledTimes(1))

    rafSpy.mockRestore()
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
