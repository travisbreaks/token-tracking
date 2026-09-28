import { useMemo } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { useDashboard } from '@/context/DashboardContext'
import { COLORS } from '@/lib/constants'

export function ToolPatterns() {
  const { filteredSessions, filteredDaily, isPublic } = useDashboard()

  const chartData = useMemo(() => {
    const toolUsage: Record<string, number> = {}
    // Public data has per-day tool counts (MCP tools already collapsed) instead of sessions.
    const sources = isPublic ? filteredDaily.map((d) => d.tools ?? {}) : filteredSessions.map((s) => s.toolsUsed)
    for (const tools of sources) {
      for (const [tool, count] of Object.entries(tools)) {
        toolUsage[tool] = (toolUsage[tool] || 0) + count
      }
    }
    return Object.entries(toolUsage)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)
  }, [filteredSessions, filteredDaily, isPublic])

  return (
    <GlassPanel>
      <h2 className="text-xs text-text-muted uppercase tracking-[0.15em] mb-4">Tool Usage</h2>
      <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 28)}>
        <BarChart data={chartData} layout="vertical">
          <XAxis type="number" tick={{ fontSize: 10, fill: COLORS.textMuted }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 10, fill: COLORS.textSecondary }}
            axisLine={false}
            tickLine={false}
            width={120}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as { name: string; count: number }
              return (
                <div className="glass-panel px-3 py-2 text-xs">
                  <p className="text-text-primary">{d.name}</p>
                  <p className="text-cyan">{d.count.toLocaleString()} calls</p>
                </div>
              )
            }}
          />
          <Bar dataKey="count" fill={COLORS.cyan} fillOpacity={0.6} radius={[0, 4, 4, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </GlassPanel>
  )
}
