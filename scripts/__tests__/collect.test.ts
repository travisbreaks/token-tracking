import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { calculateCost } from '../../src/lib/costs'
import { collect, localDateKey, readCodexUsage } from '../collect'
import type { LocalConfig } from '../local-config'

// Synthetic transcripts only. Times are built in local time so the tests hold in any zone.
const at = (month: number, day: number, h: number, m: number) => new Date(2026, month - 1, day, h, m).toISOString()

const config: LocalConfig = {
  projectRoots: ['/work/'],
  aliases: {},
  ignoreSegments: new Set(),
  categories: { 'alpha-app': 'Own sites & products', 'beta-client': 'Client work' },
  publicCategoryMerge: {},
  denylistExtra: [],
}

const user = (ts: string, uuid: string, text = 'do the thing') =>
  JSON.stringify({ type: 'user', uuid, timestamp: ts, message: { role: 'user', content: text } })

function assistant(
  ts: string,
  id: string,
  model: string,
  usage: Record<string, unknown>,
  tools: { id: string; name: string; file: string }[] = [],
) {
  return JSON.stringify({
    type: 'assistant',
    uuid: `u-${id}-${ts}`,
    timestamp: ts,
    message: {
      role: 'assistant',
      id,
      model,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        ...usage,
      },
      content: tools.map((t) => ({ type: 'tool_use', id: t.id, name: t.name, input: { file_path: t.file } })),
    },
  })
}

function fixture(files: Record<string, string[]>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-collect-'))
  let t = Date.now() / 1000 - 1000
  for (const [name, lines] of Object.entries(files)) {
    const file = path.join(dir, 'proj', name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `${lines.join('\n')}\n`)
    fs.utimesSync(file, t, t) // listed order = age order (oldest first)
    t += 10
  }
  return dir
}

const day = (out: ReturnType<typeof collect>['output'], key: string) => out.daily.find((d) => d.date === key)
const sumCat = (d: { byCategory: Record<string, { costUSD: number; tokens: number }> }, f: 'costUSD' | 'tokens') =>
  Object.values(d.byCategory).reduce((a, v) => a + v[f], 0)

describe('collector: event-day accounting', () => {
  it('splits a cross-midnight session by the day each response happened', () => {
    const dir = fixture({
      's1.jsonl': [
        user(at(8, 31, 23, 50), 'u1'),
        assistant(at(8, 31, 23, 55), 'm1', 'claude-opus-5-5', { input_tokens: 1000, output_tokens: 100 }, [
          { id: 't1', name: 'Read', file: '/work/alpha-app/a.ts' },
        ]),
        assistant(at(9, 1, 0, 10), 'm2', 'claude-opus-5-5', { input_tokens: 2000, output_tokens: 200 }),
      ],
    })
    const { output } = collect({ projectsDir: dir, codexRoot: null, config })
    const aug = day(output, localDateKey(at(8, 31, 23, 55)))!
    const sep = day(output, localDateKey(at(9, 1, 0, 10)))!
    expect(aug.costUSD).toBeCloseTo(calculateCost('claude-opus-5-5', 1000, 100, 0, 0), 6)
    expect(sep.costUSD).toBeCloseTo(calculateCost('claude-opus-5-5', 2000, 200, 0, 0), 6)
    // Category money lands on the same days as the headline, not all on the start day.
    expect(sumCat(aug, 'costUSD')).toBeCloseTo(aug.costUSD, 4)
    expect(sumCat(sep, 'costUSD')).toBeCloseTo(sep.costUSD, 4)
    expect(Object.keys(sep.byCategory)).toEqual(['Own sites & products'])
    // The session is counted once, on its start day; it is active on both.
    expect([aug.sessionsStarted, sep.sessionsStarted]).toEqual([1, 0])
    expect([aug.sessions, sep.sessions]).toEqual([1, 1])
    expect([aug.toolCalls, aug.tools.Read]).toEqual([1, 1])
  })

  it('counts a replayed response, message and tool call once (the Aug 31 / Sep 1 case)', () => {
    const lines = [
      user(at(8, 31, 23, 59), 'u9'),
      assistant(at(9, 1, 0, 5), 'm9', 'claude-opus-5-5', { input_tokens: 6_000_000 }, [
        { id: 't9', name: 'Read', file: '/work/alpha-app/b.ts' },
      ]),
    ]
    const dir = fixture({ 'r1.jsonl': lines, 'r2.jsonl': lines })
    const { output } = collect({ projectsDir: dir, codexRoot: null, config })
    const once = calculateCost('claude-opus-5-5', 6_000_000, 0, 0, 0)
    expect(output.overview.totalCostUSD).toBeCloseTo(once, 2)
    expect(output.overview.totalMessages).toBe(1)
    expect(output.toolUsage.Read).toBe(1)
    const aug = day(output, localDateKey(at(8, 31, 23, 59)))!
    const sep = day(output, localDateKey(at(9, 1, 0, 5)))!
    expect([aug.costUSD, sumCat(aug, 'costUSD')]).toEqual([0, 0])
    expect(sumCat(sep, 'costUSD')).toBeCloseTo(sep.costUSD, 4)
    expect([sep.toolCalls, sep.tools.Read]).toEqual([1, 1])
  })

  it('reconciles per-model cost with the day and counts model membership per session', () => {
    const dir = fixture({
      'm.jsonl': [
        user(at(9, 10, 9, 0), 'u3'),
        assistant(at(9, 10, 9, 1), 'a1', 'claude-opus-5-5', { input_tokens: 500, output_tokens: 50 }),
        assistant(at(9, 10, 9, 2), 'a2', 'claude-haiku-4-5-20251001', { input_tokens: 500, output_tokens: 50 }),
      ],
    })
    const { output } = collect({ projectsDir: dir, codexRoot: null, config })
    const d = day(output, localDateKey(at(9, 10, 9, 1)))!
    const modelSum = Object.values(d.byModel).reduce((a, v) => a + v.costUSD, 0)
    expect(modelSum).toBeCloseTo(d.costUSD, 6)
    expect(d.byModel['claude-opus-5-5'].sessions).toBe(1)
    expect(d.byModel['claude-haiku-4-5-20251001'].sessions).toBe(1)
    expect(d.sessionsStarted).toBe(1) // membership overlaps; the session count does not
  })

  it('counts subagent transcripts as agent runs, with their usage in every total', () => {
    const dir = fixture({
      'main.jsonl': [
        user(at(9, 12, 10, 0), 'u4'),
        assistant(at(9, 12, 10, 1), 'b1', 'claude-opus-5-5', { output_tokens: 10 }),
      ],
      'agent-a1b2c3.jsonl': [assistant(at(9, 12, 10, 2), 'b2', 'claude-haiku-4-5-20251001', { output_tokens: 20 })],
    })
    const { output } = collect({ projectsDir: dir, codexRoot: null, config })
    expect(output.overview.totalSessions).toBe(1)
    expect(output.overview.totalAgentRuns).toBe(1)
    expect(output.overview.totalTokens).toBe(30)
    const d = day(output, localDateKey(at(9, 12, 10, 0)))!
    expect([d.sessionsStarted, d.agentRunsStarted]).toEqual([1, 1])
  })

  it('prices 1-hour cache writes at 2x input when the transcript reports them', () => {
    const dir = fixture({
      'c.jsonl': [
        user(at(9, 14, 8, 0), 'u5'),
        assistant(at(9, 14, 8, 1), 'c1', 'claude-opus-5-5', {
          cache_creation_input_tokens: 1_000_000,
          cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1_000_000 },
        }),
      ],
    })
    const { output } = collect({ projectsDir: dir, codexRoot: null, config })
    expect(output.overview.totalCostUSD).toBeCloseTo(8, 6) // $4 input x 2, not $5 (5-minute rate)
  })

  it('splits a two-project session across categories on every day, reconciling to the headline', () => {
    const dir = fixture({
      'mix.jsonl': [
        user(at(9, 20, 22, 0), 'u6'),
        assistant(at(9, 20, 22, 1), 'x1', 'claude-opus-5-5', { input_tokens: 3000, output_tokens: 300 }, [
          { id: 'tx1', name: 'Edit', file: '/work/alpha-app/a.ts' },
        ]),
        assistant(at(9, 21, 1, 0), 'x2', 'claude-opus-5-5', { input_tokens: 1000, output_tokens: 100 }, [
          { id: 'tx2', name: 'Edit', file: '/work/beta-client/b.ts' },
        ]),
      ],
    })
    const { output } = collect({ projectsDir: dir, codexRoot: null, config })
    for (const d of output.daily) {
      expect(sumCat(d, 'costUSD')).toBeCloseTo(d.costUSD, 4)
      expect(Math.abs(sumCat(d, 'tokens') - d.tokens.total)).toBeLessThanOrEqual(1)
      expect(d.byCategory['Own sites & products'].costUSD).toBeCloseTo(d.costUSD / 2, 4)
      expect(d.byCategory['Client work'].costUSD).toBeCloseTo(d.costUSD / 2, 4)
    }
  })
})

// Effort and orchestration. Adds an `effort` field to an assistant line.
const withEffort = (line: string, effort: string) => JSON.stringify({ ...JSON.parse(line), effort })

describe('collector: effort and orchestration', () => {
  it('links agent runs to their parent, splits subagents from workflow agents, and groups by top-level model', () => {
    const dir = fixture({
      'sess-top.jsonl': [
        user(at(9, 15, 9, 0), 'o1'),
        assistant(at(9, 15, 9, 1), 'p1', 'claude-opus-5-5', { input_tokens: 1000, output_tokens: 100 }),
      ],
      'sess-top/subagents/agent-aa11.jsonl': [
        assistant(at(9, 15, 9, 2), 'p2', 'claude-sonnet-5', { input_tokens: 1000, output_tokens: 100 }),
      ],
      'sess-top/subagents/workflows/wf_1/agent-bb22.jsonl': [
        assistant(at(9, 15, 9, 3), 'p3', 'claude-fable-5-1', { input_tokens: 1000, output_tokens: 100 }),
      ],
    })
    const { output } = collect({ projectsDir: dir, codexRoot: null, config })
    const o = output.orchestration['claude-opus-5-5']
    expect([o.sessions, o.subagents.runs, o.workflows.runs]).toEqual([1, 1, 1])
    expect(Object.keys(o.subagents.byModel)).toEqual(['claude-sonnet-5'])
    expect(Object.keys(o.workflows.byModel)).toEqual(['claude-fable-5-1'])
    expect(output.unlinkedAgentRuns).toBe(0)
    const total = o.main.costUSD + o.subagents.costUSD + o.workflows.costUSD
    // Each lane is rounded to cents separately, so allow a cent per lane.
    expect(Math.abs(total - output.overview.totalCostUSD)).toBeLessThanOrEqual(0.03)
    const agent = output.sessions.find((s) => s.id === 'agent-bb22')
    expect([agent?.parentId, agent?.lane, agent?.model]).toEqual(['sess-top', 'workflow', 'claude-fable-5-1'])
  })

  it('attributes usage to the logged effort level and bills streamed thinking by its increase', () => {
    const dir = fixture({
      'e.jsonl': [
        user(at(9, 16, 9, 0), 'o2'),
        // One response streamed on two lines: thinking grows 30 -> 80, output 50 -> 120.
        withEffort(
          assistant(at(9, 16, 9, 1), 'q1', 'claude-opus-5-5', {
            input_tokens: 500,
            output_tokens: 50,
            output_tokens_details: { thinking_tokens: 30 },
          }),
          'high',
        ),
        withEffort(
          assistant(at(9, 16, 9, 1), 'q1', 'claude-opus-5-5', {
            input_tokens: 500,
            output_tokens: 120,
            output_tokens_details: { thinking_tokens: 80 },
          }),
          'high',
        ),
        withEffort(assistant(at(9, 16, 9, 2), 'q2', 'claude-opus-5-5', { output_tokens: 10 }), 'xhigh'),
        assistant(at(9, 16, 9, 3), 'q3', 'claude-opus-5-5', { output_tokens: 5 }),
      ],
    })
    const { output } = collect({ projectsDir: dir, codexRoot: null, config })
    const e = output.effort['claude-opus-5-5']
    expect([e.high.responses, e.high.tokens.output, e.high.thinkingTokens]).toEqual([1, 120, 80])
    expect([e.xhigh.responses, e.unrecorded.responses]).toEqual([1, 1])
    const s = output.sessions.find((x) => x.id === 'e')
    expect(s?.efforts).toEqual({ high: 1, xhigh: 1, unrecorded: 1 })
  })

  it('takes Codex effort from the turn_context before each response', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-codex-'))
    const rec = (id: string, out: number) =>
      JSON.stringify({
        type: 'token_usage_record',
        timestamp: at(9, 17, 10, 0),
        payload: { response_id: id, usage: { input_tokens: 100, cached_input_tokens: 0, output_tokens: out } },
      })
    const ctx = (effort: string) => JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-6-astra', effort } })
    fs.writeFileSync(
      path.join(dir, 'a.jsonl'),
      [ctx('low'), rec('r1', 10), ctx('xhigh'), rec('r2', 90), rec('r3', 10)].join('\n'),
    )
    const openai = readCodexUsage(dir)
    const e = openai?.effort?.['gpt-6-astra']
    expect([e?.low.responses, e?.xhigh.responses, e?.xhigh.tokens.output]).toEqual([1, 2, 100])
  })
})
