'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { fetchSearchPlayers } from '@/app/players/actions'
import type { PlayerSearchResult } from '@/app/players/actions'

export function PlayerSearchBar() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerSearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchIdRef = useRef(0)

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
    setIsOpen(data.length > 0)
    setActiveIndex(-1)
    setIsSearching(false)
  }, [])

  const handleInputChange = (value: string) => {
    setQuery(value)

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      search(value)
    }, 300)
  }

  const handleSelect = (player: PlayerSearchResult) => {
    setQuery('')
    setResults([])
    setIsOpen(false)
    router.push(`/players/${player.player_id}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((prev) =>
          prev < results.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : results.length - 1
        )
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
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
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

  return (
    <div ref={containerRef} className="relative max-w-md">
      <div className="relative">
        <MagnifyingGlass
          size={18}
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
          className="w-full pl-10 pr-4 py-2 text-sm border-[1.5px] border-[var(--border)] rounded-sm bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--text-muted)] transition-colors"
          aria-label="Search players"
          aria-expanded={isOpen}
          aria-controls="player-search-results"
          aria-activedescendant={
            activeIndex >= 0 ? `player-result-${activeIndex}` : undefined
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

      {isOpen && results.length > 0 && (
        <ul
          id="player-search-results"
          role="listbox"
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded-sm shadow-md max-h-64 overflow-y-auto"
        >
          {results.map((player, idx) => (
            <li
              key={`${player.player_id}-${player.season}`}
              id={`player-result-${idx}`}
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
    </div>
  )
}
