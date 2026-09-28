// Builds public/data/usage.json from data/private/usage.json.
// Every public field is constructed here by name; nothing is copied from the private
// object wholesale, so a field added to the collector cannot reach the public file
// without an edit to this script AND to scripts/public-contract.ts.
import fs from 'node:fs'
import path from 'node:path'
import type { CategoryAggregate, EffortAggregate, OrchestrationLane, UsageData } from '../src/types/usage'
import { loadLocalConfig, UNCATEGORIZED } from './local-config'
import {
  PUBLIC_CATEGORIES,
  publicClaudeEffort,
  publicClaudeModel,
  publicOpenAIEffort,
  publicOpenAIModel,
  publicToolName,
  SCHEMA_VERSION,
  validatePublic,
} from './public-contract'

const ROOT = path.join(import.meta.dirname, '..')
const PRIVATE_FILE = path.join(ROOT, 'data', 'private', 'usage.json')
export const PUBLIC_FILE = path.join(ROOT, 'public', 'data', 'usage.json')

type Tokens = { input: number; output: number; cacheCreation: number; cacheRead: number; total: number }
type OpenAITokens = { input: number; cachedInput: number; cacheWrite: number; output: number; reasoning: number }
type CategoryAgg = { tokens: number; costUSD: number; messages: number; sessions: number; agentRuns: number }

const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000

const tokens = (t: Tokens): Tokens => ({
  input: t.input,
  output: t.output,
  cacheCreation: t.cacheCreation,
  cacheRead: t.cacheRead,
  total: t.total,
})
const addTokens = (a: Tokens, b: Tokens): Tokens => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheCreation: a.cacheCreation + b.cacheCreation,
  cacheRead: a.cacheRead + b.cacheRead,
  total: a.total + b.total,
})
const emptyTokens = (): Tokens => ({ input: 0, output: 0, cacheCreation: 0, cacheRead: 0, total: 0 })
const openaiTokens = (t: OpenAITokens): OpenAITokens => ({
  input: t.input,
  cachedInput: t.cachedInput,
  cacheWrite: t.cacheWrite,
  output: t.output,
  reasoning: t.reasoning,
})
const addOpenAITokens = (a: OpenAITokens, b: OpenAITokens): OpenAITokens => ({
  input: a.input + b.input,
  cachedInput: a.cachedInput + b.cachedInput,
  cacheWrite: a.cacheWrite + b.cacheWrite,
  output: a.output + b.output,
  reasoning: a.reasoning + b.reasoning,
})
// Local calendar date, the same basis as daily[].date (a UTC date can run a day ahead).
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function buildPublic(data: UsageData, merge: Record<string, string>) {
  const problems: string[] = []

  const publicCategory = (cat: string): string => {
    const c = merge[cat] ?? cat
    if (!(PUBLIC_CATEGORIES as readonly string[]).includes(c)) {
      problems.push(
        c === UNCATEGORIZED
          ? 'Some sessions are Uncategorized: map every project in tracking.local.json first'
          : `Category ${JSON.stringify(c)} is not a public category (add a publicCategoryMerge entry)`,
      )
    }
    return c
  }

  const mergeCategories = (src: Record<string, CategoryAggregate>) => {
    const out: Record<string, CategoryAgg> = {}
    for (const [cat, v] of Object.entries(src)) {
      const c = publicCategory(cat)
      const o = out[c] ?? { tokens: 0, costUSD: 0, messages: 0, sessions: 0, agentRuns: 0 }
      o.tokens += v.tokens
      o.costUSD += v.costUSD
      o.messages += v.messages
      o.sessions += v.sessions
      o.agentRuns += v.agentRuns ?? 0
      out[c] = o
    }
    // Four decimals so category sums reconcile with the headline under any date filter.
    for (const o of Object.values(out)) {
      o.tokens = Math.round(o.tokens)
      o.costUSD = round4(o.costUSD)
      o.messages = Math.round(o.messages)
    }
    return out
  }

  const mergeTools = (src: Record<string, number>) => {
    const out: Record<string, number> = {}
    for (const [tool, n] of Object.entries(src)) {
      const t = publicToolName(tool)
      out[t] = (out[t] ?? 0) + n
    }
    return out
  }

  const daily = data.daily.map((d) => {
    // sessions / agentRuns per model: started that day and used the model. One session can
    // use several models, so these overlap and do not sum to the day's session count.
    const byModel: Record<string, { tokens: Tokens; costUSD: number; sessions: number; agentRuns: number }> = {}
    for (const [m, v] of Object.entries(d.byModel)) {
      const id = publicClaudeModel(m)
      const o = byModel[id] ?? { tokens: emptyTokens(), costUSD: 0, sessions: 0, agentRuns: 0 }
      o.tokens = addTokens(o.tokens, v.tokens)
      o.costUSD += v.costUSD
      o.sessions += v.sessions ?? 0
      o.agentRuns += v.agentRuns ?? 0
      byModel[id] = o
    }
    for (const o of Object.values(byModel)) o.costUSD = round4(o.costUSD)
    return {
      date: d.date,
      sessions: d.sessions,
      sessionsStarted: d.sessionsStarted ?? 0,
      agentRunsStarted: d.agentRunsStarted ?? 0,
      messages: d.messages,
      toolCalls: d.toolCalls,
      tokens: tokens(d.tokens),
      costUSD: round4(d.costUSD),
      byModel,
      tools: mergeTools(d.tools ?? {}),
    }
  })

  const byModel: Record<string, { sessions: number; agentRuns: number; tokens: Tokens; costUSD: number }> = {}
  for (const [m, v] of Object.entries(data.byModel)) {
    const id = publicClaudeModel(m)
    const o = byModel[id] ?? { sessions: 0, agentRuns: 0, tokens: emptyTokens(), costUSD: 0 }
    o.sessions += v.sessions
    o.agentRuns += v.agentRuns ?? 0
    o.tokens = addTokens(o.tokens, v.tokens)
    o.costUSD += v.costUSD
    byModel[id] = o
  }
  // Round once, after unlisted models have merged into one entry.
  for (const o of Object.values(byModel)) o.costUSD = round2(o.costUSD)

  // Categories by calendar month: the month's headline plus its category split.
  const months = new Map<string, { costUSD: number; tokens: number; cats: Record<string, CategoryAggregate> }>()
  for (const d of data.daily) {
    const key = d.date.slice(0, 7)
    const m = months.get(key) ?? { costUSD: 0, tokens: 0, cats: {} }
    m.costUSD += d.costUSD
    m.tokens += d.tokens.total
    for (const [cat, v] of Object.entries(d.byCategory ?? {})) {
      const c = m.cats[cat] ?? { tokens: 0, costUSD: 0, messages: 0, sessions: 0, agentRuns: 0 }
      c.tokens += v.tokens
      c.costUSD += v.costUSD
      c.messages += v.messages
      c.sessions += v.sessions
      c.agentRuns = (c.agentRuns ?? 0) + (v.agentRuns ?? 0)
      m.cats[cat] = c
    }
    months.set(key, m)
  }
  const monthly = Array.from(months.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, m]) => ({
      month,
      costUSD: round4(m.costUSD),
      tokens: m.tokens,
      byCategory: mergeCategories(m.cats),
    }))

  // Effort: model (published ID) -> level -> usage. Unlisted models and levels merge.
  const effort: Record<string, Record<string, EffortAggregate>> = {}
  for (const [m, levels] of Object.entries(data.effort ?? {})) {
    const id = publicClaudeModel(m)
    effort[id] ??= {}
    for (const [lvl, v] of Object.entries(levels)) {
      const key = publicClaudeEffort(lvl)
      const cur = effort[id][key] ?? { responses: 0, tokens: emptyTokens(), thinkingTokens: 0, costUSD: 0 }
      cur.responses += v.responses
      cur.tokens = addTokens(cur.tokens, v.tokens)
      cur.thinkingTokens += v.thinkingTokens
      cur.costUSD += v.costUSD
      effort[id][key] = cur
    }
  }
  for (const levels of Object.values(effort)) for (const v of Object.values(levels)) v.costUSD = round2(v.costUSD)

  // Orchestration: top-level model (published ID) -> main loop and agent lanes.
  const emptyLane = (): OrchestrationLane => ({ runs: 0, costUSD: 0, tokens: emptyTokens(), byModel: {} })
  const addLane = (into: OrchestrationLane, l: OrchestrationLane) => {
    into.runs += l.runs
    into.costUSD += l.costUSD
    into.tokens = addTokens(into.tokens, l.tokens)
    for (const [am, v] of Object.entries(l.byModel)) {
      const id = publicClaudeModel(am)
      const cur = into.byModel[id] ?? { runs: 0, costUSD: 0 }
      cur.runs += v.runs
      cur.costUSD += v.costUSD
      into.byModel[id] = cur
    }
  }
  const orchestration: Record<
    string,
    {
      sessions: number
      messages: number
      main: { tokens: Tokens; costUSD: number }
      subagents: OrchestrationLane
      workflows: OrchestrationLane
    }
  > = {}
  for (const [m, o] of Object.entries(data.orchestration ?? {})) {
    const id = publicClaudeModel(m)
    const cur = orchestration[id] ?? {
      sessions: 0,
      messages: 0,
      main: { tokens: emptyTokens(), costUSD: 0 },
      subagents: emptyLane(),
      workflows: emptyLane(),
    }
    cur.sessions += o.sessions
    cur.messages += o.messages
    cur.main.tokens = addTokens(cur.main.tokens, o.main.tokens)
    cur.main.costUSD += o.main.costUSD
    addLane(cur.subagents, o.subagents)
    addLane(cur.workflows, o.workflows)
    orchestration[id] = cur
  }
  for (const o of Object.values(orchestration)) {
    o.main.costUSD = round2(o.main.costUSD)
    for (const l of [o.subagents, o.workflows]) {
      l.costUSD = round2(l.costUSD)
      for (const v of Object.values(l.byModel)) v.costUSD = round2(v.costUSD)
    }
  }

  let openai: Record<string, unknown> | undefined
  if (data.openai) {
    const o = data.openai
    const oByModel: Record<string, { responses: number; tokens: OpenAITokens; costUSD: number; priced: boolean }> = {}
    for (const [m, v] of Object.entries(o.byModel)) {
      const id = publicOpenAIModel(m)
      const cur = oByModel[id] ?? {
        responses: 0,
        tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0, reasoning: 0 },
        costUSD: 0,
        priced: v.priced,
      }
      cur.responses += v.responses
      cur.tokens = addOpenAITokens(cur.tokens, v.tokens)
      cur.costUSD += v.costUSD
      cur.priced = cur.priced && v.priced
      oByModel[id] = cur
    }
    for (const m of Object.values(oByModel)) m.costUSD = round2(m.costUSD)
    const openaiEffort: Record<
      string,
      Record<string, { responses: number; tokens: OpenAITokens; costUSD: number }>
    > = {}
    for (const [m, levels] of Object.entries(o.effort ?? {})) {
      const id = publicOpenAIModel(m)
      openaiEffort[id] ??= {}
      for (const [lvl, v] of Object.entries(levels)) {
        const key = publicOpenAIEffort(lvl)
        const cur = openaiEffort[id][key] ?? {
          responses: 0,
          tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0, reasoning: 0 },
          costUSD: 0,
        }
        cur.responses += v.responses
        cur.tokens = addOpenAITokens(cur.tokens, v.tokens)
        cur.costUSD += v.costUSD
        openaiEffort[id][key] = cur
      }
    }
    for (const levels of Object.values(openaiEffort))
      for (const v of Object.values(levels)) v.costUSD = round2(v.costUSD)
    // source, planLimit and anything else on the private object are deliberately absent.
    openai = {
      firstDate: o.firstDate,
      lastDate: o.lastDate,
      totals: {
        responses: o.totals.responses,
        unpricedResponses: o.totals.unpricedResponses,
        tokens: openaiTokens(o.totals.tokens),
        costUSD: round2(o.totals.costUSD),
      },
      daily: o.daily.map((d) => ({
        date: d.date,
        responses: d.responses,
        unpricedResponses: d.unpricedResponses,
        tokens: openaiTokens(d.tokens),
        costUSD: round2(d.costUSD),
      })),
      byModel: oByModel,
      effort: openaiEffort,
    }
  }

  const dates = daily.map((d) => d.date).sort()
  const out = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: localDate(new Date()),
    dateRange: { start: dates[0] ?? '', end: dates[dates.length - 1] ?? '' },
    overview: {
      totalSessions: data.overview.totalSessions,
      totalAgentRuns: data.overview.totalAgentRuns ?? 0,
      totalMessages: data.overview.totalMessages,
      totalTokens: data.overview.totalTokens,
      totalCostUSD: data.overview.totalCostUSD,
      activeDays: data.overview.activeDays,
    },
    daily,
    monthly,
    byCategory: mergeCategories(data.byCategory ?? {}),
    byModel,
    toolUsage: mergeTools(data.toolUsage),
    effort,
    orchestration,
    ...(openai ? { openai } : {}),
  }
  return { out, problems: [...new Set(problems)] }
}

function main() {
  if (!fs.existsSync(PRIVATE_FILE)) {
    console.error('No data/private/usage.json. Run `npm run collect` first.')
    process.exit(1)
  }
  const data = JSON.parse(fs.readFileSync(PRIVATE_FILE, 'utf-8')) as UsageData
  const config = loadLocalConfig()
  const { out, problems } = buildPublic(data, config.publicCategoryMerge)
  if (problems.length) {
    for (const p of problems) console.error(`REFUSED: ${p}`)
    process.exit(1)
  }
  const errors = validatePublic(out)
  if (errors.length) {
    for (const e of errors.slice(0, 50)) console.error(`SCHEMA: ${e}`)
    process.exit(1)
  }
  fs.mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true })
  fs.writeFileSync(PUBLIC_FILE, `${JSON.stringify(out)}\n`)
  console.log(`Wrote ${path.relative(ROOT, PUBLIC_FILE)}: ${out.daily.length} days, $${out.overview.totalCostUSD}`)
  console.log('Next: npm run check-public (required before any commit of this file)')
}

if (process.argv[1] === import.meta.filename) main()
