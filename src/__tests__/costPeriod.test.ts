import { describe, expect, it } from 'vitest'
import { AVG_DAYS_PER_MONTH, computeCostComparison, rangeBounds } from '../lib/costPeriod'
import type { Subscription } from '../types/subscriptions'
import type { DailyAggregate } from '../types/usage'

// Mirrors the real roster: the Claude plan changed twice, and non-Anthropic subs
// must never enter the comparison.
const SUBS = [
  {
    id: 'claude-pro',
    name: 'Claude Pro',
    provider: 'Anthropic',
    costPerMonth: 20,
    startDate: '2026-01-07',
    endDate: '2026-02-10',
  },
  {
    id: 'claude-max-100',
    name: 'Claude Max ($100)',
    provider: 'Anthropic',
    costPerMonth: 100,
    startDate: '2026-02-11',
    endDate: '2026-03-03',
  },
  {
    id: 'claude-max',
    name: 'Claude Max ($200)',
    provider: 'Anthropic',
    costPerMonth: 200,
    startDate: '2026-03-04',
    endDate: null,
  },
  { id: 'netflix', name: 'Netflix', provider: 'Netflix', costPerMonth: 23, startDate: '2024-01-01', endDate: null },
  {
    id: 'chatgpt-plus',
    name: 'ChatGPT Plus',
    provider: 'OpenAI',
    costPerMonth: 20,
    startDate: '2024-06-01',
    endDate: null,
  },
] as unknown as Subscription[]

const daily = (date: string, costUSD: number) => ({ date, costUSD }) as unknown as DailyAggregate

const DAILY = [
  daily('2026-01-20', 10),
  daily('2026-02-15', 40),
  daily('2026-08-15', 100),
  daily('2026-09-01', 200),
  daily('2026-09-05', 100),
]

// Sat 5 Sep 2026, 12:00 local: mid-day, so partial-day handling is exercised.
const NOW = new Date(2026, 8, 5, 12, 0, 0)
const FIRST = '2026-01-15T23:05:12.538Z'

const run = (range: Parameters<typeof computeCostComparison>[2]) =>
  computeCostComparison(DAILY, SUBS, range, NOW, FIRST)

describe('rangeBounds', () => {
  it('gives all-time its own bounds rather than falling through to last month', () => {
    const all = rangeBounds('all', NOW, FIRST)
    const last = rangeBounds('lastMonth', NOW, FIRST)
    expect(all.start).not.toEqual(last.start)
    expect(all.start).toEqual(new Date(2026, 0, 15))
    expect(all.end).toEqual(new Date(2026, 8, 5))
  })

  it('counts a full calendar last month', () => {
    const { start, end } = rangeBounds('lastMonth', NOW, FIRST)
    expect(start).toEqual(new Date(2026, 7, 1))
    expect(end).toEqual(new Date(2026, 7, 31))
  })
})

describe('computeCostComparison', () => {
  it('bills August as 31 days, not 30', () => {
    expect(run('lastMonth')?.days).toBe(31)
    // 31 days of Claude Max at $200/mo
    expect(run('lastMonth')?.subCost).toBeCloseTo((200 / AVG_DAYS_PER_MONTH) * 31, 6)
  })

  it('ignores non-Anthropic subscriptions', () => {
    // Netflix ($23) and ChatGPT Plus ($20) are active every day but must not appear.
    expect(run('day')?.subCost).toBeCloseTo(200 / AVG_DAYS_PER_MONTH, 6)
  })

  it('charges each day at the plan that was active that day', () => {
    const all = run('all')
    // Jan 15-31 (17d) + Feb 1-10 (10d) on Pro; Feb 11 - Mar 3 (21d) on Max 100;
    // Mar 4 - Sep 5 (186d) on Max 200.
    const expected = (20 / AVG_DAYS_PER_MONTH) * 27 + (100 / AVG_DAYS_PER_MONTH) * 21 + (200 / AVG_DAYS_PER_MONTH) * 186
    expect(all?.subCost).toBeCloseTo(expected, 6)
    expect(all?.days).toBe(234)
    expect(all?.planLabel).toBe('3 Claude plans')
  })

  it('labels a single-plan range with that plan', () => {
    expect(run('month')?.planLabel).toBe('Claude Max ($200)')
  })

  it('sums only the API cost inside the range', () => {
    expect(run('month')?.apiCost).toBe(300) // Sep 1 + Sep 5
    expect(run('lastMonth')?.apiCost).toBe(100) // Aug 15
    expect(run('all')?.apiCost).toBe(450)
  })

  it('divides the run rate by elapsed time, not billed days', () => {
    // At noon, "today" is half over: $100 so far is a $200/day rate, not $100/day.
    expect(run('day')?.dailyRate).toBeCloseTo(200, 6)
    expect(run('day')?.days).toBe(1)
  })

  it('uses whole days for a range that already ended', () => {
    expect(run('lastMonth')?.dailyRate).toBeCloseTo(100 / 31, 6)
  })

  it('forecasts against the plan in force today', () => {
    // Even for an all-time range spanning Pro and Max-100, the forward look is $200/mo.
    expect(run('all')?.monthlySub).toBe(200)
    expect(run('all')?.annualSub).toBe(2400)
  })

  it('returns null when no Claude subscription exists', () => {
    const noClaude = SUBS.filter((s) => s.provider !== 'Anthropic')
    expect(computeCostComparison(DAILY, noClaude, 'month', NOW, FIRST)).toBeNull()
  })
})
