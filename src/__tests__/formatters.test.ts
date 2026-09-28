import { describe, expect, it } from 'vitest'
import { formatCost, formatDate, formatDuration, formatTokens, getModelDisplayName } from '../lib/formatters'

describe('formatTokens', () => {
  it('returns raw number below 1K', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
  })
  it('formats thousands', () => {
    expect(formatTokens(1000)).toBe('1.0K')
    expect(formatTokens(12500)).toBe('12.5K')
  })
  it('formats millions', () => {
    expect(formatTokens(1_000_000)).toBe('1.0M')
    expect(formatTokens(2_500_000)).toBe('2.5M')
  })
  it('formats billions', () => {
    expect(formatTokens(1_000_000_000)).toBe('1.0B')
  })
})

describe('formatCost', () => {
  it('shows 4 decimal places below $1', () => {
    expect(formatCost(0.0001)).toBe('$0.0001')
    expect(formatCost(0.5)).toBe('$0.5000')
  })
  it('shows 2 decimal places $1–$99', () => {
    expect(formatCost(1)).toBe('$1.00')
    expect(formatCost(9.99)).toBe('$9.99')
  })
  it('shows 0 decimal places $100–$999', () => {
    expect(formatCost(100)).toBe('$100')
    expect(formatCost(999)).toBe('$999')
  })
  it('formats thousands', () => {
    expect(formatCost(1000)).toBe('$1.0K')
    expect(formatCost(2500)).toBe('$2.5K')
  })
})

describe('formatDuration', () => {
  it('shows seconds below 1 minute', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(59_000)).toBe('59s')
  })
  it('shows minutes below 1 hour', () => {
    expect(formatDuration(60_000)).toBe('1m')
    expect(formatDuration(90_000)).toBe('1m')
    expect(formatDuration(3_540_000)).toBe('59m')
  })
  it('shows hours and minutes', () => {
    expect(formatDuration(3_600_000)).toBe('1h 0m')
    expect(formatDuration(5_400_000)).toBe('1h 30m')
  })
})

describe('formatDate', () => {
  it('parses date-only strings as local (no timezone rollback)', () => {
    // "2026-02-25" must render as Feb 25, not Feb 24
    const result = formatDate('2026-02-25')
    expect(result).toBe('Feb 25')
  })
  it('handles ISO datetime strings', () => {
    const result = formatDate('2026-02-25T12:00:00.000Z')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('getModelDisplayName', () => {
  it('maps known model IDs', () => {
    expect(getModelDisplayName('claude-opus-4-6')).toBe('Opus 4.6')
    expect(getModelDisplayName('claude-sonnet-4-6')).toBe('Sonnet 4.6')
    expect(getModelDisplayName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(getModelDisplayName('claude-opus-5')).toBe('Opus 5')
    expect(getModelDisplayName('claude-opus-5-5')).toBe('Opus 5.5')
    expect(getModelDisplayName('claude-opus-5-5[1m]')).toBe('Opus 5.5')
    expect(getModelDisplayName('claude-opus-4-8')).toBe('Opus 4.8')
    expect(getModelDisplayName('claude-opus-4-7')).toBe('Opus 4.7')
    expect(getModelDisplayName('claude-sonnet-5')).toBe('Sonnet 5')
    expect(getModelDisplayName('claude-fable-5')).toBe('Fable 5')
    expect(getModelDisplayName('claude-fable-5-1')).toBe('Fable 5.1')
  })
  it('returns raw string for unknown models', () => {
    expect(getModelDisplayName('unknown-model-xyz')).toBe('unknown-model-xyz')
  })
})
