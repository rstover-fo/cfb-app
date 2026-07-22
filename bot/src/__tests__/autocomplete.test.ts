import { describe, it, expect } from 'vitest'
import { autocompleteTeams } from '../autocomplete.js'

describe('autocompleteTeams', () => {
  it('matches case-insensitively', () => {
    expect(autocompleteTeams('oklahoma')).toContain('Oklahoma')
    expect(autocompleteTeams('OKLAHOMA')).toContain('Oklahoma')
  })

  it('matches by substring, not just prefix', () => {
    expect(autocompleteTeams('state')).toContain('Ohio State')
    expect(autocompleteTeams('state')).toContain('Kennesaw State')
  })

  it('returns exact-case values from the source list', () => {
    const matches = autocompleteTeams('miami')
    expect(matches).toContain('Miami')
    expect(matches).toContain('Miami (OH)')
  })

  it('caps results at 25 choices', () => {
    // "a" matches a large fraction of the 136-school list.
    const matches = autocompleteTeams('a')
    expect(matches.length).toBeLessThanOrEqual(25)
  })

  it('returns the first 25 schools for an empty query', () => {
    const matches = autocompleteTeams('')
    expect(matches).toHaveLength(25)
  })

  it('returns an empty array when nothing matches', () => {
    expect(autocompleteTeams('zzzznotateam')).toEqual([])
  })
})
