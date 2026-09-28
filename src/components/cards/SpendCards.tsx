import { motion } from 'motion/react'
import { useMemo } from 'react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { useDashboard } from '@/context/DashboardContext'
import { COLORS } from '@/lib/constants'
import { formatCost } from '@/lib/formatters'

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

export function SpendCards() {
  const { spendData, data, privateData } = useDashboard()

  const stats = useMemo(() => {
    if (!spendData) return null

    const now = new Date()
    const activeSubs = spendData.subscriptions.filter((s) => !s.endDate || new Date(s.endDate) > now)
    const paidSubs = activeSubs.filter((s) => !s.freeTier && s.costPerMonth > 0)
    const monthlyBurn = activeSubs.reduce((sum, s) => sum + s.costPerMonth, 0)
    const freeTierCount = activeSubs.filter((s) => s.freeTier).length

    // API savings
    const apiCost = data.overview.totalCostUSD
    const firstSession = new Date(privateData?.overview.firstSession ?? data.dateRange.start)
    const monthsActive = Math.max(1, (now.getTime() - firstSession.getTime()) / (30.44 * 24 * 60 * 60 * 1000))
    const claudeSub = activeSubs.find((s) => s.id === 'claude-max')
    const subCostOverPeriod = claudeSub ? claudeSub.costPerMonth * monthsActive : 0
    const apiSavings = apiCost - subCostOverPeriod

    const costPerDay = monthlyBurn / 30.44
    const yearlyProjection = monthlyBurn * 12

    // Usage-based count
    const usageBasedCount = activeSubs.filter(
      (s) => s.billingType === 'usage-based' || s.billingType === 'metered',
    ).length

    // One-time costs this month
    const thisMonth = now.toISOString().slice(0, 7)
    const oneTimeThisMonth = spendData.oneTimeCosts
      .filter((c) => c.date.startsWith(thisMonth))
      .reduce((sum, c) => sum + c.amount, 0)

    return {
      monthlyBurn,
      paidCount: paidSubs.length,
      freeTierCount,
      usageBasedCount,
      apiSavings,
      costPerDay,
      yearlyProjection,
      oneTimeThisMonth,
      totalServices: activeSubs.length,
    }
  }, [spendData, data, privateData])

  if (!stats) return null

  const savingsColor = stats.apiSavings > 0 ? COLORS.green : COLORS.pink
  const savingsLabel = stats.apiSavings > 0 ? 'saved vs API' : 'over API cost'

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      <StatCard
        index={0}
        label="Monthly Burn"
        value={formatCost(stats.monthlyBurn)}
        color={COLORS.gold}
        sub={`${stats.paidCount} paid + ${stats.freeTierCount} free`}
      />
      <StatCard
        index={1}
        label="Yearly (Projected)"
        value={formatCost(stats.yearlyProjection)}
        color={COLORS.pink}
        sub="at current rate"
      />
      <StatCard
        index={2}
        label="Active Services"
        value={String(stats.totalServices)}
        color={COLORS.cyan}
        sub={stats.usageBasedCount > 0 ? `${stats.usageBasedCount} usage-based` : undefined}
      />
      <StatCard
        index={3}
        label="API Savings"
        value={formatCost(Math.abs(stats.apiSavings))}
        color={savingsColor}
        sub={savingsLabel}
      />
      <StatCard
        index={4}
        label="Cost / Day"
        value={formatCost(stats.costPerDay)}
        color={COLORS.textSecondary}
        sub="subscription avg"
      />
      <StatCard
        index={5}
        label="One-Time (Mo)"
        value={formatCost(stats.oneTimeThisMonth)}
        color={COLORS.gold}
        sub="this month"
      />
    </div>
  )
}
