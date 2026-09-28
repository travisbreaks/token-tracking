import { useMemo } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { useDashboard } from '@/context/DashboardContext'
import { COLORS, PROJECT_PALETTE } from '@/lib/constants'
import { formatCost, formatTokens } from '@/lib/formatters'

// Spend by work category. Locally from daily aggregates; on the public site from whole
// months, because categories are published by month (a daily client series would read as an
// engagement timeline).
const monthLabel = (m: string) =>
  new Date(`${m}-15T12:00:00`).toLocaleString('en-US', { month: 'short', year: 'numeric' })

type CategoryTotals = Record<string, { cost: number; tokens: number; sessions: number; agentRuns: number }>

export function CategoryBreakdown() {
  const { filteredDaily, data } = useDashboard()

  const { chartData, months } = useMemo(() => {
    const byCategory: CategoryTotals = {}
    const add = (cats: Record<string, { costUSD: number; tokens: number; sessions: number; agentRuns?: number }>) => {
      for (const [cat, v] of Object.entries(cats)) {
        const c = byCategory[cat] ?? { cost: 0, tokens: 0, sessions: 0, agentRuns: 0 }
        c.cost += v.costUSD
        c.tokens += v.tokens
        c.sessions += v.sessions
        c.agentRuns += v.agentRuns ?? 0
        byCategory[cat] = c
      }
    }
    let months: string[] = []
    if ('monthly' in data) {
      const inRange = new Set(filteredDaily.map((d) => d.date.slice(0, 7)))
      const picked = data.monthly.filter((m) => inRange.has(m.month))
      for (const m of picked) add(m.byCategory)
      months = picked.map((m) => m.month)
    } else {
      for (const d of filteredDaily) add(d.byCategory ?? {})
    }
    return {
      chartData: Object.entries(byCategory)
        .map(([name, d]) => ({ name, ...d }))
        .sort((a, b) => b.cost - a.cost),
      months,
    }
  }, [filteredDaily, data])

  const monthNote =
    months.length === 0
      ? ''
      : months.length === 1
        ? ` Whole month shown: ${monthLabel(months[0])}.`
        : ` Whole months shown: ${monthLabel(months[0])} to ${monthLabel(months[months.length - 1])}.`

  return (
    <GlassPanel>
      <h2 className="text-xs text-text-muted uppercase tracking-[0.15em] mb-1">By Category</h2>
      <p className="text-text-muted text-[11px] mb-4">
        Estimated from where each session's file edits happened, not billed or measured work time.
        {monthNote}
      </p>
      <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 36)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 0 }}>
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: COLORS.textMuted }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatCost}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: COLORS.textSecondary }}
            axisLine={false}
            tickLine={false}
            width={140}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as {
                name: string
                cost: number
                tokens: number
                sessions: number
                agentRuns: number
              }
              return (
                <div className="glass-panel px-3 py-2 text-xs">
                  <p className="text-text-primary font-semibold">{d.name}</p>
                  <p className="text-gold">{formatCost(d.cost)}</p>
                  <p className="text-cyan">{formatTokens(d.tokens)} tokens</p>
                  <p className="text-text-muted">
                    {d.sessions} sessions, {d.agentRuns} agent runs
                  </p>
                </div>
              )
            }}
          />
          <Bar dataKey="cost" radius={[0, 4, 4, 0]} maxBarSize={24}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={PROJECT_PALETTE[i % PROJECT_PALETTE.length]} fillOpacity={0.7} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </GlassPanel>
  )
}
