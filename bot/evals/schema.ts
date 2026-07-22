/**
 * Zod schema for evals/golden.json. Kept separate from run.ts so both the
 * harness and its plumbing tests can import it without pulling in the
 * network-calling parts of run.ts.
 */
import { z } from 'zod'

export const DEFAULT_MAX_CHARS = 2000

export const GoldenEntrySchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  expect: z.object({
    /** Expected router tier. Omit if the question could reasonably land on either. */
    tier: z.enum(['simple', 'gnarly']).optional(),
    /** At least one of these (case-insensitive) regexes must match the answer. */
    mustMatchAny: z.array(z.string()).optional(),
    /** None of these (case-insensitive) regexes may match the answer. */
    mustNotMatch: z.array(z.string()).optional(),
    /** Defaults to DEFAULT_MAX_CHARS. */
    maxChars: z.number().int().positive().optional(),
    /** Natural-language criterion for the Haiku judge call. Omit to skip judging this entry. */
    judge: z.string().min(1).optional(),
  }),
})

export const GoldenSetSchema = z.array(GoldenEntrySchema).min(1)

export type GoldenEntry = z.infer<typeof GoldenEntrySchema>
export type GoldenSet = z.infer<typeof GoldenSetSchema>
