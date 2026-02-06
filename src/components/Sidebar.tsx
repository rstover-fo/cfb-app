'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  House,
  Football,
  GearSix,
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
  ChartScatter,
  CalendarBlank,
  Trophy,
  List,
  X,
} from '@phosphor-icons/react'
import { ThemeToggle } from './ThemeToggle'

const navItems = [
  { href: '/', label: 'Home', icon: House },
  { href: '/teams', label: 'Teams', icon: Football },
  { href: '/games', label: 'Games', icon: CalendarBlank },
  { href: '/rankings', label: 'Rankings', icon: Trophy },
  { href: '/analytics', label: 'Analytics', icon: ChartScatter },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  // Close mobile sidebar on route change using state tracking (avoids useEffect + setState lint error)
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname)
    if (mobileOpen) setMobileOpen(false)
  }

  const closeMobile = useCallback(() => setMobileOpen(false), [])

  // Close mobile sidebar on Escape key
  useEffect(() => {
    if (!mobileOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [mobileOpen])

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 p-2 rounded bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] md:hidden"
        aria-label="Open navigation menu"
      >
        <List size={24} weight="bold" />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-full bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col transition-all duration-200 z-50
          ${collapsed ? 'md:w-16' : 'md:w-60'}
          w-60
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}
      >
        {/* Logo & Toggle */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <Link href="/" className={`font-headline text-lg text-[var(--text-primary)] ${collapsed ? 'md:hidden' : ''}`}>
            CFB 360
          </Link>

          {/* Close button on mobile */}
          <button
            onClick={closeMobile}
            className="p-1 rounded hover:bg-[var(--bg-surface-alt)] text-[var(--text-muted)] md:hidden"
            aria-label="Close navigation menu"
          >
            <X size={20} weight="bold" />
          </button>

          {/* Collapse toggle on desktop */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded hover:bg-[var(--bg-surface-alt)] text-[var(--text-muted)] hidden md:block"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <CaretRight size={20} weight="thin" /> : <CaretLeft size={20} weight="thin" />}
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-[var(--border)]">
          <button
            className={`flex items-center gap-3 w-full px-3 py-2 rounded text-[var(--text-muted)] hover:bg-[var(--bg-surface-alt)] transition-colors ${
              collapsed ? 'md:justify-center' : ''
            }`}
          >
            <MagnifyingGlass size={20} weight="thin" />
            <span className={`text-sm flex-1 text-left ${collapsed ? 'md:hidden' : ''}`}>Search</span>
            <kbd className={`text-xs bg-[var(--bg-surface-alt)] px-1.5 py-0.5 rounded ${collapsed ? 'md:hidden' : ''}`}>⌘K</kbd>
          </button>
        </div>

        {/* Primary Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded transition-colors ${
                  collapsed ? 'md:justify-center' : ''
                } ${
                  active
                    ? 'bg-[var(--bg-surface-alt)] text-[var(--text-primary)] border-l-[3px] border-[var(--color-run)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface-alt)] hover:text-[var(--text-primary)]'
                }`}
                onClick={closeMobile}
              >
                <Icon size={20} weight="thin" />
                <span className={`text-sm ${collapsed ? 'md:hidden' : ''}`}>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Bottom Section */}
        <div className="p-3 border-t border-[var(--border)] space-y-1">
          <ThemeToggle />
          <button
            className={`flex items-center gap-3 w-full px-3 py-2 rounded text-[var(--text-muted)] hover:bg-[var(--bg-surface-alt)] transition-colors ${
              collapsed ? 'md:justify-center' : ''
            }`}
          >
            <GearSix size={20} weight="thin" />
            <span className={`text-sm ${collapsed ? 'md:hidden' : ''}`}>Settings</span>
          </button>
        </div>
      </aside>
    </>
  )
}
