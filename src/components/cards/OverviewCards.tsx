import { motion } from 'motion/react'
import { useMemo } from 'react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { useDashboard } from '@/context/DashboardContext'
import { COLORS } from '@/lib/constants'
import { formatCost, formatTokens } from '@/lib/formatters'

interface StatCardProps {
  label: string
  value: string
  color: string
  sub?: string
  index: number
}

function StatCard({ label, value, color, sub, index }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
    >
      <GlassPanel className="h-full">
        <p className="text-text-muted text-[10px] uppercase tracking-[0.15em] mb-2">{label}</p>
        <p className="text-2xl font-display font-semibold" style={{ color }}>
          {value}
        </p>
        {sub && <p className="text-text-muted text-xs mt-1">{sub}</p>}
      </GlassPanel>
    </motion.div>
  )
}

export function OverviewCards() {
  const { filteredSessions, filteredDaily, isPublic, selectedProjects, selectedModels } = useDashboard()
  // Daily totals put tokens and cost on the day they were spent, which is what the charts
  // use too. A project or model filter needs session rows (local only), where a session's
  // whole cost follows its start day, so the cards say which basis they show.
  const bySession = !isPublic && (selectedProjects.length > 0 || selectedModels.length > 0)

  const stats = useMemo(() => {
    if (!bySession) {
      const totalCost = filteredDaily.reduce((sum, d) => sum + d.costUSD, 0)
      const activeDays = filteredDaily.filter((d) => d.costUSD > 0 || d.tokens.output > 0).length
      return {
        totalCost,
        totalOutput: filteredDaily.reduce((sum, d) => sum + d.tokens.output, 0),
        totalAll: filteredDaily.reduce((sum, d) => sum + d.tokens.total, 0),
        sessions: filteredDaily.reduce((sum, d) => sum + (d.sessionsStarted ?? 0), 0),
        agentRuns: filteredDaily.reduce((sum, d) => sum + (d.agentRunsStarted ?? 0), 0),
        activeDays,
        avgCostPerDay: activeDays > 0 ? totalCost / activeDays : 0,
      }
    }
    const totalCost = filteredSessions.reduce((sum, s) => sum + s.costUSD, 0)
    const uniqueDays = new Set(filteredSessions.map((s) => s.startTime.slice(0, 10)))
    return {
      totalCost,
      totalOutput: filteredSessions.reduce((sum, s) => sum + s.tokens.output, 0),
      totalAll: filteredSessions.reduce((sum, s) => sum + s.tokens.total, 0),
      sessions: filteredSessions.filter((s) => s.kind !== 'agent').length,
      agentRuns: filteredSessions.filter((s) => s.kind === 'agent').length,
      activeDays: uniqueDays.size,
      avgCostPerDay: uniqueDays.size > 0 ? totalCost / uniqueDays.size : 0,
    }
  }, [filteredSessions, filteredDaily, bySession])

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      <StatCard
        index={0}
        label="API-equivalent cost"
        value={formatCost(stats.totalCost)}
        color={COLORS.gold}
        sub={`${formatCost(stats.avgCostPerDay)}/day avg${bySession ? ', by session start' : ''}`}
      />
      <StatCard index={1} label="Output Tokens" value={formatTokens(stats.totalOutput)} color={COLORS.cyan} />
      <StatCard
        index={2}
        label="Total Tokens"
        value={formatTokens(stats.totalAll)}
        color={COLORS.cyan}
        sub="incl. cache"
      />
      <StatCard
        index={3}
        label="Sessions"
        value={stats.sessions.toLocaleString()}
        color={COLORS.pink}
        sub={`+ ${stats.agentRuns.toLocaleString()} agent runs`}
      />
      <StatCard index={4} label="Active Days" value={String(stats.activeDays)} color={COLORS.gold} />
    </div>
  )
}
