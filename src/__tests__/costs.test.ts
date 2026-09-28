import { describe, expect, it } from 'vitest'
import { calculateCost } from '../lib/costs'

describe('calculateCost', () => {
  it('calculates exact cost for Opus 4.6', () => {
    // 1M input @ $5 + 1M output @ $25 = $30
    const cost = calculateCost('claude-opus-4-6', 1_000_000, 1_000_000, 0, 0)
    expect(cost).toBeCloseTo(30, 5)
  })

  it('calculates cache creation and read costs', () => {
    // 1M cache creation @ $6.25 + 1M cache read @ $0.50 = $6.75
    const cost = calculateCost('claude-opus-4-6', 0, 0, 1_000_000, 1_000_000)
    expect(cost).toBeCloseTo(6.75, 5)
  })

  it('calculates Haiku as cheapest', () => {
    const opus = calculateCost('claude-opus-4-6', 1_000_000, 1_000_000, 0, 0)
    const haiku = calculateCost('claude-haiku-4-5-20251001', 1_000_000, 1_000_000, 0, 0)
    expect(haiku).toBeLessThan(opus)
  })

  it('returns 0 for unknown model', () => {
    expect(calculateCost('unknown-model', 1_000_000, 1_000_000, 0, 0)).toBe(0)
  })

  it('handles zero tokens', () => {
    expect(calculateCost('claude-opus-4-6', 0, 0, 0, 0)).toBe(0)
  })

  it('prices the current model generation', () => {
    // 1M input @ $5 + 1M output @ $25 = $30
    expect(calculateCost('claude-opus-5', 1_000_000, 1_000_000, 0, 0)).toBeCloseTo(30, 5)
    // 1M input @ $2 + 1M output @ $10 = $12
    expect(calculateCost('claude-sonnet-5', 1_000_000, 1_000_000, 0, 0)).toBeCloseTo(12, 5)
    // 1M input @ $10 + 1M output @ $50 = $60
    expect(calculateCost('claude-fable-5-1', 1_000_000, 1_000_000, 0, 0)).toBeCloseTo(60, 5)
  })

  it('does not resolve Fable 5.1 as Fable 5', () => {
    // Fable 5.1 cache reads are $0.25/MTok; Fable 5 cache reads are $1.00/MTok
    expect(calculateCost('claude-fable-5-1', 0, 0, 0, 1_000_000)).toBeCloseTo(0.25, 5)
    expect(calculateCost('claude-fable-5', 0, 0, 0, 1_000_000)).toBeCloseTo(1.0, 5)
  })

  it('does not resolve Opus 5.5 as Opus 5', () => {
    // Opus 5.5: $4 in / $20 out / $0.20 cache read. Opus 5: $5 / $25 / $0.50.
    expect(calculateCost('claude-opus-5-5', 1_000_000, 1_000_000, 0, 0)).toBeCloseTo(24, 5)
    expect(calculateCost('claude-opus-5-5[1m]', 0, 0, 0, 1_000_000)).toBeCloseTo(0.2, 5)
    expect(calculateCost('claude-opus-5', 0, 0, 0, 1_000_000)).toBeCloseTo(0.5, 5)
  })

  it('matches prefix for versioned model IDs', () => {
    // e.g. 'claude-opus-4-6-20260101' should match 'claude-opus-4-6'
    const exact = calculateCost('claude-opus-4-6', 1_000_000, 0, 0, 0)
    const versioned = calculateCost('claude-opus-4-6-20260101', 1_000_000, 0, 0, 0)
    // Both should resolve to the same pricing
    expect(versioned).toBe(exact)
  })
})
