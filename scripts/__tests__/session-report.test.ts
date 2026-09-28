import { describe, expect, it } from 'vitest'
import type { SessionDetail, UsageData } from '../../src/types/usage'
import { buildSessionReport } from '../session-report'

const tok = (n: number) => ({ input: n, output: n, cacheCreation: n, cacheRead: n, total: 4 * n })
const row = (id: string, extra: Partial<SessionDetail>): SessionDetail => ({
  id,
  startTime: '2026-09-01T10:00:00Z',
  endTime: '2026-09-01T10:30:00Z',
  durationMs: 1_800_000,
  project: 'invented',
  models: extra.model ? [extra.model] : [],
  messages: 1,
  tokens: tok(10),
  costUSD: 1,
  toolsUsed: {},
  ...extra,
})

describe('session report (the measured row of a paired trial)', () => {
  const data = {
    sessions: [
      row('aaaa-1', { kind: 'session', model: 'claude-opus-5-5', efforts: { high: 4 } }),
      row('agent-x1', {
        kind: 'agent',
        parentId: 'aaaa-1',
        model: 'claude-sonnet-5',
        costUSD: 0.25,
        efforts: { high: 2 },
      }),
      row('agent-x2', {
        kind: 'agent',
        parentId: 'aaaa-1',
        model: 'claude-fable-5-1',
        costUSD: 0.5,
        endTime: '2026-09-01T10:45:00Z',
        efforts: { xhigh: 1 },
      }),
      row('bbbb-2', { kind: 'session', endTime: '2026-09-02T09:00:00Z' }),
    ],
  } as unknown as UsageData

  it('sums a session with every agent run it launched', () => {
    const r = buildSessionReport(data, 'aaaa')
    expect(r.agents.map((a) => a.id)).toEqual(['agent-x1', 'agent-x2'])
    expect(r.totals.costUSD).toBeCloseTo(1.75, 6)
    expect(r.totals.tokens.total).toBe(120)
    expect(r.totals.efforts).toEqual({ high: 6, xhigh: 1 })
    expect(r.totals.minutes).toBe(45)
    expect(Object.keys(r.totals.byModel).sort()).toEqual(['claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5'])
  })

  it('finds the latest top-level session, and refuses an ambiguous prefix', () => {
    expect(buildSessionReport(data, 'latest').session.id).toBe('bbbb-2')
    expect(() => buildSessionReport(data, '')).toThrow(/matches 2 sessions/)
  })

  it('allocates mixed-model spend to the models that incurred it', () => {
    const mixed = {
      sessions: [
        row('mixed-1', {
          model: 'claude-fable-5-1',
          models: ['claude-opus-5-5', 'claude-fable-5-1'],
          costUSD: 5,
          modelCosts: { 'claude-opus-5-5': 2, 'claude-fable-5-1': 3 },
        }),
      ],
    } as unknown as UsageData
    const report = buildSessionReport(mixed, 'mixed')
    expect(report.totals.byModel['claude-opus-5-5'].costUSD).toBe(2)
    expect(report.totals.byModel['claude-fable-5-1'].costUSD).toBe(3)
    expect(report.totals.costUSD).toBe(5)
  })

  it('does not attribute legacy mixed-model spend to its dominant model', () => {
    const legacy = {
      sessions: [
        row('legacy-1', {
          model: 'claude-fable-5-1',
          models: ['claude-opus-5-5', 'claude-fable-5-1'],
          costUSD: 5,
        }),
      ],
    } as unknown as UsageData
    const report = buildSessionReport(legacy, 'legacy')
    expect(report.totals.byModel['claude-fable-5-1']).toBeUndefined()
    expect(Object.values(report.totals.byModel).reduce((sum, x) => sum + x.costUSD, 0)).toBe(5)
  })
})
