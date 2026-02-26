// cfb-app/src/lib/queries/scouting.ts
import { cache } from 'react'
import {
  PlayerScoutingProfile,
  PendingLink,
} from '@/lib/types/scouting'

const SCOUT_API_URL = process.env.NEXT_PUBLIC_SCOUT_API_URL || 'http://localhost:8000'

/**
 * Fetch a player's scouting profile including agent-generated reports and sentiment.
 */
export const getPlayerScoutingProfile = cache(async (
  player_id: number
): Promise<PlayerScoutingProfile | null> => {
  try {
    const response = await fetch(`${SCOUT_API_URL}/players/${player_id}`, {
      next: { revalidate: 3600 } // Cache for 1 hour
    })
    
    if (!response.ok) {
      if (response.status === 404) return null
      throw new Error(`Scouting API error: ${response.statusText}`)
    }
    
    return response.json()
  } catch (error) {
    console.error('Failed to fetch scouting profile:', error)
    return null
  }
})

/**
 * Fetch pending player/report links for agent review.
 */
export const getPendingLinks = cache(async (
  status: 'pending' | 'approved' | 'rejected' = 'pending',
  limit: number = 50
): Promise<PendingLink[]> => {
  try {
    const response = await fetch(`${SCOUT_API_URL}/admin/pending-links?status=${status}&limit=${limit}`, {
      cache: 'no-store'
    })
    
    if (!response.ok) throw new Error(`Scouting API error: ${response.statusText}`)
    
    return response.json()
  } catch (error) {
    console.error('Failed to fetch pending links:', error)
    return []
  }
})

/**
 * Update the status of a pending link (Approve/Reject matching).
 */
export const reviewPendingLink = async (
  link_id: number,
  status: 'approved' | 'rejected'
): Promise<boolean> => {
  try {
    const response = await fetch(`${SCOUT_API_URL}/admin/pending-links/${link_id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    })
    
    return response.ok
  } catch (error) {
    console.error('Failed to review link:', error)
    return false
  }
})
