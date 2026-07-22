import '@testing-library/jest-dom/vitest'

// jsdom doesn't implement the Pointer Capture APIs or scrollIntoView that
// Radix UI's Select (and other pointer-driven primitives) call into --
// polyfill them as no-ops so tests can drive Select via pointerdown/pointerup
// without @testing-library/user-event (not installed in this project; see
// TeamPageClient.tabs.test.tsx's Tabs precedent for the same constraint).
if (typeof window !== 'undefined') {
  if (!window.HTMLElement.prototype.hasPointerCapture) {
    window.HTMLElement.prototype.hasPointerCapture = () => false
  }
  if (!window.HTMLElement.prototype.setPointerCapture) {
    window.HTMLElement.prototype.setPointerCapture = () => {}
  }
  if (!window.HTMLElement.prototype.releasePointerCapture) {
    window.HTMLElement.prototype.releasePointerCapture = () => {}
  }
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = () => {}
  }
  // jsdom doesn't implement matchMedia -- useTheme() (ThemeToggle) reads it
  // on every render. Stub a minimal MediaQueryList so any component tree
  // that mounts ThemeToggle (e.g. Sidebar) can render without a TypeError.
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }
}
