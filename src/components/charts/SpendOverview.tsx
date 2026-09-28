import { useMemo } from 'react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { useDashboard } from '@/context/DashboardContext'
import { CATEGORY_COLORS, COLORS, providerColor } from '@/lib/constants'
import { formatCost } from '@/lib/formatters'
import type { SubscriptionCategory } from '@/types/subscriptions'

const CATEGORY_LABELS: Record<SubscriptionCategory, string> = {
  'ai-tools': 'AI Tools',
  infrastructure: 'Infrastructure',
  hosting: 'Hosting',
  domains: 'Domains',
  'developer-tools': 'Dev Tools',
  media: 'Music / Audio',
  other: 'Entertainment',
}

export function SpendOverview() {
  const { spendData, data, privateData } = useDashboard()

  const breakdown = useMemo(() => {
    if (!spendData) return null

    const now = new Date()
    const activeSubs = spendData.subscriptions.filter((s) => !s.endDate || new Date(s.endDate) > now)

    // Group by category
    const byCategory: Record<string, { subs: typeof activeSubs; total: number }> = {}
    for (const sub of activeSubs) {
      const cat = sub.category || 'other'
      if (!byCategory[cat]) byCategory[cat] = { subs: [], total: 0 }
      byCategory[cat].subs.push(sub)
      byCategory[cat].total += sub.costPerMonth
    }

    // Group by provider (for the provider bar chart)
    const byProvider: Record<string, { subs: typeof activeSubs; total: number }> = {}
    for (const sub of activeSubs) {
      if (!byProvider[sub.provider]) byProvider[sub.provider] = { subs: [], total: 0 }
      byProvider[sub.provider].subs.push(sub)
      byProvider[sub.provider].total += sub.costPerMonth
    }

    const monthlyTotal = activeSubs.reduce((sum, s) => sum + s.costPerMonth, 0)
    const yearlyTotal = monthlyTotal * 12

    // API savings calc
    const apiCost = data.overview.totalCostUSD
    const firstSession = new Date(privateData?.overview.firstSession ?? data.dateRange.start)
    const monthsActive = Math.max(1, (now.getTime() - firstSession.getTime()) / (30.44 * 24 * 60 * 60 * 1000))
    const claudeSub = activeSubs.find((s) => s.id === 'claude-max')
    const subCostOverPeriod = claudeSub ? claudeSub.costPerMonth * monthsActive : 0
    const apiSavings = apiCost - subCostOverPeriod

    // Project cost allocation
    const projectCosts: Record<string, number> = {}
    for (const sub of activeSubs) {
      if (sub.projects?.length) {
        for (const proj of sub.projects) {
          if (proj === 'all') continue
          const share = sub.costPerMonth / sub.projects.filter((p) => p !== 'all').length
          projectCosts[proj] = (projectCosts[proj] || 0) + share
        }
      }
    }

    return {
      byCategory,
      byProvider,
      monthlyTotal,
      yearlyTotal,
      apiCost,
      subCostOverPeriod,
      apiSavings,
      monthsActive,
      projectCosts,
    }
  }, [spendData, data, privateData])

  if (!breakdown) return null

  const sortedCategories = Object.entries(breakdown.byCategory).sort((a, b) => b[1].total - a[1].total)
  const sortedProviders = Object.entries(breakdown.byProvider).sort((a, b) => b[1].total - a[1].total)
  const sortedProjects = Object.entries(breakdown.projectCosts).sort((a, b) => b[1] - a[1])

  return (
    <GlassPanel className="mb-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: category breakdown */}
        <div>
          <h2 className="text-xs text-text-muted uppercase tracking-[0.15em] mb-4">By Category</h2>
          <div className="space-y-2.5">
            {sortedCategories.map(([cat, { subs, total }]) => {
              const color = CATEGORY_COLORS[cat] || COLORS.textSecondary
              const pct = breakdown.monthlyTotal > 0 ? (total / breakdown.monthlyTotal) * 100 : 0
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-xs text-text-secondary">
                        {CATEGORY_LABELS[cat as SubscriptionCategory] || cat}
                      </span>
                      <span className="text-[10px] text-text-muted">{subs.length}</span>
                    </div>
                    <span className="text-xs font-semibold" style={{ color }}>
                      {formatCost(total)}
                      <span className="text-text-muted text-[10px] font-normal">/mo</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-panel overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Totals */}
          <div className="mt-4 pt-3 border-t border-white/5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">Monthly</span>
              <span className="text-sm font-display font-bold text-gold">{formatCost(breakdown.monthlyTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">Yearly (projected)</span>
              <span className="text-sm font-display font-semibold text-text-secondary">
                {formatCost(breakdown.yearlyTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* Center: top providers */}
        <div>
          <h2 className="text-xs text-text-muted uppercase tracking-[0.15em] mb-4">Top Providers</h2>
          <div className="space-y-2">
            {sortedProviders.slice(0, 8).map(([provider, { total }]) => {
              const color = providerColor(provider)
              const pct = breakdown.monthlyTotal > 0 ? (total / breakdown.monthlyTotal) * 100 : 0
              return (
                <div key={provider} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-xs text-text-secondary flex-1 truncate">{provider}</span>
                  <div className="w-16 h-1.5 rounded-full bg-panel overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }}
                    />
                  </div>
                  <span className="text-xs font-semibold w-12 text-right" style={{ color }}>
                    {formatCost(total)}
                  </span>
                </div>
              )
            })}
            {sortedProviders.length > 8 && (
              <p className="text-[10px] text-text-muted">+ {sortedProviders.length - 8} more</p>
            )}
          </div>

          {/* Project cost allocation */}
          {sortedProjects.length > 0 && (
            <div className="mt-4 pt-3 border-t border-white/5">
              <h3 className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Linked to Projects</h3>
              <div className="space-y-1">
                {sortedProjects.map(([proj, cost]) => (
                  <div key={proj} className="flex items-center justify-between text-[10px]">
                    <span className="text-text-secondary">{proj}</span>
                    <span className="text-text-muted">{formatCost(cost)}/mo</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: API savings callout */}
        <div>
          <h2 className="text-xs text-text-muted uppercase tracking-[0.15em] mb-4">Claude Max Value</h2>
          <div className="space-y-4">
            <div>
              <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">API Cost (if pay-per-use)</p>
              <p className="text-xl font-display font-semibold text-text-primary">{formatCost(breakdown.apiCost)}</p>
              <p className="text-[10px] text-text-muted">over {breakdown.monthsActive.toFixed(1)} months</p>
            </div>
            <div>
              <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">Subscription Cost</p>
              <p className="text-xl font-display font-semibold" style={{ color: COLORS.gold }}>
                {formatCost(breakdown.subCostOverPeriod)}
              </p>
              <p className="text-[10px] text-text-muted">$100/mo × {breakdown.monthsActive.toFixed(1)} months</p>
            </div>
            <div className="border-t border-white/5 pt-3">
              <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">
                {breakdown.apiSavings > 0 ? 'You Saved' : 'Premium Over API'}
              </p>
              <p
                className="text-2xl font-display font-bold"
                style={{ color: breakdown.apiSavings > 0 ? COLORS.green : COLORS.pink }}
              >
                {formatCost(Math.abs(breakdown.apiSavings))}
              </p>
              {breakdown.apiSavings > 0 && (
                <p className="text-[10px] text-text-muted mt-1">
                  {((breakdown.apiSavings / breakdown.apiCost) * 100).toFixed(0)}% savings vs. API pricing
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </GlassPanel>
  )
}
