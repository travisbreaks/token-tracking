// The public data contract. Everything that may appear in public/data/usage.json is named
// here; the validator rejects any other key, including keys of maps (categories, models,
// tools). This file is committed and runs in CI, so it holds no project names.
import { PRICING } from '../src/lib/costs'
import { OPENAI_PRICING } from '../src/lib/openaiCosts'

// 2: sessions split from agent runs; event-day category accounting (2026-09-28).
// 3: categories by month instead of by day; effort and orchestration sections (2026-09-28).
export const SCHEMA_VERSION = 3

export const PUBLIC_CATEGORIES = [
  'Client work',
  'Own sites & products',
  'AI infra & tooling',
  'Creative & music',
  'Writing',
  'Learning & research',
  'Other',
] as const

// Claude Code's built-in tools. Every MCP tool collapses to 'MCP' (server names reveal
// which accounts are connected); anything not listed collapses to 'Other tools'.
export const BUILTIN_TOOLS = [
  'Agent',
  'Artifact',
  'AskUserQuestion',
  'Bash',
  'CronCreate',
  'CronDelete',
  'CronList',
  'Edit',
  'EnterPlanMode',
  'EnterWorktree',
  'ExitPlanMode',
  'ExitWorktree',
  'Glob',
  'Grep',
  'ListAgents',
  'ListMcpResourcesTool',
  'Monitor',
  'MultiEdit',
  'NotebookEdit',
  'PushNotification',
  'Read',
  'ReadMcpResourceTool',
  'ReadNotifications',
  'ScheduleWakeup',
  'SendMessage',
  'SendUserFile',
  'Skill',
  'StructuredOutput',
  'SubagentHandback',
  'Task',
  'TaskOutput',
  'TaskStop',
  'TodoWrite',
  'ToolSearch',
  'WebFetch',
  'WebSearch',
  'Workflow',
  'Write',
] as const
export const MCP_TOOL = 'MCP'
export const OTHER_TOOL = 'Other tools'

// Public model IDs are the ones in the pricing tables, which are checked against the
// providers' published pricing pages. Anything else publishes under a generic name.
export const CLAUDE_OTHER = 'claude-other'
export const OPENAI_OTHER = 'openai-other'
export const PUBLIC_CLAUDE_MODELS = [...Object.keys(PRICING), CLAUDE_OTHER]
export const PUBLIC_OPENAI_MODELS = [...Object.keys(OPENAI_PRICING), OPENAI_OTHER]

export function publicToolName(tool: string): string {
  if (tool.startsWith('mcp__')) return MCP_TOOL
  // One transcript spells Bash in lowercase.
  const canonical = BUILTIN_TOOLS.find((t) => t.toLowerCase() === tool.toLowerCase())
  return canonical ?? OTHER_TOOL
}

export const publicClaudeModel = (m: string) => (m in PRICING ? m : CLAUDE_OTHER)
export const publicOpenAIModel = (m: string) => (m in OPENAI_PRICING ? m : OPENAI_OTHER)

// Effort levels as the tools log them. "unrecorded" = transcripts from before effort was
// logged; anything unexpected publishes as "other".
export const CLAUDE_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max', 'unrecorded', 'other'] as const
export const OPENAI_EFFORT_LEVELS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
  'unrecorded',
  'other',
] as const
export const publicClaudeEffort = (e: string) => ((CLAUDE_EFFORT_LEVELS as readonly string[]).includes(e) ? e : 'other')
export const publicOpenAIEffort = (e: string) => ((OPENAI_EFFORT_LEVELS as readonly string[]).includes(e) ? e : 'other')

// --- Validator ---------------------------------------------------------------------------

type Spec =
  | 'number'
  | 'boolean'
  | 'date' // YYYY-MM-DD
  | 'month' // YYYY-MM
  | { object: Record<string, Spec>; optional?: string[] }
  | { map: readonly string[]; value: Spec } // keys restricted to an enum
  | { array: Spec }

const TOKENS: Spec = {
  object: { input: 'number', output: 'number', cacheCreation: 'number', cacheRead: 'number', total: 'number' },
}
const OPENAI_TOKENS: Spec = {
  object: { input: 'number', cachedInput: 'number', cacheWrite: 'number', output: 'number', reasoning: 'number' },
}
const CATEGORY_AGG: Spec = {
  object: { tokens: 'number', costUSD: 'number', messages: 'number', sessions: 'number', agentRuns: 'number' },
}
const TOOL_KEYS = [...BUILTIN_TOOLS, MCP_TOOL, OTHER_TOOL]
const LANE: Spec = {
  object: {
    runs: 'number',
    costUSD: 'number',
    tokens: TOKENS,
    byModel: { map: PUBLIC_CLAUDE_MODELS, value: { object: { runs: 'number', costUSD: 'number' } } },
  },
}

export const PUBLIC_SPEC: Spec = {
  object: {
    schemaVersion: 'number',
    generatedAt: 'date',
    dateRange: { object: { start: 'date', end: 'date' } },
    overview: {
      object: {
        totalSessions: 'number',
        totalAgentRuns: 'number',
        totalMessages: 'number',
        totalTokens: 'number',
        totalCostUSD: 'number',
        activeDays: 'number',
      },
    },
    daily: {
      array: {
        object: {
          date: 'date',
          sessions: 'number', // transcripts (sessions + agent runs) with usage that day
          sessionsStarted: 'number',
          agentRunsStarted: 'number',
          messages: 'number',
          toolCalls: 'number',
          tokens: TOKENS,
          costUSD: 'number',
          byModel: {
            map: PUBLIC_CLAUDE_MODELS,
            value: { object: { tokens: TOKENS, costUSD: 'number', sessions: 'number', agentRuns: 'number' } },
          },
          tools: { map: TOOL_KEYS, value: 'number' },
        },
      },
    },
    // Categories are published by month, not by day (a daily client series reads as an
    // engagement timeline).
    monthly: {
      array: {
        object: {
          month: 'month',
          costUSD: 'number',
          tokens: 'number',
          byCategory: { map: PUBLIC_CATEGORIES, value: CATEGORY_AGG },
        },
      },
    },
    byCategory: { map: PUBLIC_CATEGORIES, value: CATEGORY_AGG },
    byModel: {
      map: PUBLIC_CLAUDE_MODELS,
      value: { object: { sessions: 'number', agentRuns: 'number', tokens: TOKENS, costUSD: 'number' } },
    },
    toolUsage: { map: TOOL_KEYS, value: 'number' },
    effort: {
      map: PUBLIC_CLAUDE_MODELS,
      value: {
        map: CLAUDE_EFFORT_LEVELS,
        value: { object: { responses: 'number', tokens: TOKENS, thinkingTokens: 'number', costUSD: 'number' } },
      },
    },
    orchestration: {
      map: PUBLIC_CLAUDE_MODELS,
      value: {
        object: {
          sessions: 'number',
          messages: 'number',
          main: { object: { tokens: TOKENS, costUSD: 'number' } },
          subagents: LANE,
          workflows: LANE,
        },
      },
    },
    openai: {
      object: {
        firstDate: 'date',
        lastDate: 'date',
        totals: {
          object: { responses: 'number', unpricedResponses: 'number', tokens: OPENAI_TOKENS, costUSD: 'number' },
        },
        daily: {
          array: {
            object: {
              date: 'date',
              responses: 'number',
              unpricedResponses: 'number',
              tokens: OPENAI_TOKENS,
              costUSD: 'number',
            },
          },
        },
        byModel: {
          map: PUBLIC_OPENAI_MODELS,
          value: { object: { responses: 'number', tokens: OPENAI_TOKENS, costUSD: 'number', priced: 'boolean' } },
        },
        effort: {
          map: PUBLIC_OPENAI_MODELS,
          value: {
            map: OPENAI_EFFORT_LEVELS,
            value: { object: { responses: 'number', tokens: OPENAI_TOKENS, costUSD: 'number' } },
          },
        },
      },
    },
  },
  optional: ['openai'],
}

/** Every fixed string the contract allows: field names, categories, tools, model IDs. */
export function publicVocabulary(): Set<string> {
  const vocab = new Set<string>()
  const walk = (s: Spec) => {
    if (typeof s === 'string') return
    if ('array' in s) return walk(s.array)
    if ('map' in s) {
      for (const k of s.map) vocab.add(k)
      return walk(s.value)
    }
    for (const [k, v] of Object.entries(s.object)) {
      vocab.add(k)
      walk(v)
    }
  }
  walk(PUBLIC_SPEC)
  return vocab
}

/** Returns every violation; an empty list means the value matches the contract exactly. */
export function validatePublic(value: unknown): string[] {
  const errors: string[] = []
  check(value, PUBLIC_SPEC, '$', errors)
  return errors
}

function check(v: unknown, spec: Spec, at: string, errors: string[]) {
  if (spec === 'number') {
    if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${at}: expected number`)
    return
  }
  if (spec === 'boolean') {
    if (typeof v !== 'boolean') errors.push(`${at}: expected boolean`)
    return
  }
  if (spec === 'date') {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors.push(`${at}: expected YYYY-MM-DD`)
    return
  }
  if (spec === 'month') {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}$/.test(v)) errors.push(`${at}: expected YYYY-MM`)
    return
  }
  if ('array' in spec) {
    if (!Array.isArray(v)) return void errors.push(`${at}: expected array`)
    for (const [i, item] of v.entries()) check(item, spec.array, `${at}[${i}]`, errors)
    return
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return void errors.push(`${at}: expected object`)
  const obj = v as Record<string, unknown>
  if ('map' in spec) {
    for (const [k, val] of Object.entries(obj)) {
      if (!spec.map.includes(k)) errors.push(`${at}: key not in allowlist: ${JSON.stringify(k)}`)
      else check(val, spec.value, `${at}[${JSON.stringify(k)}]`, errors)
    }
    return
  }
  const optional = new Set(spec.optional ?? [])
  for (const k of Object.keys(obj)) {
    if (!(k in spec.object)) errors.push(`${at}: unknown key ${JSON.stringify(k)}`)
  }
  for (const [k, s] of Object.entries(spec.object)) {
    if (!(k in obj)) {
      if (!optional.has(k)) errors.push(`${at}: missing key ${JSON.stringify(k)}`)
      continue
    }
    check(obj[k], s, `${at}.${k}`, errors)
  }
}
