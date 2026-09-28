import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { useDashboard } from '@/context/DashboardContext'
import { COLORS } from '@/lib/constants'
import { computeCostComparison } from '@/lib/costPeriod'
import { formatCost } from '@/lib/formatters'

export function CostComparisonCards() {
  const { data, privateData, spendData, timeRange } = useDashboard()

  const row = useMemo(() => {
    if (!spendData) return null
    return computeCostComparison(
      data.daily,
      spendData.subscriptions,
      timeRange,
      new Date(),
      privateData?.overview.firstSession ?? data.dateRange.start,
    )
  }, [data, privateData, spendData, timeRange])

  if (!row) return null

  const ratioColor = row.ratio >= 3 ? COLORS.green : row.ratio >= 1 ? COLORS.gold : COLORS.pink
  const isPositive = row.savings >= 0
  const forecastRatioColor = (r: number) => (r >= 3 ? COLORS.green : r >= 1 ? COLORS.gold : COLORS.pink)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4 }}
      className="mb-6"
    >
      <GlassPanel>
        <p className="text-text-muted text-[10px] uppercase tracking-[0.15em] mb-5">Cost Reality Check</p>

        {/* Stats: re-animate on period change */}
        <AnimatePresence mode="wait">
          <motion.div
            key={timeRange}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {/* Main Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <div>
                <p className="text-text-muted text-[10px] uppercase tracking-[0.15em] mb-1">API Compute</p>
                <p className="text-2xl font-display font-semibold" style={{ color: COLORS.gold }}>
                  {formatCost(row.apiCost)}
                </p>
                <p className="text-text-muted text-xs mt-0.5">{formatCost(row.dailyRate)}/day avg</p>
              </div>

              <div>
                <p className="text-text-muted text-[10px] uppercase tracking-[0.15em] mb-1">Sub Cost</p>
                <p className="text-2xl font-display font-semibold" style={{ color: COLORS.pink }}>
                  {formatCost(row.subCost)}
                </p>
                <p className="text-text-muted text-xs mt-0.5">
                  {row.days}d pro-rated, {row.planLabel}
                </p>
              </div>

              <div>
                <p className="text-text-muted text-[10px] uppercase tracking-[0.15em] mb-1">Value Ratio</p>
                <p className="text-2xl font-display font-semibold" style={{ color: ratioColor }}>
                  {row.ratio > 0 ? `${row.ratio.toFixed(1)}×` : '-'}
                </p>
                <p className="text-text-muted text-xs mt-0.5">API value per $ paid</p>
              </div>

              <div>
                <p className="text-text-muted text-[10px] uppercase tracking-[0.15em] mb-1">Net Value</p>
                <div className="mt-1.5">
                  <span
                    className="text-[11px] uppercase tracking-wider font-display px-2.5 py-1 rounded"
                    style={{
                      color: isPositive ? COLORS.green : COLORS.pink,
                      backgroundColor: isPositive ? 'rgba(34,197,94,0.12)' : 'rgba(255,42,109,0.12)',
                    }}
                  >
                    {isPositive ? `+${formatCost(row.savings)}` : `\u2212${formatCost(Math.abs(row.savings))}`}
                  </span>
                </div>
                <p className="text-text-muted text-xs mt-2">{isPositive ? 'above sub cost' : 'below sub cost'}</p>
              </div>
            </div>

            {/* Forecast */}
            <div className="border-t border-white/5 pt-4">
              <p className="text-text-muted text-[10px] uppercase tracking-[0.15em] mb-3">
                Forecast at this run rate ({formatCost(row.dailyRate)}/day)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Monthly */}
                <div className="rounded bg-white/[0.03] border border-white/5 px-3 py-2.5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-text-muted text-[10px] uppercase tracking-[0.1em] mb-1">Monthly</p>
                    <p
                      className="font-display text-sm font-semibold"
                      style={{ color: forecastRatioColor(row.monthlyRatio) }}
                    >
                      {formatCost(row.monthlyProjected)} API
                    </p>
                    <p className="text-text-muted text-xs">vs {formatCost(row.monthlySub)} sub</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className="font-display text-xl font-semibold"
                      style={{ color: forecastRatioColor(row.monthlyRatio) }}
                    >
                      {row.monthlyRatio > 0 ? `${row.monthlyRatio.toFixed(1)}×` : '-'}
                    </p>
                    <p className="text-text-muted text-[10px]">value ratio</p>
                  </div>
                </div>

                {/* Annual */}
                <div className="rounded bg-white/[0.03] border border-white/5 px-3 py-2.5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-text-muted text-[10px] uppercase tracking-[0.1em] mb-1">Annual</p>
                    <p
                      className="font-display text-sm font-semibold"
                      style={{ color: forecastRatioColor(row.annualRatio) }}
                    >
                      {formatCost(row.annualProjected)} API
                    </p>
                    <p className="text-text-muted text-xs">vs {formatCost(row.annualSub)} sub</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className="font-display text-xl font-semibold"
                      style={{ color: forecastRatioColor(row.annualRatio) }}
                    >
                      {row.annualRatio > 0 ? `${row.annualRatio.toFixed(1)}×` : '-'}
                    </p>
                    <p className="text-text-muted text-[10px]">value ratio</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <p className="text-text-muted text-[10px] mt-4 border-t border-white/5 pt-3">
          Sub cost = each day in range charged at (plan &divide; 30.44), for whichever Claude plan was active that day.
          API compute = the same usage priced at pay-as-you-go API list rates; no money was spent at that rate.
        </p>
      </GlassPanel>
    </motion.div>
  )
}
