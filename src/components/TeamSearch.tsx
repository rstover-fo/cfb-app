'use client'

import { useState } from 'react'

interface TeamSearchProps {
  onSearch: (query: string) => void
}

export function TeamSearch({ onSearch }: TeamSearchProps) {
  const [query, setQuery] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    onSearch(value)
  }

  return (
    <div className="mb-8">
      <label htmlFor="team-search" className="sr-only">Search teams</label>
      <input
        id="team-search"
        type="search"
        placeholder="Search teams..."
        value={query}
        onChange={handleChange}
        className="w-full max-w-md px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}
