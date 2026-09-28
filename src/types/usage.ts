export interface TokenBreakdown {
  input: number
  output: number
  cacheCreation: number
  cacheRead: number
  total: number
}

export interface DailyAggregate {
  date: string
  /** Transcripts (sessions and agent runs) with billed usage this day. Not a session count. */
  sessions: number
  messages: number
  toolCalls: number
  tokens: TokenBreakdown
  costUSD: number
  /** sessions / agentRuns: those started this day that used the model (membership overlaps). */
  byModel: Record<string, { tokens: TokenBreakdown; costUSD: number; sessions?: number; agentRuns?: number }>
  /** Local only; absent from the public file. */
  byProject?: Record<string, { tokens: number; costUSD: number; messages: number }>
  /** Top-level sessions whose first event falls on this day; sums exactly across days. */
  sessionsStarted?: number
  /** Subagent runs whose first event falls on this day. */
  agentRunsStarted?: number
  byCategory?: Record<string, CategoryAggregate>
  /** Tool calls made this day, once per tool_use id. */
  tools?: Record<string, number>
}

export interface CategoryAggregate {
  tokens: number
  costUSD: number
  messages: number
  /** Top-level sessions started, counted under their primary project's category. */
  sessions: number
  agentRuns?: number
}

export interface SessionDetail {
  id: string
  startTime: string
  endTime: string
  durationMs: number
  project: string
  category?: string
  /** 'agent' for subagent transcripts. */
  kind?: 'session' | 'agent'
  /** The model that carried most of this transcript's cost. */
  model?: string
  /** For agent runs: the session that launched it, and whether directly or in a workflow. */
  parentId?: string
  lane?: 'subagent' | 'workflow'
  /** Responses per effort level. */
  efforts?: Record<string, number>
  /** Actual API-equivalent spend per model; older snapshots may omit this. Local only. */
  modelCosts?: Record<string, number>
  models: string[]
  messages: number
  tokens: TokenBreakdown
  costUSD: number
  toolsUsed: Record<string, number>
}

/** Usage at one model and effort level. `responses` counts API responses. */
export interface EffortAggregate {
  responses: number
  tokens: TokenBreakdown
  /** Part of output; 0 where the transcript did not report it. */
  thinkingTokens: number
  costUSD: number
}

/** Agent runs launched from top-level sessions, as direct subagents or inside workflows. */
export interface OrchestrationLane {
  runs: number
  costUSD: number
  tokens: TokenBreakdown
  /** The model each agent run mostly ran on. */
  byModel: Record<string, { runs: number; costUSD: number }>
}

/** Top-level sessions grouped by the model that carried most of their cost. */
export interface OrchestrationAggregate {
  sessions: number
  messages: number
  main: { tokens: TokenBreakdown; costUSD: number }
  subagents: OrchestrationLane
  workflows: OrchestrationLane
}

/** Category totals for one calendar month (the public view publishes categories by month). */
export interface MonthlyCategories {
  month: string
  costUSD: number
  tokens: number
  byCategory: Record<string, CategoryAggregate>
}

export interface ProjectAggregate {
  sessions: number
  messages: number
  tokens: number
  costUSD: number
}

export interface ModelAggregate {
  sessions: number
  agentRuns?: number
  tokens: TokenBreakdown
  costUSD: number
}

export interface WorkDayStats {
  hours: number
  periods: number
}

export interface WorkStats {
  totalHours: number
  activeDays: number
  avgHoursPerDay: number
  longestDay: { date: string; hours: number }
  longestStreak: number
  totalPeriods: number
}

export interface WorkPeriodBucket {
  bucket: string
  count: number
}

export interface UsageData {
  generatedAt: string
  dateRange: { start: string; end: string }

  overview: {
    totalSessions: number
    totalAgentRuns?: number
    totalMessages: number
    totalTokens: number
    totalCostUSD: number
    activeDays: number
    firstSession: string
    lastSession: string
  }

  daily: DailyAggregate[]
  sessions: SessionDetail[]
  byProject: Record<string, ProjectAggregate>
  byCategory?: Record<string, CategoryAggregate>
  byModel: Record<string, ModelAggregate>
  toolUsage: Record<string, number>
  hourDistribution: Record<string, number>
  workByDay: Record<string, WorkDayStats>
  workStats: WorkStats
  workPeriodDistribution: WorkPeriodBucket[]
  workByThreshold: Record<
    string,
    { byDay: Record<string, WorkDayStats>; stats: WorkStats; distribution: WorkPeriodBucket[] }
  >
  /** model -> effort level ('unrecorded' before effort was logged) -> usage. */
  effort?: Record<string, Record<string, EffortAggregate>>
  orchestration?: Record<string, OrchestrationAggregate>
  /** Agent transcripts whose parent session could not be found. */
  unlinkedAgentRuns?: number
  /** From local Codex session logs; absent when there are none. */
  openai?: OpenAIUsage
}

export interface OpenAITokenBreakdown {
  /** Includes cachedInput and cacheWrite. */
  input: number
  cachedInput: number
  cacheWrite: number
  /** Includes reasoning. */
  output: number
  reasoning: number
}

export interface OpenAIDailyAggregate {
  date: string
  responses: number
  unpricedResponses: number
  tokens: OpenAITokenBreakdown
  costUSD: number
}

export interface OpenAIUsage {
  source: string
  firstDate: string
  lastDate: string
  totals: { responses: number; unpricedResponses: number; tokens: OpenAITokenBreakdown; costUSD: number }
  daily: OpenAIDailyAggregate[]
  byModel: Record<string, { responses: number; tokens: OpenAITokenBreakdown; costUSD: number; priced: boolean }>
  /** model -> reasoning effort -> usage. */
  effort?: Record<string, Record<string, { responses: number; tokens: OpenAITokenBreakdown; costUSD: number }>>
  /** The plan's usage window at the most recent Codex event that reported it. */
  planLimit: {
    capturedAt: string
    planType: string | null
    usedPercent: number | null
    windowMinutes: number | null
    resetsAt: string | null
    secondary?: { usedPercent: number | null; windowMinutes: number | null; resetsAt: string | null } | null
    limitReached?: string | null
  } | null
}

/**
 * The published file (public/data/usage.json). Built field by field by scripts/publish.ts
 * and validated against scripts/public-contract.ts. No sessions, projects, paths, schedule
 * or account state.
 */
export interface PublicUsageData {
  schemaVersion: number
  generatedAt: string
  dateRange: { start: string; end: string }
  overview: {
    totalSessions: number
    totalAgentRuns: number
    totalMessages: number
    totalTokens: number
    totalCostUSD: number
    activeDays: number
  }
  /** Public daily entries carry no category split; categories are published by month. */
  daily: DailyAggregate[]
  monthly: MonthlyCategories[]
  byCategory: Record<string, CategoryAggregate>
  byModel: Record<string, ModelAggregate>
  toolUsage: Record<string, number>
  effort: Record<string, Record<string, EffortAggregate>>
  orchestration: Record<string, OrchestrationAggregate>
  openai?: Omit<OpenAIUsage, 'source' | 'planLimit'>
}
