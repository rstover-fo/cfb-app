'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SeasonSelectorProps {
  seasons: number[]
  currentSeason: number
}

export function SeasonSelector({ seasons, currentSeason }: SeasonSelectorProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handleChange(newSeason: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('season', newSeason)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <Select value={String(currentSeason)} onValueChange={handleChange}>
      <SelectTrigger className="text-sm" aria-label="Select season">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {seasons.map(season => (
          <SelectItem key={season} value={String(season)}>
            {season} Season
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
