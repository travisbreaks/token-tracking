import type { OpenAIDailyAggregate, OpenAITokenBreakdown, OpenAIUsage } from '../types/usage'
import { calculateOpenAICost } from './openaiCosts'

/** One API response, from a `token_usage_record` line in a Codex session log. */
export interface CodexResponseRecord {
  responseId: string
  timestamp: string
  /** From the last `turn_context` line before the record in the same file. */
  model: string
  /** Reasoning effort from that same `turn_context` line; 'unrecorded' when absent. */
  effort?: string
  tokens: OpenAITokenBreakdown
}

/** `rate_limits` from a `token_count` event: the plan's usage window at that moment. */
export interface CodexRateLimitSnapshot {
  timestamp: string
  planType: string | null
  usedPercent: number | null
  windowMinutes: number | null
  /** Unix seconds. */
  resetsAt: number | null
  /** A second window, present on some plans and absent (null) on most snapshots. */
  secondary?: { usedPercent: number | null; windowMinutes: number | null; resetsAt: number | null } | null
  /** `rate_limit_reached_type`: non-null while the plan is rate limited. */
  limitReached?: string | null
}

const toIso = (unixSeconds: number | null) => (unixSeconds === null ? null : new Date(unixSeconds * 1000).toISOString())

const emptyTokens = (): OpenAITokenBreakdown => ({ input: 0, cachedInput: 0, cacheWrite: 0, output: 0, reasoning: 0 })

function addTokens(into: OpenAITokenBreakdown, t: OpenAITokenBreakdown) {
  into.input += t.input
  into.cachedInput += t.cachedInput
  into.cacheWrite += t.cacheWrite
  into.output += t.output
  into.reasoning += t.reasoning
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Aggregate Codex responses into the dashboard's OpenAI section. Each response_id is
 * counted once. Responses on models with no published price are counted and their
 * tokens kept, but they add nothing to cost.
 */
export function aggregateCodexUsage(
  records: CodexResponseRecord[],
  rateLimits: CodexRateLimitSnapshot[],
  dateKey: (iso: string) => string,
  source: string,
): OpenAIUsage | null {
  const seen = new Set<string>()
  const daily = new Map<string, OpenAIDailyAggregate>()
  const byModel: OpenAIUsage['byModel'] = {}
  const effort: NonNullable<OpenAIUsage['effort']> = {}
  const totals = { responses: 0, unpricedResponses: 0, tokens: emptyTokens(), costUSD: 0 }

  for (const r of records) {
    if (seen.has(r.responseId)) continue
    seen.add(r.responseId)

    const cost = calculateOpenAICost(r.model, r.tokens)
    const date = dateKey(r.timestamp)
    let day = daily.get(date)
    if (!day) {
      day = { date, responses: 0, unpricedResponses: 0, tokens: emptyTokens(), costUSD: 0 }
      daily.set(date, day)
    }
    let model = byModel[r.model]
    if (!model) {
      model = { responses: 0, tokens: emptyTokens(), costUSD: 0, priced: cost !== null }
      byModel[r.model] = model
    }

    const level = r.effort ?? 'unrecorded'
    effort[r.model] ??= {}
    let eff = effort[r.model][level]
    if (!eff) {
      eff = { responses: 0, tokens: emptyTokens(), costUSD: 0 }
      effort[r.model][level] = eff
    }
    for (const bucket of [totals, day, model, eff]) {
      bucket.responses += 1
      addTokens(bucket.tokens, r.tokens)
      bucket.costUSD += cost ?? 0
    }
    if (cost === null) {
      totals.unpricedResponses += 1
      day.unpricedResponses += 1
    }
  }

  if (totals.responses === 0) return null

  const days = [...daily.values()].sort((a, b) => a.date.localeCompare(b.date))
  for (const d of days) d.costUSD = round2(d.costUSD)
  for (const m of Object.values(byModel)) m.costUSD = round2(m.costUSD)
  for (const levels of Object.values(effort)) for (const e of Object.values(levels)) e.costUSD = round2(e.costUSD)

  const latest = rateLimits.reduce<CodexRateLimitSnapshot | null>(
    (best, s) => (!best || s.timestamp > best.timestamp ? s : best),
    null,
  )

  return {
    source,
    firstDate: days[0].date,
    lastDate: days[days.length - 1].date,
    totals: { ...totals, costUSD: round2(totals.costUSD) },
    daily: days,
    byModel,
    effort,
    planLimit: latest
      ? {
          capturedAt: latest.timestamp,
          planType: latest.planType,
          usedPercent: latest.usedPercent,
          windowMinutes: latest.windowMinutes,
          resetsAt: toIso(latest.resetsAt),
          secondary: latest.secondary
            ? {
                usedPercent: latest.secondary.usedPercent,
                windowMinutes: latest.secondary.windowMinutes,
                resetsAt: toIso(latest.secondary.resetsAt),
              }
            : null,
          limitReached: latest.limitReached ?? null,
        }
      : null,
  }
}
