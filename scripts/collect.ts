import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { aggregateCodexUsage, type CodexRateLimitSnapshot, type CodexResponseRecord } from '../src/lib/codexUsage'
// Pricing table lives in src/lib/costs.ts so the dashboard and this script never drift apart.
import { calculateCost as calcCost } from '../src/lib/costs'
import type { OpenAIUsage } from '../src/types/usage'
import { type LocalConfig, loadLocalConfig, UNCATEGORIZED } from './local-config'

// Accounting rules (the reason daily, category, model and tool figures reconcile under any
// date filter):
// - Tokens, cost, messages and tool calls land on the local day the event happened.
// - A session's category split applies its file-operation weights to each day's amounts.
// - A session or agent run is counted once, on the day it starts.
// - "Session" means a top-level Claude Code conversation transcript. Subagent transcripts
//   (agent-*.jsonl) are counted as agent runs; their usage is included in every total.
// - A response is billed once per message id, a tool call counted once per tool_use id,
//   and a user message once per entry uuid, so replayed transcripts do not double count.

// --- Types for JSONL entries ---
interface JsonlEntry {
  type: string
  uuid?: string
  /** Effective effort level for this turn (recorded by Claude Code since mid-2026). */
  effort?: string
  sessionId?: string
  timestamp?: string
  cwd?: string
  message?: {
    role: string
    id?: string
    model?: string
    content?: unknown // can be string or array
    usage?: {
      input_tokens: number
      output_tokens: number
      cache_creation_input_tokens: number
      cache_read_input_tokens: number
      cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number }
      output_tokens_details?: { thinking_tokens?: number }
    }
  }
  error?: string
}

interface ContentBlock {
  type: string
  id?: string
  name?: string
  text?: string
  input?: Record<string, unknown>
}

type Tokens4 = { input: number; output: number; cacheCreation: number; cacheRead: number }
const emptyTokens = (): Tokens4 => ({ input: 0, output: 0, cacheCreation: 0, cacheRead: 0 })
const sum4 = (t: Tokens4) => t.input + t.output + t.cacheCreation + t.cacheRead
const addInto = (into: Tokens4, t: Tokens4, w = 1) => {
  into.input += t.input * w
  into.output += t.output * w
  into.cacheCreation += t.cacheCreation * w
  into.cacheRead += t.cacheRead * w
}

/** One session's activity on one local day. */
interface DayDelta {
  tokens: Tokens4
  costUSD: number
  messages: number
  tools: Map<string, number>
  byModel: Map<string, { tokens: Tokens4; costUSD: number }>
}
const newDelta = (): DayDelta => ({
  tokens: emptyTokens(),
  costUSD: 0,
  messages: 0,
  tools: new Map(),
  byModel: new Map(),
})

type Kind = 'session' | 'agent'

interface SessionAccum {
  id: string
  kind: Kind
  /** For agent runs: the top-level session that launched it (its folder under the project). */
  parentId?: string
  /** For agent runs: a direct subagent, or an agent inside a workflow fan-out. */
  lane?: 'subagent' | 'workflow'
  /** API-equivalent cost per model, to find the model that ran this transcript. */
  modelCost: Map<string, number>
  /** Responses per effort level. */
  efforts: Record<string, number>
  startTime: string
  endTime: string
  projectTouches: Map<string, number> // project -> file op count
  primaryProject: string
  models: Set<string>
  messages: number
  tokens: Tokens4
  costUSD: number
  toolsUsed: Record<string, number>
  days: Map<string, DayDelta>
}

// --- Local date key (YYYY-MM-DD in machine local time, not UTC) ---
// Evening sessions can cross UTC midnight; bucketing by UTC date would split one local day in two.
export function localDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// --- OpenAI: local Codex session logs (~/.codex/sessions) ---
// Reads only three event types. Never reads ~/.codex/auth.json or message content.
interface CodexLine {
  type?: string
  timestamp?: string
  payload?: {
    type?: string
    model?: unknown
    effort?: unknown
    response_id?: string
    usage?: {
      input_tokens?: number
      cached_input_tokens?: number
      cache_write_input_tokens?: number
      output_tokens?: number
      reasoning_output_tokens?: number
    }
    rate_limits?: {
      plan_type?: string
      primary?: { used_percent?: number; window_minutes?: number; resets_at?: number } | null
      secondary?: { used_percent?: number; window_minutes?: number; resets_at?: number } | null
      rate_limit_reached_type?: string | null
    }
  }
}

function walkJsonl(root: string): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.jsonl')) files.push(full)
    }
  }
  if (fs.existsSync(root)) walk(root)
  return files
}

export function readCodexUsage(root: string): OpenAIUsage | null {
  if (!fs.existsSync(root)) return null
  const files = walkJsonl(root).sort()

  const records: CodexResponseRecord[] = []
  const rateLimits: CodexRateLimitSnapshot[] = []
  for (const file of files) {
    // A response's model is the last turn_context model before it in the same file.
    let model = 'unknown'
    let effort = 'unrecorded'
    for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
      if (!line.includes('"turn_context"') && !line.includes('"token_usage_record"') && !line.includes('"rate_limits"'))
        continue
      let o: CodexLine
      try {
        o = JSON.parse(line)
      } catch {
        continue
      }
      const p = o.payload ?? {}
      if (o.type === 'turn_context' && typeof p.model === 'string') {
        model = p.model
        effort = typeof p.effort === 'string' ? p.effort : 'unrecorded'
      } else if (o.type === 'token_usage_record' && p.response_id && p.usage) {
        const u = p.usage
        records.push({
          responseId: p.response_id,
          timestamp: o.timestamp ?? '',
          model,
          effort,
          tokens: {
            input: u.input_tokens ?? 0,
            cachedInput: u.cached_input_tokens ?? 0,
            cacheWrite: u.cache_write_input_tokens ?? 0,
            output: u.output_tokens ?? 0,
            reasoning: u.reasoning_output_tokens ?? 0,
          },
        })
      } else if (p.type === 'token_count' && p.rate_limits) {
        const rl = p.rate_limits
        rateLimits.push({
          timestamp: o.timestamp ?? '',
          planType: rl.plan_type ?? null,
          usedPercent: rl.primary?.used_percent ?? null,
          windowMinutes: rl.primary?.window_minutes ?? null,
          resetsAt: rl.primary?.resets_at ?? null,
          secondary: rl.secondary
            ? {
                usedPercent: rl.secondary.used_percent ?? null,
                windowMinutes: rl.secondary.window_minutes ?? null,
                resetsAt: rl.secondary.resets_at ?? null,
              }
            : null,
          limitReached: rl.rate_limit_reached_type ?? null,
        })
      }
    }
  }
  return aggregateCodexUsage(records, rateLimits, localDateKey, 'codex-sessions')
}

export interface CollectOptions {
  /** Claude Code transcripts root (normally ~/.claude/projects). */
  projectsDir: string
  /** Codex session logs root (normally ~/.codex/sessions); null to skip. */
  codexRoot: string | null
  config: LocalConfig
}

export function collect({ projectsDir, codexRoot, config }: CollectOptions) {
  // --- Project attribution: everything machine-specific comes from the local config ---
  const normalizeProject = (raw: string): string | null => {
    if (!raw || config.ignoreSegments.has(raw)) return null
    // Skip glob wildcards, partial paths, and individual files (have extensions)
    if (raw.includes('*') || raw.includes('$') || raw.startsWith('.')) return null
    if (/[{}|[\]^]/.test(raw)) return null // brace lists and regex fragments from Bash commands
    if (/\.\w{1,5}$/.test(raw)) return null // has a file extension: not a directory
    // Aliases match the raw segment or its normalized form (case and _/space variants).
    const normalized = raw.toLowerCase().replace(/[_ ]/g, '-')
    return config.aliases[raw] || config.aliases[normalized] || normalized
  }
  const extractProjectFromPath = (fp: string): string | null => {
    // Roots are sorted longest first, so a monorepo root wins over its parent directory.
    const root = config.projectRoots.find((r) => fp.startsWith(r))
    if (!root) return null
    return normalizeProject(fp.slice(root.length).split('/')[0])
  }
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rootPathPattern = config.projectRoots.length
    ? new RegExp(`(?:${config.projectRoots.map(escapeRegex).join('|')})[^\\s"'\`;\\\\)]+`, 'g')
    : null
  const categoryOf = (project: string) => config.categories[project] ?? UNCATEGORIZED

  // Oldest first, so a response replayed into a resumed session's transcript is
  // attributed to the session that actually made the call.
  const jsonlFiles = walkJsonl(projectsDir).sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs)

  // A single assistant API response is written as one JSONL line per content block
  // (text + each parallel tool_use), and every one of those lines repeats the same
  // `usage` object. Resumed sessions can also replay earlier responses into a new file.
  // Track message ids so each response's tokens are billed exactly once. The lines of
  // one response are streaming snapshots: input and cache fields repeat, while
  // output_tokens only grows and the last line carries the final count. So keep the
  // output already billed per id and bill only the increase on later lines.
  const billedOutputByMessageId = new Map<string, number>()
  const seenToolUseIds = new Set<string>()
  const billedThinkingByMessageId = new Map<string, number>()
  type EffortAgg = { responses: number; tokens: Tokens4; thinking: number; costUSD: number }
  // model -> effort level -> usage. "unrecorded" = transcripts from before effort was logged.
  const effortAgg = new Map<string, Map<string, EffortAgg>>()
  const seenUserUuids = new Set<string>()
  const allTimestamps: number[] = []
  const sessions: SessionAccum[] = []
  let undatedLines = 0

  for (const file of jsonlFiles) {
    const id = path.basename(file, '.jsonl')
    // Agent transcripts live under their parent session's folder:
    //   <project>/<session>/subagents/agent-*.jsonl                       (subagent)
    //   <project>/<session>/subagents/workflows/<workflow>/agent-*.jsonl  (workflow agent)
    const rel = path.relative(projectsDir, file).split(path.sep)
    const isAgent = id.startsWith('agent-')
    const s: SessionAccum = {
      id,
      kind: isAgent ? 'agent' : 'session',
      parentId: isAgent && rel.length >= 4 && rel.includes('subagents') ? rel[1] : undefined,
      lane: isAgent ? (rel.includes('workflows') ? 'workflow' : 'subagent') : undefined,
      modelCost: new Map(),
      efforts: {},
      startTime: '',
      endTime: '',
      projectTouches: new Map(),
      primaryProject: 'general',
      models: new Set(),
      messages: 0,
      tokens: emptyTokens(),
      costUSD: 0,
      toolsUsed: {},
      days: new Map(),
    }
    let cwdProject = 'general'
    let lastDay = ''
    const undated = newDelta() // lines with no timestamp; folded into the start day below

    const dayOf = (ts: string | undefined): DayDelta => {
      if (!ts) {
        undatedLines++
        return undated
      }
      const key = localDateKey(ts)
      lastDay = key
      let d = s.days.get(key)
      if (!d) {
        d = newDelta()
        s.days.set(key, d)
      }
      return d
    }

    for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
      if (!line.trim()) continue
      let entry: JsonlEntry
      try {
        entry = JSON.parse(line)
      } catch {
        continue
      }

      const ts = entry.timestamp
      if (ts) {
        if (!s.startTime || ts < s.startTime) s.startTime = ts
        if (!s.endTime || ts > s.endTime) s.endTime = ts
        allTimestamps.push(new Date(ts).getTime())
      }

      // cwd-based project (fallback)
      if (entry.cwd) {
        const proj = extractProjectFromPath(`${entry.cwd}/`)
        if (proj) cwdProject = proj
      }

      if (entry.type !== 'assistant' && entry.type !== 'user') continue

      // User messages (not tool results), once per entry uuid.
      if (entry.type === 'user' && entry.message?.content) {
        if (entry.uuid && seenUserUuids.has(entry.uuid)) continue
        const c = entry.message.content
        const isText =
          typeof c === 'string' ||
          (Array.isArray(c) && (c as ContentBlock[]).some((b) => b.type === 'text' && !b.text?.startsWith('<ide_')))
        if (isText) {
          if (entry.uuid) seenUserUuids.add(entry.uuid)
          s.messages++
          dayOf(ts).messages++
        }
        continue
      }

      if (entry.error || entry.message?.model === '<synthetic>') continue
      const msg = entry.message
      if (!msg?.usage) continue

      const model = msg.model || 'unknown'
      if (model !== 'unknown') s.models.add(model)

      // Lines that repeat a response already counted bill only their output increase
      // (zero for everything else), so tool and project attribution still sees every block.
      const u = msg.usage
      const billedOutput = msg.id ? billedOutputByMessageId.get(msg.id) : undefined
      const counted = billedOutput === undefined
      const lineOutput = u.output_tokens || 0
      if (msg.id) billedOutputByMessageId.set(msg.id, Math.max(billedOutput ?? 0, lineOutput))

      const t: Tokens4 = {
        input: counted ? u.input_tokens || 0 : 0,
        output: counted ? lineOutput : Math.max(0, lineOutput - (billedOutput ?? 0)),
        cacheCreation: counted ? u.cache_creation_input_tokens || 0 : 0,
        cacheRead: counted ? u.cache_read_input_tokens || 0 : 0,
      }
      const oneHour = counted ? (u.cache_creation?.ephemeral_1h_input_tokens ?? 0) : 0
      const cost = calcCost(model, t.input, t.output, t.cacheCreation, t.cacheRead, oneHour)
      // Thinking tokens are part of output and stream the same way: bill only the increase.
      const lineThinking = u.output_tokens_details?.thinking_tokens ?? 0
      const billedThinking = msg.id ? (billedThinkingByMessageId.get(msg.id) ?? 0) : 0
      const thinking = Math.max(0, lineThinking - billedThinking)
      if (msg.id) billedThinkingByMessageId.set(msg.id, Math.max(billedThinking, lineThinking))
      if (model !== 'unknown') {
        s.modelCost.set(model, (s.modelCost.get(model) ?? 0) + cost)
        const byEffort = effortAgg.get(model) ?? new Map<string, EffortAgg>()
        const key = entry.effort ?? 'unrecorded'
        if (counted) s.efforts[key] = (s.efforts[key] ?? 0) + 1
        const e = byEffort.get(key) ?? { responses: 0, tokens: emptyTokens(), thinking: 0, costUSD: 0 }
        if (counted) e.responses++
        addInto(e.tokens, t)
        e.thinking += thinking
        e.costUSD += cost
        byEffort.set(key, e)
        effortAgg.set(model, byEffort)
      }

      addInto(s.tokens, t)
      s.costUSD += cost
      const day = dayOf(ts)
      addInto(day.tokens, t)
      day.costUSD += cost
      if (model !== 'unknown') {
        const cur = day.byModel.get(model) ?? { tokens: emptyTokens(), costUSD: 0 }
        addInto(cur.tokens, t)
        cur.costUSD += cost
        day.byModel.set(model, cur)
      }

      if (!Array.isArray(msg.content)) continue
      for (const block of msg.content as ContentBlock[]) {
        if (block.type !== 'tool_use') continue
        // A tool call is counted once per tool_use id, on the day it was made.
        if (block.id) {
          if (seenToolUseIds.has(block.id)) continue
          seenToolUseIds.add(block.id)
        }
        if (block.name) {
          s.toolsUsed[block.name] = (s.toolsUsed[block.name] || 0) + 1
          day.tools.set(block.name, (day.tools.get(block.name) ?? 0) + 1)
        }
        // File paths in tool inputs attribute the session to projects.
        if (block.input) {
          const candidates: string[] = []
          for (const key of ['file_path', 'path', 'notebook_path'] as const) {
            const val = block.input[key]
            if (typeof val === 'string') candidates.push(val)
          }
          if (rootPathPattern && typeof block.input.command === 'string') {
            const matches = (block.input.command as string).match(rootPathPattern)
            if (matches) candidates.push(...matches)
          }
          for (const fp of candidates) {
            const proj = extractProjectFromPath(fp)
            if (proj) s.projectTouches.set(proj, (s.projectTouches.get(proj) || 0) + 1)
          }
        }
      }
    }

    // Undated lines belong to the session's first day (or its last seen day).
    const hasUndated = sum4(undated.tokens) > 0 || undated.messages > 0 || undated.tools.size > 0
    if (hasUndated) {
      const key = s.startTime ? localDateKey(s.startTime) : lastDay
      if (key) {
        const d = s.days.get(key) ?? newDelta()
        addInto(d.tokens, undated.tokens)
        d.costUSD += undated.costUSD
        d.messages += undated.messages
        for (const [k, v] of undated.tools) d.tools.set(k, (d.tools.get(k) ?? 0) + v)
        for (const [m, v] of undated.byModel) {
          const cur = d.byModel.get(m) ?? { tokens: emptyTokens(), costUSD: 0 }
          addInto(cur.tokens, v.tokens)
          cur.costUSD += v.costUSD
          d.byModel.set(m, cur)
        }
        s.days.set(key, d)
      }
    }

    // Primary project: the most file operations, else the working directory.
    if (s.projectTouches.size > 0) {
      let maxTouches = 0
      for (const [proj, count] of s.projectTouches) {
        if (count > maxTouches) {
          maxTouches = count
          s.primaryProject = proj
        }
      }
    } else if (cwdProject !== 'general') {
      s.primaryProject = cwdProject
    }
    sessions.push(s)
  }

  // --- Weights: a session's amounts split across projects by file-operation share ---
  const projectWeights = (s: SessionAccum): Map<string, number> => {
    if (s.projectTouches.size <= 1) return new Map([[s.primaryProject, 1]])
    const total = Array.from(s.projectTouches.values()).reduce((a, b) => a + b, 0)
    return new Map(Array.from(s.projectTouches.entries()).map(([p, c]) => [p, c / total]))
  }
  const categoryWeights = (s: SessionAccum): Map<string, number> => {
    const w = new Map<string, number>()
    for (const [p, v] of projectWeights(s)) w.set(categoryOf(p), (w.get(categoryOf(p)) ?? 0) + v)
    return w
  }

  // A transcript with neither output nor a user message is not a session (a stub file).
  const isReal = (s: SessionAccum) => s.tokens.output > 0 || s.messages > 0

  // --- Daily aggregation, all on the event-day basis ---
  type CatAgg = { tokens: number; costUSD: number; messages: number; sessions: number; agentRuns: number }
  const newCat = (): CatAgg => ({ tokens: 0, costUSD: 0, messages: 0, sessions: 0, agentRuns: 0 })
  interface DayAgg {
    active: Set<string>
    sessionsStarted: number
    agentRunsStarted: number
    messages: number
    toolCalls: number
    tokens: Tokens4
    costUSD: number
    byModel: Map<string, { tokens: Tokens4; costUSD: number; sessions: number; agentRuns: number }>
    byProject: Map<string, { tokens: number; costUSD: number; messages: number }>
    byCategory: Map<string, CatAgg>
    tools: Map<string, number>
  }
  const days = new Map<string, DayAgg>()
  const dayAgg = (key: string): DayAgg => {
    let d = days.get(key)
    if (!d) {
      d = {
        active: new Set(),
        sessionsStarted: 0,
        agentRunsStarted: 0,
        messages: 0,
        toolCalls: 0,
        tokens: emptyTokens(),
        costUSD: 0,
        byModel: new Map(),
        byProject: new Map(),
        byCategory: new Map(),
        tools: new Map(),
      }
      days.set(key, d)
    }
    return d
  }
  const modelAgg = (d: DayAgg, m: string) => {
    let v = d.byModel.get(m)
    if (!v) {
      v = { tokens: emptyTokens(), costUSD: 0, sessions: 0, agentRuns: 0 }
      d.byModel.set(m, v)
    }
    return v
  }

  const projectTotals = new Map<string, { sessions: Set<string>; messages: number; tokens: number; costUSD: number }>()
  const categoryTotals = new Map<string, CatAgg>()
  const modelTotals = new Map<
    string,
    { sessions: Set<string>; agentRuns: Set<string>; tokens: Tokens4; costUSD: number }
  >()
  const toolTotals = new Map<string, number>()

  for (const s of sessions) {
    const pw = projectWeights(s)
    const cw = categoryWeights(s)
    for (const [key, delta] of s.days) {
      const d = dayAgg(key)
      const deltaTotal = sum4(delta.tokens)
      if (deltaTotal > 0) d.active.add(s.id)
      addInto(d.tokens, delta.tokens)
      d.costUSD += delta.costUSD
      d.messages += delta.messages
      for (const [tool, n] of delta.tools) {
        d.tools.set(tool, (d.tools.get(tool) ?? 0) + n)
        d.toolCalls += n
        toolTotals.set(tool, (toolTotals.get(tool) ?? 0) + n)
      }
      for (const [m, v] of delta.byModel) {
        const dm = modelAgg(d, m)
        addInto(dm.tokens, v.tokens)
        dm.costUSD += v.costUSD
        const mt = modelTotals.get(m) ?? {
          sessions: new Set(),
          agentRuns: new Set(),
          tokens: emptyTokens(),
          costUSD: 0,
        }
        addInto(mt.tokens, v.tokens)
        mt.costUSD += v.costUSD
        if (isReal(s)) (s.kind === 'agent' ? mt.agentRuns : mt.sessions).add(s.id)
        modelTotals.set(m, mt)
      }
      for (const [proj, w] of pw) {
        const dp = d.byProject.get(proj) ?? { tokens: 0, costUSD: 0, messages: 0 }
        dp.tokens += deltaTotal * w
        dp.costUSD += delta.costUSD * w
        dp.messages += delta.messages * w
        d.byProject.set(proj, dp)
        const pt = projectTotals.get(proj) ?? { sessions: new Set(), messages: 0, tokens: 0, costUSD: 0 }
        pt.tokens += deltaTotal * w
        pt.costUSD += delta.costUSD * w
        pt.messages += delta.messages * w
        projectTotals.set(proj, pt)
      }
      for (const [cat, w] of cw) {
        const dc = d.byCategory.get(cat) ?? newCat()
        dc.tokens += deltaTotal * w
        dc.costUSD += delta.costUSD * w
        dc.messages += delta.messages * w
        d.byCategory.set(cat, dc)
        const ct = categoryTotals.get(cat) ?? newCat()
        ct.tokens += deltaTotal * w
        ct.costUSD += delta.costUSD * w
        ct.messages += delta.messages * w
        categoryTotals.set(cat, ct)
      }
    }

    // Counts: once per real session or agent run, on its start day, under its primary
    // project's category. Model membership overlaps (one session can use several models).
    if (!isReal(s) || !s.startTime) continue
    const start = dayAgg(localDateKey(s.startTime))
    const cat = categoryOf(s.primaryProject)
    const dc = start.byCategory.get(cat) ?? newCat()
    const ct = categoryTotals.get(cat) ?? newCat()
    if (s.kind === 'agent') {
      start.agentRunsStarted++
      dc.agentRuns++
      ct.agentRuns++
    } else {
      start.sessionsStarted++
      dc.sessions++
      ct.sessions++
    }
    start.byCategory.set(cat, dc)
    categoryTotals.set(cat, ct)
    for (const m of s.models) {
      const dm = modelAgg(start, m)
      if (s.kind === 'agent') dm.agentRuns++
      else dm.sessions++
    }
    for (const proj of pw.keys()) {
      const pt = projectTotals.get(proj) ?? { sessions: new Set(), messages: 0, tokens: 0, costUSD: 0 }
      pt.sessions.add(s.id)
      projectTotals.set(proj, pt)
    }
  }

  // --- Orchestration: the model that ran each top-level session, and what its agents ran on ---
  // A transcript's model is the one that carried most of its cost.
  const primaryModel = (s: SessionAccum): string => {
    let best = ''
    let bestCost = -1
    for (const [m, c] of s.modelCost) {
      if (c > bestCost) {
        bestCost = c
        best = m
      }
    }
    return best
  }
  type Lane = {
    runs: number
    costUSD: number
    tokens: Tokens4
    byModel: Map<string, { runs: number; costUSD: number }>
  }
  type Orch = {
    sessions: number
    messages: number
    main: { tokens: Tokens4; costUSD: number }
    subagents: Lane
    workflows: Lane
  }
  const newLane = (): Lane => ({ runs: 0, costUSD: 0, tokens: emptyTokens(), byModel: new Map() })
  const orchestration = new Map<string, Orch>()
  const orchOf = (m: string): Orch => {
    let o = orchestration.get(m)
    if (!o) {
      o = {
        sessions: 0,
        messages: 0,
        main: { tokens: emptyTokens(), costUSD: 0 },
        subagents: newLane(),
        workflows: newLane(),
      }
      orchestration.set(m, o)
    }
    return o
  }
  const topLevelById = new Map(sessions.filter((s) => s.kind === 'session').map((s) => [s.id, s]))
  let unlinkedAgentRuns = 0
  for (const s of sessions) {
    if (!isReal(s)) continue
    if (s.kind === 'session') {
      const m = primaryModel(s)
      if (!m) continue
      const o = orchOf(m)
      o.sessions++
      o.messages += s.messages
      addInto(o.main.tokens, s.tokens)
      o.main.costUSD += s.costUSD
      continue
    }
    const parent = s.parentId ? topLevelById.get(s.parentId) : undefined
    const parentModel = parent ? primaryModel(parent) : ''
    if (!parentModel) {
      unlinkedAgentRuns++
      continue
    }
    const lane = orchOf(parentModel)[s.lane === 'workflow' ? 'workflows' : 'subagents']
    lane.runs++
    lane.costUSD += s.costUSD
    addInto(lane.tokens, s.tokens)
    const agentModel = primaryModel(s) || 'unknown'
    const bm = lane.byModel.get(agentModel) ?? { runs: 0, costUSD: 0 }
    bm.runs++
    bm.costUSD += s.costUSD
    lane.byModel.set(agentModel, bm)
  }

  // --- Work period analysis (local only; never published) ---
  allTimestamps.sort((a, b) => a - b)
  const computeWorkData = (gapMs: number) => {
    const periods: { startMs: number; endMs: number }[] = []
    if (allTimestamps.length > 0) {
      let wpStart = allTimestamps[0]
      let wpEnd = allTimestamps[0]
      for (let i = 1; i < allTimestamps.length; i++) {
        if (allTimestamps[i] - wpEnd > gapMs) {
          periods.push({ startMs: wpStart, endMs: wpEnd })
          wpStart = allTimestamps[i]
        }
        wpEnd = allTimestamps[i]
      }
      periods.push({ startMs: wpStart, endMs: wpEnd })
    }
    const byDay: Record<string, { hours: number; periods: number }> = {}
    for (const wp of periods) {
      const dateKey = localDateKey(new Date(wp.startMs).toISOString())
      if (!byDay[dateKey]) byDay[dateKey] = { hours: 0, periods: 0 }
      byDay[dateKey].hours += (wp.endMs - wp.startMs) / 3_600_000
      byDay[dateKey].periods++
    }
    for (const k of Object.keys(byDay)) byDay[k].hours = Math.round(byDay[k].hours * 10) / 10
    const totalHrs = periods.reduce((acc, wp) => acc + (wp.endMs - wp.startMs) / 3_600_000, 0)
    const activeDays = Object.keys(byDay).length
    let longestDay = { date: '', hours: 0 }
    for (const [date, d] of Object.entries(byDay)) if (d.hours > longestDay.hours) longestDay = { date, hours: d.hours }
    const sortedDays = Object.keys(byDay).sort()
    let longestStreak = 0
    let streak = 1
    for (let i = 1; i < sortedDays.length; i++) {
      const diff = Math.round((new Date(sortedDays[i]).getTime() - new Date(sortedDays[i - 1]).getTime()) / 86_400_000)
      if (diff === 1) {
        streak++
        longestStreak = Math.max(longestStreak, streak)
      } else streak = 1
    }
    longestStreak = Math.max(longestStreak, streak)
    const buckets = [
      { bucket: '<15m', maxMs: 15 * 60 * 1000, count: 0 },
      { bucket: '15-30m', maxMs: 30 * 60 * 1000, count: 0 },
      { bucket: '30-60m', maxMs: 60 * 60 * 1000, count: 0 },
      { bucket: '1-2h', maxMs: 2 * 60 * 60 * 1000, count: 0 },
      { bucket: '2-4h', maxMs: 4 * 60 * 60 * 1000, count: 0 },
      { bucket: '4h+', maxMs: Infinity, count: 0 },
    ]
    for (const wp of periods) {
      const dur = wp.endMs - wp.startMs
      const b = buckets.find((x) => dur < x.maxMs)
      if (b) b.count++
    }
    return {
      byDay,
      stats: {
        totalHours: Math.round(totalHrs * 10) / 10,
        activeDays,
        avgHoursPerDay: activeDays > 0 ? Math.round((totalHrs / activeDays) * 10) / 10 : 0,
        longestDay: { date: longestDay.date, hours: Math.round(longestDay.hours * 10) / 10 },
        longestStreak,
        totalPeriods: periods.length,
      },
      distribution: buckets.map(({ bucket, count }) => ({ bucket, count })),
    }
  }
  const workByThreshold = { '30': computeWorkData(30 * 60 * 1000), '60': computeWorkData(60 * 60 * 1000) }
  const { byDay: workByDay, stats: workStats, distribution: workPeriodDistribution } = workByThreshold['30']

  // --- Output ---
  const round2 = (n: number) => Math.round(n * 100) / 100
  const round4 = (n: number) => Math.round(n * 10000) / 10000
  const withTotal = (t: Tokens4) => ({ ...t, total: sum4(t) })
  const roundCat = (v: CatAgg) => ({
    tokens: Math.round(v.tokens),
    costUSD: round4(v.costUSD),
    messages: Math.round(v.messages),
    sessions: v.sessions,
    agentRuns: v.agentRuns,
  })

  const real = sessions.filter(isReal).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
  const topLevel = real.filter((s) => s.kind === 'session')
  const dates = real.filter((s) => s.startTime).map((s) => s.startTime)
  const hourDistribution: Record<string, number> = {}
  for (const s of topLevel) {
    if (!s.startTime) continue
    const hour = String(new Date(s.startTime).getHours())
    hourDistribution[hour] = (hourDistribution[hour] || 0) + 1
  }
  const allTokens = emptyTokens()
  let totalCost = 0
  let totalMessages = 0
  for (const s of sessions) {
    addInto(allTokens, s.tokens)
    totalCost += s.costUSD
    totalMessages += s.messages
  }
  const openai = codexRoot ? readCodexUsage(codexRoot) : null

  const output = {
    generatedAt: new Date().toISOString(),
    dateRange: { start: dates[0] ?? '', end: dates[dates.length - 1] ?? '' },
    overview: {
      totalSessions: topLevel.length,
      totalAgentRuns: real.length - topLevel.length,
      totalMessages,
      totalTokens: sum4(allTokens),
      totalCostUSD: round2(totalCost),
      activeDays: Array.from(days.values()).filter((d) => sum4(d.tokens) > 0).length,
      firstSession: dates[0] ?? '',
      lastSession: dates[dates.length - 1] ?? '',
    },
    daily: Array.from(days.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        sessions: d.active.size,
        sessionsStarted: d.sessionsStarted,
        agentRunsStarted: d.agentRunsStarted,
        messages: d.messages,
        toolCalls: d.toolCalls,
        tokens: withTotal(d.tokens),
        costUSD: round4(d.costUSD),
        byModel: Object.fromEntries(
          Array.from(d.byModel.entries()).map(([m, v]) => [
            m,
            { tokens: withTotal(v.tokens), costUSD: round4(v.costUSD), sessions: v.sessions, agentRuns: v.agentRuns },
          ]),
        ),
        byProject: Object.fromEntries(
          Array.from(d.byProject.entries()).map(([p, v]) => [
            p,
            { tokens: Math.round(v.tokens), costUSD: round4(v.costUSD), messages: Math.round(v.messages) },
          ]),
        ),
        byCategory: Object.fromEntries(Array.from(d.byCategory.entries()).map(([c, v]) => [c, roundCat(v)])),
        tools: Object.fromEntries(d.tools.entries()),
      })),
    sessions: real.map((s) => ({
      id: s.id,
      kind: s.kind,
      model: primaryModel(s) || undefined,
      parentId: s.parentId,
      lane: s.lane,
      efforts: s.efforts,
      startTime: s.startTime,
      endTime: s.endTime,
      durationMs: s.startTime && s.endTime ? new Date(s.endTime).getTime() - new Date(s.startTime).getTime() : 0,
      project: s.primaryProject,
      category: categoryOf(s.primaryProject),
      projectWeights:
        s.projectTouches.size > 1
          ? Object.fromEntries(Array.from(projectWeights(s).entries()).map(([p, w]) => [p, Math.round(w * 100)]))
          : undefined,
      modelCosts: Object.fromEntries(Array.from(s.modelCost.entries()).map(([m, cost]) => [m, round4(cost)])),
      models: Array.from(s.models),
      messages: s.messages,
      tokens: withTotal(s.tokens),
      costUSD: round4(s.costUSD),
      toolsUsed: s.toolsUsed,
    })),
    byProject: Object.fromEntries(
      Array.from(projectTotals.entries())
        .sort((a, b) => b[1].costUSD - a[1].costUSD)
        .map(([p, v]) => [
          p,
          {
            sessions: v.sessions.size,
            messages: Math.round(v.messages),
            tokens: Math.round(v.tokens),
            costUSD: round2(v.costUSD),
          },
        ]),
    ),
    byCategory: Object.fromEntries(
      Array.from(categoryTotals.entries())
        .sort((a, b) => b[1].costUSD - a[1].costUSD)
        .map(([c, v]) => [c, roundCat(v)]),
    ),
    byModel: Object.fromEntries(
      Array.from(modelTotals.entries()).map(([m, v]) => [
        m,
        {
          sessions: v.sessions.size,
          agentRuns: v.agentRuns.size,
          tokens: withTotal(v.tokens),
          costUSD: round2(v.costUSD),
        },
      ]),
    ),
    toolUsage: Object.fromEntries(Array.from(toolTotals.entries()).sort((a, b) => b[1] - a[1])),
    effort: Object.fromEntries(
      Array.from(effortAgg.entries()).map(([m, byEffort]) => [
        m,
        Object.fromEntries(
          Array.from(byEffort.entries()).map(([e, v]) => [
            e,
            {
              responses: v.responses,
              tokens: withTotal(v.tokens),
              thinkingTokens: v.thinking,
              costUSD: round2(v.costUSD),
            },
          ]),
        ),
      ]),
    ),
    orchestration: Object.fromEntries(
      Array.from(orchestration.entries()).map(([m, o]) => {
        const lane = (l: Lane) => ({
          runs: l.runs,
          costUSD: round2(l.costUSD),
          tokens: withTotal(l.tokens),
          byModel: Object.fromEntries(
            Array.from(l.byModel.entries()).map(([am, v]) => [am, { runs: v.runs, costUSD: round2(v.costUSD) }]),
          ),
        })
        return [
          m,
          {
            sessions: o.sessions,
            messages: o.messages,
            main: { tokens: withTotal(o.main.tokens), costUSD: round2(o.main.costUSD) },
            subagents: lane(o.subagents),
            workflows: lane(o.workflows),
          },
        ]
      }),
    ),
    unlinkedAgentRuns,
    hourDistribution,
    workByDay,
    workStats,
    workPeriodDistribution,
    workByThreshold,
    ...(openai ? { openai } : {}),
  }
  return { output, stats: { files: jsonlFiles.length, undatedLines, sessions } }
}

function main() {
  const config = loadLocalConfig()
  const { output, stats } = collect({
    projectsDir: path.join(os.homedir(), '.claude', 'projects'),
    codexRoot: path.join(os.homedir(), '.codex', 'sessions'),
    config,
  })
  // Private output. data/private/ is gitignored and is never served by URL.
  const outputFile = path.join(import.meta.dirname, '..', 'data', 'private', 'usage.json')
  fs.mkdirSync(path.dirname(outputFile), { recursive: true })
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2))

  const o = output.overview
  const general = stats.sessions.filter((s) => s.kind === 'session' && s.primaryProject === 'general').length
  console.log(`\n--- token-tracking data collected (${stats.files} transcript files) ---`)
  console.log(`Sessions: ${o.totalSessions} (${general} unattributed), agent runs: ${o.totalAgentRuns}`)
  console.log(`Date range: ${output.dateRange.start.slice(0, 10)} to ${output.dateRange.end.slice(0, 10)}`)
  console.log(`Active days: ${o.activeDays}, messages: ${o.totalMessages}, tokens: ${o.totalTokens}`)
  console.log(`API-equivalent cost: $${o.totalCostUSD}`)
  if (stats.undatedLines) console.log(`Undated lines folded into their session's first day: ${stats.undatedLines}`)
  for (const [model, d] of Object.entries(output.byModel)) {
    console.log(`  ${model}: ${d.sessions} sessions, ${d.agentRuns} agent runs, $${d.costUSD}`)
  }
  if (output.openai) {
    const oa = output.openai
    console.log(
      `OpenAI (Codex): ${oa.totals.responses} responses, $${oa.totals.costUSD} API-equivalent, ` +
        `${oa.totals.unpricedResponses} unpriced, ${oa.firstDate} to ${oa.lastDate}`,
    )
  }
  console.log(`Output: ${outputFile}`)
}

if (process.argv[1] === import.meta.filename) main()
