import { useMemo } from 'react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { useDashboard } from '@/context/DashboardContext'
import { COLORS } from '@/lib/constants'
import { formatCost, formatTokens, getModelDisplayName } from '@/lib/formatters'

// Two all-time views for choosing a model and an effort level. Both are observational:
// rows differ by task as well as by setting. The effort map is the method for deciding;
// these tables are the measured cost side of it.

const EFFORT_MAP = 'https://travismakes.org/effort-map/'
const MIN_RESPONSES = 100
const CLAUDE_ORDER = ['low', 'medium', 'high', 'xhigh', 'max', 'other', 'unrecorded']
const OPENAI_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'other', 'unrecorded']
const levelLabel = (l: string) => (l === 'unrecorded' ? 'not recorded' : l)
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '-')
const money = (n: number) => (n < 1 ? `$${n.toFixed(3)}` : formatCost(n))
// Per-response token averages: whole numbers below 1K, the usual short form above.
const perResponse = (n: number) => (n < 1000 ? String(Math.round(n)) : formatTokens(n))

function Th({ children, right = false }: { children: string; right?: boolean }) {
  return (
    <th
      className={`py-1.5 pr-4 text-[10px] uppercase tracking-[0.12em] font-normal text-text-muted ${right ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  right = false,
  strong = false,
}: {
  children: React.ReactNode
  right?: boolean
  strong?: boolean
}) {
  return (
    <td
      className={`py-1.5 pr-4 text-xs whitespace-nowrap ${right ? 'text-right tabular-nums' : 'text-left'}`}
      style={{ color: strong ? COLORS.textPrimary : COLORS.textSecondary }}
    >
      {children}
    </td>
  )
}

function Caption({ children }: { children: React.ReactNode }) {
  return <p className="text-text-muted text-[11px] leading-relaxed mt-3 max-w-3xl">{children}</p>
}

function EffortMapLink() {
  return (
    <a href={EFFORT_MAP} className="underline decoration-dotted hover:text-cyan" target="_blank" rel="noreferrer">
      effort map
    </a>
  )
}

export function OrchestrationTable() {
  const { data } = useDashboard()
  const rows = useMemo(() => {
    return Object.entries(data.orchestration ?? {})
      .map(([model, o]) => {
        const agentsCost = o.subagents.costUSD + o.workflows.costUSD
        const total = o.main.costUSD + agentsCost
        const ranOn: Record<string, number> = {}
        for (const lane of [o.subagents, o.workflows]) {
          for (const [m, v] of Object.entries(lane.byModel)) ranOn[m] = (ranOn[m] ?? 0) + v.costUSD
        }
        const top = Object.entries(ranOn)
          .filter(([, c]) => c >= 1)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([m, c]) => `${getModelDisplayName(m)} ${formatCost(c)}`)
          .join(', ')
        return {
          model,
          sessions: o.sessions,
          perSession: o.sessions ? total / o.sessions : 0,
          perMessage: o.messages ? total / o.messages : 0,
          mainShare: pct(o.main.costUSD, total),
          agentRuns: o.subagents.runs + o.workflows.runs,
          top,
          total,
        }
      })
      .filter((r) => r.sessions > 0)
      .sort((a, b) => b.total - a.total)
  }, [data])

  if (rows.length === 0) return null
  return (
    <GlassPanel className="mb-4">
      <h2 className="text-xs text-text-muted uppercase tracking-[0.15em] mb-3">Who runs the top level</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/5">
              <Th>Top-level model</Th>
              <Th right>Sessions</Th>
              <Th right>Per session</Th>
              <Th right>Per message</Th>
              <Th right>Main loop</Th>
              <Th right>Agent runs</Th>
              <Th>Agents mostly ran on</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.model} className="border-b border-white/[0.03]">
                <Td strong>{getModelDisplayName(r.model)}</Td>
                <Td right>{r.sessions.toLocaleString()}</Td>
                <Td right>{formatCost(r.perSession)}</Td>
                <Td right>{money(r.perMessage)}</Td>
                <Td right>{r.mainShare}</Td>
                <Td right>{r.agentRuns.toLocaleString()}</Td>
                <Td>{r.top || '-'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Caption>
        All time, API-equivalent, agents included in the per-session and per-message cost. A session is grouped by the
        model that carried most of its cost; an agent run by the session that launched it. The main loop (long context,
        mostly cache reads) carried most cost in this dataset. Both top-level and agent models affect cost and
        capability. Agent dollar amounts group whole runs by their dominant model, not exact per-model spend. Rows
        differ in task, month and effort: this shows where money went, not a controlled comparison. To compare two
        settings on the same work, use the paired trial in the <EffortMapLink />.
      </Caption>
    </GlassPanel>
  )
}

export function EffortTable() {
  const { data } = useDashboard()
  const claudeRows = useMemo(() => {
    const models = Object.entries(data.effort ?? {}).sort(
      (a, b) =>
        Object.values(b[1]).reduce((s, v) => s + v.costUSD, 0) - Object.values(a[1]).reduce((s, v) => s + v.costUSD, 0),
    )
    return models.flatMap(([model, levels]) =>
      Object.entries(levels)
        .filter(([, v]) => v.responses >= MIN_RESPONSES)
        .sort((a, b) => CLAUDE_ORDER.indexOf(a[0]) - CLAUDE_ORDER.indexOf(b[0]))
        .map(([level, v]) => ({
          key: `${model}-${level}`,
          model,
          level,
          responses: v.responses,
          outPer: v.tokens.output / v.responses,
          // 0 thinking tokens means the transcripts did not report them, not that none were used.
          thinking: level === 'unrecorded' || v.thinkingTokens === 0 ? '-' : pct(v.thinkingTokens, v.tokens.output),
          costPer: v.costUSD / v.responses,
        })),
    )
  }, [data])

  const openaiRows = useMemo(() => {
    const effort = data.openai && 'effort' in data.openai ? data.openai.effort : undefined
    const priced = data.openai?.byModel ?? {}
    return Object.entries(effort ?? {}).flatMap(([model, levels]) =>
      Object.entries(levels)
        .filter(([, v]) => v.responses >= MIN_RESPONSES)
        .sort((a, b) => OPENAI_ORDER.indexOf(a[0]) - OPENAI_ORDER.indexOf(b[0]))
        .map(([level, v]) => ({
          key: `${model}-${level}`,
          model,
          level,
          responses: v.responses,
          outPer: v.tokens.output / v.responses,
          reasoning: pct(v.tokens.reasoning, v.tokens.output),
          costPer: priced[model]?.priced === false ? null : v.costUSD / v.responses,
        })),
    )
  }, [data])

  if (claudeRows.length === 0 && openaiRows.length === 0) return null
  return (
    <GlassPanel className="mb-4">
      <h2 className="text-xs text-text-muted uppercase tracking-[0.15em] mb-3">Model and effort</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/5">
              <Th>Model</Th>
              <Th>Effort</Th>
              <Th right>Responses</Th>
              <Th right>Output / response</Th>
              <Th right>Thinking share</Th>
              <Th right>Cost / response</Th>
            </tr>
          </thead>
          <tbody>
            {claudeRows.map((r) => (
              <tr key={r.key} className="border-b border-white/[0.03]">
                <Td strong>{getModelDisplayName(r.model)}</Td>
                <Td>{levelLabel(r.level)}</Td>
                <Td right>{r.responses.toLocaleString()}</Td>
                <Td right>{perResponse(r.outPer)}</Td>
                <Td right>{r.thinking}</Td>
                <Td right>{money(r.costPer)}</Td>
              </tr>
            ))}
            {openaiRows.length > 0 && (
              <tr>
                <td colSpan={6} className="pt-4 pb-1 text-[10px] uppercase tracking-[0.12em] text-text-muted">
                  OpenAI Codex (reasoning share instead of thinking share)
                </td>
              </tr>
            )}
            {openaiRows.map((r) => (
              <tr key={r.key} className="border-b border-white/[0.03]">
                <Td strong>{r.model}</Td>
                <Td>{levelLabel(r.level)}</Td>
                <Td right>{r.responses.toLocaleString()}</Td>
                <Td right>{perResponse(r.outPer)}</Td>
                <Td right>{r.reasoning}</Td>
                <Td right>{r.costPer === null ? 'unpriced' : money(r.costPer)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Caption>
        All time, rows with at least {MIN_RESPONSES} responses. Effort is a behavioral signal, not a token budget, and
        harder work tends to get higher effort, so rows differ by task as well as by setting. Cost per response is
        mostly context (cache reads), which is why it does not simply rise with effort. "Not recorded" is usage from
        before the tools logged effort. Start low and raise effort for an observed reason: the <EffortMapLink /> has the
        method.
      </Caption>
    </GlassPanel>
  )
}
