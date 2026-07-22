import { describe, it, expect } from 'vitest'
import { formatSpread, formatMoneyline } from './format-odds'

describe('formatSpread', () => {
  it('prefixes positive spreads with +', () => {
    expect(formatSpread(2.5)).toBe('+2.5')
    expect(formatSpread(7)).toBe('+7')
  })

  it('keeps the negative sign on negative spreads', () => {
    expect(formatSpread(-2.5)).toBe('-2.5')
    expect(formatSpread(-14)).toBe('-14')
  })

  it('rounds to one decimal', () => {
    expect(formatSpread(3.14)).toBe('+3.1')
    expect(formatSpread(-6.28)).toBe('-6.3')
  })

  it('renders zero (and near-zero negatives) as unsigned 0', () => {
    expect(formatSpread(0)).toBe('0')
    expect(formatSpread(-0.04)).toBe('0')
  })
})

describe('formatMoneyline', () => {
  it('prefixes positive moneylines with +', () => {
    expect(formatMoneyline(140)).toBe('+140')
  })

  it('keeps the negative sign on negative moneylines', () => {
    expect(formatMoneyline(-165)).toBe('-165')
  })
})
