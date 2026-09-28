import { describe, expect, it } from 'vitest'
import { aggregateCodexUsage, type CodexResponseRecord } from '../lib/codexUsage'
import { calculateOpenAICost } from '../lib/openaiCosts'

const dateKey = (iso: string) => iso.slice(0, 10)

function rec(responseId: string, timestamp: string, model: string, input = 0, cachedInput = 0, output = 0) {
  return {
    responseId,
    timestamp,
    model,
    tokens: { input, cachedInput, cacheWrite: 0, output, reasoning: 0 },
  } satisfies CodexResponseRecord
}

describe('calculateOpenAICost', () => {
  it('prices cached input at the cached rate and the rest at the input rate', () => {
    // gpt-6-astra: 0.9M uncached @ $10 + 0.1M cached @ $1 + 1M output @ $50 = $59.10
    expect(
      calculateOpenAICost('gpt-6-astra', { input: 1_000_000, cachedInput: 100_000, cacheWrite: 0, output: 1_000_000 }),
    ).toBeCloseTo(59.1, 5)
  })

  it('prices cache writes at the write rate', () => {
    // gpt-5.6-sol: 1M cache write @ $5
    expect(
      calculateOpenAICost('gpt-5.6-sol', { input: 1_000_000, cachedInput: 0, cacheWrite: 1_000_000, output: 0 }),
    ).toBeCloseTo(5, 5)
  })

  it('returns null for models with no published price', () => {
    expect(
      calculateOpenAICost('example-unlisted-model', { input: 1, cachedInput: 0, cacheWrite: 0, output: 1 }),
    ).toBeNull()
  })

  it('matches suffixed ids by family', () => {
    const tokens = { input: 1_000_000, cachedInput: 0, cacheWrite: 0, output: 0 }
    expect(calculateOpenAICost('gpt-6-astra-2026-09-01', tokens)).toBeCloseTo(10, 5)
  })
})

describe('aggregateCodexUsage', () => {
  it('counts each response_id once', () => {
    const r = rec('resp_1', '2026-09-10T12:00:00Z', 'gpt-6-astra', 1_000_000, 0, 0)
    const out = aggregateCodexUsage([r, r], [], dateKey, 'test')
    expect(out?.totals.responses).toBe(1)
    expect(out?.totals.costUSD).toBeCloseTo(10, 2)
  })

  it('counts unpriced responses and their tokens but adds no cost', () => {
    const out = aggregateCodexUsage(
      [
        rec('a', '2026-09-10T01:00:00Z', 'gpt-6-astra', 1_000_000),
        rec('b', '2026-09-10T02:00:00Z', 'example-unlisted-model', 1_000_000),
      ],
      [],
      dateKey,
      'test',
    )
    expect(out?.totals.responses).toBe(2)
    expect(out?.totals.unpricedResponses).toBe(1)
    expect(out?.totals.tokens.input).toBe(2_000_000)
    expect(out?.totals.costUSD).toBeCloseTo(10, 2)
    expect(out?.byModel['example-unlisted-model'].priced).toBe(false)
    expect(out?.daily[0].unpricedResponses).toBe(1)
  })

  it('buckets by day in date order', () => {
    const out = aggregateCodexUsage(
      [rec('b', '2026-09-12T00:00:00Z', 'gpt-6-astra'), rec('a', '2026-09-10T00:00:00Z', 'gpt-6-astra')],
      [],
      dateKey,
      'test',
    )
    expect(out?.daily.map((d) => d.date)).toEqual(['2026-09-10', '2026-09-12'])
    expect(out?.firstDate).toBe('2026-09-10')
    expect(out?.lastDate).toBe('2026-09-12')
  })

  it('reports the most recent plan-limit reading', () => {
    const out = aggregateCodexUsage(
      [rec('a', '2026-09-10T00:00:00Z', 'gpt-6-astra')],
      [
        {
          timestamp: '2026-09-22T21:34:19Z',
          planType: 'prolite',
          usedPercent: 22,
          windowMinutes: 10080,
          resetsAt: 1790297622,
        },
        {
          timestamp: '2026-09-07T10:00:00Z',
          planType: 'prolite',
          usedPercent: 99,
          windowMinutes: 10080,
          resetsAt: 1788825705,
        },
      ],
      dateKey,
      'test',
    )
    expect(out?.planLimit?.usedPercent).toBe(22)
    expect(out?.planLimit?.resetsAt).toBe(new Date(1790297622 * 1000).toISOString())
  })

  it('returns null when there are no responses', () => {
    expect(aggregateCodexUsage([], [], dateKey, 'test')).toBeNull()
  })
})
