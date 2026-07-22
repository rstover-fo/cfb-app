'use server'

import { getScoredMatchupEdges, getPredictionAccuracy } from '@/lib/queries/predictions'

// Re-export types for client components to import from this module
// This avoids client components importing from server-only modules
export type { ScoredMatchupEdge, PredictionAccuracyRow, EdgePick } from '@/lib/queries/predictions'

export async function fetchScoredMatchupEdges(season: number, week?: number): Promise<import('@/lib/queries/predictions').ScoredMatchupEdge[]> {
  return getScoredMatchupEdges(season, week)
}

export async function fetchPredictionAccuracy(): Promise<import('@/lib/queries/predictions').PredictionAccuracyRow[]> {
  return getPredictionAccuracy()
}
