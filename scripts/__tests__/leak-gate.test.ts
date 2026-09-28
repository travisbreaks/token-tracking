import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { UsageData } from '../../src/types/usage'
import { readLatestCodexLimits } from '../codex-limits'
import { jsonStrings, scanCompacted, scanNames, scanPatterns, tierNames } from '../leak-scan'
import { validatePublic } from '../public-contract'
import { buildPublic } from '../publish'

// Every name in this file is invented. Real names never appear in committed fixtures.
const FAKE_PROJECT = 'zephyr-orchard'
const FAKE_SESSION = '0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0'
const FAKE_AGENT = 'agent-a1b2c3d4e5f6'

const tokens = (n: number) => ({ input: n, output: n, cacheCreation: n, cacheRead: n, total: 4 * n })
const oaTokens = (n: number) => ({ input: n, cachedInput: 0, cacheWrite: 0, output: n, reasoning: 0 })

function fixture(category = 'Personal'): UsageData {
  return {
    generatedAt: '2026-01-02T03:04:05.000Z',
    dateRange: { start: '2026-01-01T10:00:00.000Z', end: '2026-01-02T11:00:00.000Z' },
    overview: {
      totalSessions: 2,
      totalMessages: 5,
      totalTokens: 80,
      totalCostUSD: 1.5,
      activeDays: 2,
      firstSession: '2026-01-01T10:00:00.000Z',
      lastSession: '2026-01-02T11:00:00.000Z',
    },
    daily: ['2026-01-01', '2026-01-02'].map((date) => ({
      date,
      sessions: 1,
      sessionsStarted: 1,
      messages: 2,
      toolCalls: 3,
      tokens: tokens(10),
      costUSD: 0.75,
      byModel: {
        'claude-opus-5-5': { tokens: tokens(5), costUSD: 0.5 },
        'claude-secret-preview': { tokens: tokens(5), costUSD: 0.25 },
      },
      byProject: { [FAKE_PROJECT]: { tokens: 40, costUSD: 0.75, messages: 2 } },
      byCategory: { [category]: { tokens: 40, costUSD: 0.75, messages: 2, sessions: 1 } },
      tools: { Bash: 2, mcp__private_brokerage__place_order: 1 },
      modelSessions: { 'claude-opus-5-5': 1 },
    })),
    sessions: [
      {
        id: FAKE_SESSION,
        startTime: '2026-01-01T10:00:00.000Z',
        endTime: '2026-01-01T11:00:00.000Z',
        durationMs: 3600000,
        project: FAKE_PROJECT,
        category,
        models: ['claude-opus-5-5'],
        messages: 2,
        tokens: tokens(10),
        costUSD: 0.75,
        toolsUsed: { Bash: 2 },
      },
    ],
    byProject: { [FAKE_PROJECT]: { sessions: 2, messages: 5, tokens: 80, costUSD: 1.5 } },
    byCategory: { [category]: { tokens: 80, costUSD: 1.5, messages: 5, sessions: 2 } },
    byModel: { 'claude-opus-5-5': { sessions: 2, tokens: tokens(20), costUSD: 1.5 } },
    toolUsage: { Bash: 4, mcp__private_brokerage__place_order: 2 },
    hourDistribution: { '1': 2 },
    workByDay: { '2026-01-01': { hours: 1, periods: 1 } },
    workStats: {
      totalHours: 1,
      activeDays: 1,
      avgHoursPerDay: 1,
      longestDay: { date: '2026-01-01', hours: 1 },
      longestStreak: 1,
      totalPeriods: 1,
    },
    workPeriodDistribution: [],
    workByThreshold: {},
    openai: {
      source: `/Users/someone/.codex/sessions (${FAKE_PROJECT})`,
      firstDate: '2026-01-01',
      lastDate: '2026-01-02',
      totals: { responses: 3, unpricedResponses: 1, tokens: oaTokens(9), costUSD: 0.3 },
      daily: [{ date: '2026-01-01', responses: 3, unpricedResponses: 1, tokens: oaTokens(9), costUSD: 0.3 }],
      byModel: {
        'gpt-6-astra': { responses: 2, tokens: oaTokens(6), costUSD: 0.3, priced: true },
        'internal-review-model': { responses: 1, tokens: oaTokens(3), costUSD: 0, priced: false },
      },
      planLimit: {
        capturedAt: '2026-01-02T00:00:00Z',
        planType: 'secret-plan',
        usedPercent: 50,
        windowMinutes: 10080,
        resetsAt: null,
      },
    },
  }
}

describe('publish: builds only the contract', () => {
  const { out, problems } = buildPublic(fixture(), { Personal: 'Other' })
  const text = JSON.stringify(out)

  it('passes the schema', () => {
    expect(problems).toEqual([])
    expect(validatePublic(out)).toEqual([])
  })

  it('drops project names, session IDs, paths, schedule and account state', () => {
    for (const leak of [
      FAKE_PROJECT,
      FAKE_SESSION,
      '/Users/',
      'secret-plan',
      'private_brokerage',
      'hourDistribution',
      'workByDay',
      'planLimit',
      'source',
    ]) {
      expect(text).not.toContain(leak)
    }
  })

  it('merges Personal into Other, collapses MCP tools, generalizes unlisted models', () => {
    expect(Object.keys(out.byCategory)).toEqual(['Other'])
    expect(out.toolUsage).toEqual({ Bash: 4, MCP: 2 })
    expect(Object.keys(out.daily[0].byModel).sort()).toEqual(['claude-opus-5-5', 'claude-other'])
    expect(Object.keys(out.openai?.byModel ?? {}).sort()).toEqual(['gpt-6-astra', 'openai-other'])
  })

  it('publishes categories by month only, never per day', () => {
    expect(out.daily.every((d) => !('byCategory' in d))).toBe(true)
    expect(out.monthly.map((m) => m.month)).toEqual(['2026-01'])
    const m = out.monthly[0]
    const sum = Object.values(m.byCategory).reduce((s, v) => s + v.costUSD, 0)
    expect(sum).toBeCloseTo(m.costUSD, 4)
  })

  it('generalizes unlisted models and unknown effort levels in the effort and orchestration views', () => {
    const f = fixture()
    f.effort = {
      'claude-secret-preview': { turbo: { responses: 2, tokens: tokens(5), thinkingTokens: 1, costUSD: 0.2 } },
    }
    f.orchestration = {
      'claude-opus-5-5': {
        sessions: 1,
        messages: 3,
        main: { tokens: tokens(5), costUSD: 1 },
        subagents: {
          runs: 1,
          costUSD: 0.5,
          tokens: tokens(1),
          byModel: { 'claude-secret-preview': { runs: 1, costUSD: 0.5 } },
        },
        workflows: { runs: 0, costUSD: 0, tokens: tokens(0), byModel: {} },
      },
    }
    const built = buildPublic(f, { Personal: 'Other' }).out
    expect(validatePublic(built)).toEqual([])
    expect(Object.keys(built.effort)).toEqual(['claude-other'])
    expect(Object.keys(built.effort['claude-other'])).toEqual(['other'])
    expect(Object.keys(built.orchestration['claude-opus-5-5'].subagents.byModel)).toEqual(['claude-other'])
    expect(JSON.stringify(built)).not.toContain('secret-preview')
  })

  it('dates carry no time of day', () => {
    expect(out.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(out.dateRange).toEqual({ start: '2026-01-01', end: '2026-01-02' })
  })

  it('refuses to publish while anything is uncategorized', () => {
    expect(buildPublic(fixture('Uncategorized'), {}).problems.length).toBeGreaterThan(0)
  })

  it('refuses a local category that is not public and not merged', () => {
    expect(buildPublic(fixture('Personal'), {}).problems.length).toBeGreaterThan(0)
  })
})

describe('schema: rejects anything outside the contract', () => {
  const good = () => JSON.parse(JSON.stringify(buildPublic(fixture(), { Personal: 'Other' }).out))

  it('rejects an unknown top-level key', () => {
    expect(validatePublic({ ...good(), sessions: [] }).join()).toContain('unknown key')
  })

  it('rejects a project name used as a category key', () => {
    const o = good()
    o.byCategory[FAKE_PROJECT] = o.byCategory.Other
    expect(validatePublic(o).join()).toContain(FAKE_PROJECT)
  })

  it('rejects a raw MCP tool name and an unlisted model', () => {
    const o = good()
    o.toolUsage.mcp__x__y = 1
    o.byModel['claude-secret-preview'] = o.byModel['claude-opus-5-5']
    const errs = validatePublic(o).join()
    expect(errs).toContain('mcp__x__y')
    expect(errs).toContain('claude-secret-preview')
  })

  it('rejects a timestamp where a date belongs', () => {
    expect(validatePublic({ ...good(), generatedAt: '2026-01-02T03:04:05Z' }).join()).toContain('YYYY-MM-DD')
  })
})

describe('leak scan: positive controls', () => {
  const none = () => false

  it('flags session IDs, agent IDs, home paths, MCP names and emails', () => {
    const planted = `a ${FAKE_SESSION} b ${FAKE_AGENT} c /Users/someone/x d mcp__svc__tool e someone@example.com`
    const kinds = scanPatterns('f', planted, none).map((f) => f.kind)
    expect(kinds.sort()).toEqual(['agent-session-id', 'email', 'home-path', 'mcp-tool-name', 'session-uuid'])
  })

  it('finds nothing in clean text', () => {
    expect(scanPatterns('f', 'tokens by category and model, per day', none)).toEqual([])
  })

  it('tiers dictionary words as generic and invented names as distinctive', () => {
    const dict = new Set(['meadow', 'lantern', 'harbor', 'fold'])
    const { distinctive, generic } = tierNames([FAKE_PROJECT, 'meadow', 'lanterns', 'harbored', '{x}', '##'], dict)
    expect(distinctive).toEqual([FAKE_PROJECT])
    expect(generic.sort()).toEqual(['##', 'harbored', 'lanterns', 'meadow', '{x}'])
  })

  it('keeps short names and short-stem inflections distinctive (no free pass)', () => {
    const dict = new Set(['fold', 'ring'])
    const { distinctive } = tierNames(['zqx', 'wyvk', 'folded', 'rings'], dict)
    expect(distinctive.sort()).toEqual(['folded', 'rings', 'wyvk', 'zqx'])
  })

  it('matches separator variants of a hyphenated name', () => {
    for (const form of ['zephyrOrchard', 'zephyr_orchard', 'zephyr orchard', 'ZEPHYR-ORCHARD']) {
      expect(scanNames('f', `x ${form} y`, [FAKE_PROJECT], none)).toHaveLength(1)
    }
  })

  it('flags paths on external volumes and temp folders', () => {
    const kinds = scanPatterns('f', 'a /Volumes/SomeDisk/x b /private/var/folders/ab/c', none).map((f) => f.kind)
    expect(kinds).toEqual(['volume-path', 'volume-path'])
  })

  it('finds a planted distinctive name, case-insensitively, but not inside a longer word', () => {
    expect(scanNames('f', `see ${FAKE_PROJECT.toUpperCase()} here`, [FAKE_PROJECT], none)).toHaveLength(1)
    expect(scanNames('f', `x${FAKE_PROJECT}y`, [FAKE_PROJECT], none)).toHaveLength(0)
  })

  it('finds a single-word name written with separators inserted, or in camelCase', () => {
    const name = 'zephyrorchard'
    for (const form of ['zephyr_orchard', 'ZEPHYR-ORCHARD', 'zephyrOrchard', 'zephyr orchard']) {
      expect(scanCompacted('f', `a ${form} b`, [name], none)).toHaveLength(1)
    }
    expect(scanCompacted('f', 'nothing here', [name], none)).toHaveLength(0)
    expect(scanCompacted('f', 'short', ['abc'], none)).toHaveLength(0) // under 8 chars: not compact-scanned
  })

  it('collects every key and value from JSON', () => {
    expect(jsonStrings({ a: ['b', { c: 'd' }] }).sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('codex limits: newest snapshot by timestamp, not file order', () => {
  it('picks the latest timestamp across files and reads the secondary window', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-limits-'))
    const line = (ts: string, used: number, secondary: object | null) =>
      JSON.stringify({
        timestamp: ts,
        type: 'event_msg',
        payload: {
          type: 'token_count',
          rate_limits: {
            plan_type: 'p',
            primary: { used_percent: used, window_minutes: 10080, resets_at: 1800000000 },
            secondary,
          },
        },
      })
    // The newer snapshot sits in the OLDER file (by mtime).
    const newerContent = path.join(dir, 'a.jsonl')
    const olderContent = path.join(dir, 'b.jsonl')
    fs.writeFileSync(
      newerContent,
      `${line('2026-01-02T00:00:00Z', 7, { used_percent: 30, window_minutes: 300, resets_at: 1800000000 })}\n`,
    )
    fs.writeFileSync(olderContent, `${line('2026-01-01T00:00:00Z', 81, null)}\n`)
    fs.utimesSync(newerContent, new Date('2026-01-01'), new Date('2026-01-01'))
    fs.utimesSync(olderContent, new Date('2026-01-05'), new Date('2026-01-05'))

    const got = readLatestCodexLimits(dir)
    expect(got?.primary?.usedPercent).toBe(7)
    expect(got?.secondary?.windowMinutes).toBe(300)
    expect(got?.capturedAt).toBe('2026-01-02T00:00:00Z')
  })
})
