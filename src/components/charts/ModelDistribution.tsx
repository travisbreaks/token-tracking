import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { useDashboard } from '@/context/DashboardContext'
import { MODEL_COLORS, PROJECT_PALETTE } from '@/lib/constants'
import { formatCost, getModelDisplayName } from '@/lib/formatters'

// Named colors for older models; newer ones take the palette in rank order.
const modelColor = (name: string, i: number) => MODEL_COLORS[name] ?? PROJECT_PALETTE[i % PROJECT_PALETTE.length]

export function ModelDistribution() {
  const { filteredDaily, filteredSessions, isPublic } = useDashboard()

  const chartData = useMemo(() => {
    // Cost per model from daily aggregates (accurate per-model token-level attribution)
    const byModel: Record<string, { cost: number; sessions: number; agentRuns: number }> = {}
    for (const d of filteredDaily) {
      for (const [model, md] of Object.entries(d.byModel)) {
        const name = getModelDisplayName(model)
        if (!byModel[name]) byModel[name] = { cost: 0, sessions: 0, agentRuns: 0 }
        byModel[name].cost += md.costUSD
        // Public data carries per-day session counts per model instead of session rows.
        if (isPublic) {
          byModel[name].sessions += md.sessions ?? 0
          byModel[name].agentRuns += md.agentRuns ?? 0
        }
      }
    }
    // Session count: how many filtered sessions used each model
    for (const s of filteredSessions) {
      for (const m of s.models) {
        const name = getModelDisplayName(m)
        if (byModel[name]) byModel[name][s.kind === 'agent' ? 'agentRuns' : 'sessions'] += 1
      }
    }
    return Object.entries(byModel)
      .map(([name, d]) => ({ name, cost: d.cost, sessions: d.sessions, agentRuns: d.agentRuns }))
      .sort((a, b) => b.cost - a.cost)
  }, [filteredDaily, filteredSessions, isPublic])

  const totalCost = chartData.reduce((s, d) => s + d.cost, 0)

  return (
    <GlassPanel className="flex flex-col h-full overflow-hidden">
      <h2 className="text-xs text-text-muted uppercase tracking-[0.15em] mb-4">By Model</h2>
      <div className="relative flex-1 min-h-[100px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              dataKey="cost"
              stroke="none"
              paddingAngle={2}
            >
              {chartData.map((d, i) => (
                <Cell key={d.name} fill={modelColor(d.name, i)} fillOpacity={0.8} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload as { name: string; cost: number; sessions: number; agentRuns: number }
                return (
                  <div className="glass-panel px-3 py-2 text-xs">
                    <p className="text-text-primary font-semibold">{d.name}</p>
                    <p className="text-gold">{formatCost(d.cost)}</p>
                    <p className="text-text-muted">
                      {d.sessions} sessions, {d.agentRuns} agent runs used it
                    </p>
                  </div>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-lg font-display text-gold">{formatCost(totalCost)}</p>
            <p className="text-[10px] text-text-muted">TOTAL</p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-3 mt-2 overflow-hidden">
        {chartData.map((d, i) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs shrink-0">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: modelColor(d.name, i) }} />
            <span className="text-text-secondary">{d.name}</span>
          </div>
        ))}
      </div>
    </GlassPanel>
  )
}
