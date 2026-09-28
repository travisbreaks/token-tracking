import { useMemo } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { useDashboard } from '@/context/DashboardContext'
import { COLORS, PROJECT_PALETTE } from '@/lib/constants'
import { formatCost } from '@/lib/formatters'

export function ProjectBreakdown() {
  const { filteredDaily, filteredSessions } = useDashboard()

  const chartData = useMemo(() => {
    // Cost from daily aggregates (accurate per-project token-level attribution)
    const byProject: Record<string, { cost: number; sessions: number }> = {}
    for (const d of filteredDaily) {
      for (const [proj, pd] of Object.entries(d.byProject ?? {})) {
        if (!byProject[proj]) byProject[proj] = { cost: 0, sessions: 0 }
        byProject[proj].cost += pd.costUSD
      }
    }
    // Session count from filteredSessions
    for (const s of filteredSessions) {
      if (!byProject[s.project]) byProject[s.project] = { cost: 0, sessions: 0 }
      byProject[s.project].sessions += 1
    }
    return Object.entries(byProject)
      .map(([name, d]) => ({ name, cost: d.cost, sessions: d.sessions }))
      .sort((a, b) => b.cost - a.cost)
  }, [filteredDaily, filteredSessions])

  return (
    <GlassPanel>
      <h2 className="text-xs text-text-muted uppercase tracking-[0.15em] mb-4">By Project</h2>
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
            width={120}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as { name: string; cost: number; sessions: number }
              return (
                <div className="glass-panel px-3 py-2 text-xs">
                  <p className="text-text-primary font-semibold">{d.name}</p>
                  <p className="text-gold">{formatCost(d.cost)}</p>
                  <p className="text-text-muted">{d.sessions} sessions</p>
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
