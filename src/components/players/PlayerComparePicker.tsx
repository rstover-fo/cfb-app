'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { fetchSearchPlayers } from '@/app/players/actions'
import type { PlayerSearchResult } from '@/app/players/actions'

export interface SelectedComparePlayer {
  player_id: string
  name: string
  team: string
  position: string | null
  season: number
}

interface PlayerComparePickerProps {
  /** Which URL param this slot owns. */
  slot: 'p1' | 'p2'
  label: string
  /** The currently resolved player for this slot (server-resolved), if any. */
  selected: SelectedComparePlayer | null
  /** True when the URL names a player id the comparison view has no row for. */
  missing?: boolean
}

/**
 * One compare slot: a compact player typeahead (same get_player_search
 * machinery as PlayerSearchBar) that writes its selection into the URL
 * (?p1=&p2=) via router.replace, mirroring how /compare's team pickers keep
 * the comparison shareable as a plain link. When a player is selected the
 * slot renders as a chip with a clear button instead of the input.
 */
export function PlayerComparePicker({ slot, label, selected, missing = false }: PlayerComparePickerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerSearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchIdRef = useRef(0)

  const updateParam = useCallback((playerId: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (playerId) {
      params.set(slot, playerId)
    } else {
      params.delete(slot)
    }

    const query = params.toString()
    const nextUrl = query ? `${pathname}?${query}` : pathname
    const currentUrl = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname
    if (nextUrl === currentUrl) return

    router.replace(nextUrl, { scroll: false })
  }, [pathname, router, searchParams, slot])

  const search = useCallback(async (searchQuery: string) => {
    if (searchQuery.trim().length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }

    const currentSearchId = ++searchIdRef.current
    setIsSearching(true)
    const data = await fetchSearchPlayers(searchQuery.trim())

    // Guard against stale responses
    if (currentSearchId !== searchIdRef.current) return

    setResults(data)
    setIsOpen(true)
    setActiveIndex(-1)
    setIsSearching(false)
  }, [])

  const handleInputChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value), 300)
  }

  const handleSelect = (player: PlayerSearchResult) => {
    setQuery('')
    setResults([])
    setIsOpen(false)
    updateParam(player.player_id)
  }

  const handleClear = () => {
    updateParam(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1))
        break
      case 'Enter':
        e.preventDefault()
        if (activeIndex >= 0 && activeIndex < results.length) {
          handleSelect(results[activeIndex])
        }
        break
      case 'Escape':
        setIsOpen(false)
        setActiveIndex(-1)
        inputRef.current?.blur()
        break
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const resultsId = `compare-player-results-${slot}`

  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
        {label}
      </p>

      {selected ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-[1.5px] border-[var(--border)] rounded-sm bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2 min-w-0 text-sm">
            <span className="truncate font-medium text-[var(--text-primary)]">{selected.name}</span>
            {selected.position && (
              <span className="text-[10px] text-[var(--text-muted)] shrink-0">{selected.position}</span>
            )}
            <span className="text-xs text-[var(--text-muted)] truncate">{selected.team}</span>
          </div>
          <button
            type="button"
            onClick={handleClear}
            aria-label={`Clear ${label}`}
            className="shrink-0 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors rounded-sm"
          >
            <X size={14} weight="regular" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div ref={containerRef} className="relative">
          <div className="relative">
            <MagnifyingGlass
              size={16}
              weight="regular"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (results.length > 0) setIsOpen(true)
              }}
              placeholder="Search players..."
              className="w-full pl-9 pr-4 py-2 text-sm border-[1.5px] border-[var(--border)] rounded-sm bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--text-muted)] transition-colors"
              aria-label={`Search ${label}`}
              aria-expanded={isOpen}
              aria-controls={resultsId}
              aria-activedescendant={
                activeIndex >= 0 ? `${resultsId}-option-${activeIndex}` : undefined
              }
              role="combobox"
              autoComplete="off"
            />
            {isSearching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">
                ...
              </span>
            )}
          </div>

          {isOpen && results.length === 0 && !isSearching && (
            <div
              id={resultsId}
              role="status"
              aria-live="polite"
              className="absolute z-50 top-full left-0 right-0 mt-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded-sm shadow-[var(--shadow-soft)] px-3 py-3 text-sm text-[var(--text-muted)]"
            >
              No players found for &ldquo;{query.trim()}&rdquo;
            </div>
          )}

          {isOpen && results.length > 0 && (
            <ul
              id={resultsId}
              role="listbox"
              className="absolute z-50 top-full left-0 right-0 mt-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded-sm shadow-[var(--shadow-soft)] max-h-64 overflow-y-auto"
            >
              {results.map((player, idx) => (
                <li
                  key={`${player.player_id}-${player.season}`}
                  id={`${resultsId}-option-${idx}`}
                  role="option"
                  aria-selected={idx === activeIndex}
                  onMouseDown={() => handleSelect(player)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer text-sm transition-colors ${
                    idx === activeIndex
                      ? 'bg-[var(--bg-surface-alt)] text-[var(--text-primary)]'
                      : 'text-[var(--text-primary)]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate font-medium">{player.name}</span>
                    {player.position && (
                      <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                        {player.position}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--text-muted)] shrink-0 ml-2">
                    {player.team}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {missing && (
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">
              No comparison data for the selected player — pick another.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
