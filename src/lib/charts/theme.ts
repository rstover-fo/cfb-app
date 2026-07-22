'use client'

import { useEffect } from 'react'

/**
 * Resolves a CSS custom-property reference to its computed value.
 *
 * roughjs draws directly to SVG paths and doesn't understand CSS
 * `var(--foo)` references, so hand-drawn chart elements (which get their
 * stroke/fill baked in at draw time) need concrete color strings instead.
 *
 * Accepts `var(--foo)` or bare `--foo` forms and resolves them against
 * `:root`. Any other input (e.g. a literal hex color already resolved
 * upstream, like a team's brand color) is returned unchanged.
 */
export function resolveColor(cssVar: string): string {
  if (typeof document === 'undefined') return '#999'

  const varMatch = cssVar.match(/var\((.+)\)/)
  const varName = varMatch ? varMatch[1] : cssVar.startsWith('--') ? cssVar : null
  if (!varName) return cssVar

  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#999'
}

/**
 * Re-invokes `onThemeChange` whenever the document's theme attributes change.
 *
 * Colors resolved via `resolveColor` are baked into concrete strings at
 * draw time, so roughjs elements don't pick up CSS variable changes on
 * their own when the theme flips. This watches for the `class`/`data-theme`
 * mutations the theme toggle makes on `<html>` (document.documentElement)
 * and re-runs the draw callback (via requestAnimationFrame, so the browser
 * has applied the new styles before colors are re-resolved) so charts
 * redraw with the new palette.
 */
export function useChartTheme(onThemeChange: () => void): void {
  useEffect(() => {
    const observer = new MutationObserver(() => {
      requestAnimationFrame(onThemeChange)
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
    return () => observer.disconnect()
  }, [onThemeChange])
}
