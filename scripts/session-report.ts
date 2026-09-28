// Measured usage of one session and every agent run it launched: the "API tokens and
// measured cost" row of a paired effort trial (see docs/MODELS-AND-EFFORT.md).
//
//   npm run collect && npm run session-report -- <session-id or unique prefix>
//   npm run session-report -- --latest     (the most recent top-level session)
//
// Reads data/private/usage.json. Prints to the terminal only; nothing is written.
import fs from 'node:fs'
import path from 'node:path'
import type { SessionDetail, UsageData } from '../src/types/usage'

const PRIVATE_FILE = path.join(import.meta.dirname, '..', 'data', 'private', 'usage.json')

export interface SessionReport {
  session: SessionDetail
  agents: SessionDetail[]
  totals: {
    costUSD: number
    tokens: { input: number; output: number; cacheCreation: number; cacheRead: number; total: number }
    byModel: Record<string, { runs: number; costUSD: number }>
    efforts: Record<string, number>
    minutes: number
  }
}

export function buildSessionReport(data: UsageData, idOrPrefix: string | 'latest'): SessionReport {
  const topLevel = data.sessions.filter((s) => s.kind !== 'agent')
  let session: SessionDetail | undefined
  if (idOrPrefix === 'latest') {
    session = [...topLevel].sort((a, b) => (b.endTime || '').localeCompare(a.endTime || ''))[0]
  } else {
    const matches = topLevel.filter((s) => s.id.startsWith(idOrPrefix))
    if (matches.length > 1) throw new Error(`"${idOrPrefix}" matches ${matches.length} sessions; use a longer prefix`)
    session = matches[0]
  }
  if (!session) throw new Error(`no top-level session matches "${idOrPrefix}" (run npm run collect first?)`)

  const agents = data.sessions.filter((s) => s.kind === 'agent' && s.parentId === session.id)
  const all = [session, ...agents]
  const tokens = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0, total: 0 }
  const byModel: Record<string, { runs: number; costUSD: number }> = {}
  const efforts: Record<string, number> = {}
  let costUSD = 0
  for (const s of all) {
    costUSD += s.costUSD
    for (const k of Object.keys(tokens) as (keyof typeof tokens)[]) tokens[k] += s.tokens[k]
    // A transcript can switch models. Its dominant model is not its per-model spend.
    // Old single-model snapshots are recoverable; old mixed-model rows are not.
    const costs = s.modelCosts ?? {
      [s.models.length === 1 ? s.models[0] : 'unallocated (recollect for per-model costs)']: s.costUSD,
    }
    for (const [m, cost] of Object.entries(costs)) {
      byModel[m] = { runs: (byModel[m]?.runs ?? 0) + 1, costUSD: (byModel[m]?.costUSD ?? 0) + cost }
    }
    for (const [e, n] of Object.entries(s.efforts ?? {})) efforts[e] = (efforts[e] ?? 0) + n
  }
  const start = Math.min(...all.map((s) => new Date(s.startTime).getTime()))
  const end = Math.max(...all.map((s) => new Date(s.endTime).getTime()))
  return { session, agents, totals: { costUSD, tokens, byModel, efforts, minutes: Math.round((end - start) / 60000) } }
}

function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('usage: npm run session-report -- <session-id or prefix> | --latest')
    process.exit(2)
  }
  if (!fs.existsSync(PRIVATE_FILE)) {
    console.error('No data/private/usage.json. Run `npm run collect` first.')
    process.exit(1)
  }
  const data = JSON.parse(fs.readFileSync(PRIVATE_FILE, 'utf-8')) as UsageData
  const r = buildSessionReport(data, arg === '--latest' ? 'latest' : arg)
  const t = r.totals
  const n = (x: number) => x.toLocaleString('en-US')
  console.log(`Session ${r.session.id}`)
  console.log(
    `  started ${r.session.startTime}, ${t.minutes} min to the last event, ${r.session.messages} typed messages`,
  )
  console.log(`  top-level model: ${r.session.model ?? 'unknown'}; agent runs: ${r.agents.length}`)
  console.log(`  API-equivalent cost: $${t.costUSD.toFixed(2)} (session plus agents)`)
  console.log(
    `  tokens: ${n(t.tokens.total)} total; input ${n(t.tokens.input)}, output ${n(t.tokens.output)}, ` +
      `cache write ${n(t.tokens.cacheCreation)}, cache read ${n(t.tokens.cacheRead)}`,
  )
  console.log(`  by model:`)
  for (const [m, v] of Object.entries(t.byModel).sort((a, b) => b[1].costUSD - a[1].costUSD)) {
    console.log(`    ${m}: ${v.runs} transcript(s), $${v.costUSD.toFixed(2)}`)
  }
  console.log(
    `  responses by effort: ${
      Object.entries(t.efforts)
        .map(([e, c]) => `${e} ${c}`)
        .join(', ') || 'none'
    }`,
  )
}

if (process.argv[1] === import.meta.filename) main()
