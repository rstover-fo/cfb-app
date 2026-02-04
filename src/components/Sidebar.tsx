'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  House,
  Football,
  ListNumbers,
  Sword,
  Compass,
  Star,
  GearSix,
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
  ChartScatter,
  CalendarBlank,
} from '@phosphor-icons/react'
import { ThemeToggle } from './ThemeToggle'

const navItems = [
  { href: '/', label: 'Home', icon: House },
  { href: '/teams', label: 'Teams', icon: Football },
  { href: '/games', label: 'Games', icon: CalendarBlank },
  { href: '/analytics', label: 'Analytics', icon: ChartScatter },
  { href: '/rankings', label: 'Rankings', icon: ListNumbers, disabled: true },
  { href: '/matchups', label: 'Matchups', icon: Sword, disabled: true },
]

const secondaryItems = [
  { href: '/explore', label: 'Explorations', icon: Compass, badge: 'soon' },
  { href: '/favorites', label: 'Favorites', icon: Star, disabled: true },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col transition-all duration-200 z-50 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo & Collapse Toggle */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        {!collapsed && (
          <Link href="/" className="font-headline text-lg text-[var(--text-primary)]">
            CFB 360
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-[var(--bg-surface-alt)] text-[var(--text-muted)]"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <CaretRight size={20} weight="thin" /> : <CaretLeft size={20} weight="thin" />}
        </button>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-[var(--border)]">
        <button
          className={`flex items-center gap-3 w-full px-3 py-2 rounded text-[var(--text-muted)] hover:bg-[var(--bg-surface-alt)] transition-colors ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <MagnifyingGlass size={20} weight="thin" />
          {!collapsed && (
            <>
              <span className="text-sm flex-1 text-left">Search</span>
              <kbd className="text-xs bg-[var(--bg-surface-alt)] px-1.5 py-0.5 rounded">⌘K</kbd>
            </>
          )}
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
              href={item.disabled ? '#' : item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${
                active
                  ? 'bg-[var(--bg-surface-alt)] text-[var(--text-primary)] border-l-[3px] border-[var(--color-run)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface-alt)] hover:text-[var(--text-primary)]'
              } ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={(e) => item.disabled && e.preventDefault()}
            >
              <Icon size={20} weight="thin" />
              {!collapsed && <span className="text-sm">{item.label}</span>}
            </Link>
          )
        })}

        {/* Divider */}
        <div className="my-3 border-t border-[var(--border)]" />

        {secondaryItems.map((item) => {
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.disabled ? '#' : item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded transition-colors ${
                collapsed ? 'justify-center' : ''
              } text-[var(--text-muted)] hover:bg-[var(--bg-surface-alt)] hover:text-[var(--text-primary)] ${
                item.disabled ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              onClick={(e) => item.disabled && e.preventDefault()}
            >
              <Icon size={20} weight="thin" />
              {!collapsed && (
                <>
                  <span className="text-sm flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="text-xs bg-[var(--bg-surface-alt)] px-1.5 py-0.5 rounded">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom Section */}
      <div className="p-3 border-t border-[var(--border)] space-y-1">
        <ThemeToggle />
        <button
          className={`flex items-center gap-3 w-full px-3 py-2 rounded text-[var(--text-muted)] hover:bg-[var(--bg-surface-alt)] transition-colors ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <GearSix size={20} weight="thin" />
          {!collapsed && <span className="text-sm">Settings</span>}
        </button>
      </div>
    </aside>
  )
}
