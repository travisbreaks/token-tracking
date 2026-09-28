import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Toggle } from '@/components/ui/Toggle'
import { useDashboard } from '@/context/DashboardContext'
import { CATEGORY_COLORS, COLORS } from '@/lib/constants'
import { formatCost } from '@/lib/formatters'

type SpendMode = 'monthly' | 'cumulative'

const modeOptions: { label: string; value: SpendMode }[] = [
  { label: 'MONTHLY', value: 'monthly' },
  { label: 'CUMULATIVE', value: 'cumulative' },
]

const CATEGORY_LABELS: Record<string, string> = {
  'ai-tools': 'AI Tools',
  infrastructure: 'Infrastructure',
  hosting: 'Hosting',
  domains: 'Domains',
  'developer-tools': 'Dev Tools',
  media: 'Music / Audio',
  other: 'Entertainment',
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((sum, p) => sum + p.value, 0)
  return (
    <div className="glass-panel px-3 py-2 text-xs">
      <p className="text-text-muted mb-1.5">{label}</p>
      {payload
        .filter((p) => p.value > 0)
        .map((p) => (
          <p key={p.name} style={{ color: p.color }} className="flex justify-between gap-3">
            <span>{CATEGORY_LABELS[p.name] || p.name}</span>
            <span className="font-semibold">{formatCost(p.value)}</span>
          </p>
        ))}
      <p className="text-text-secondary mt-1 pt-1 border-t border-white/5 flex justify-between gap-3">
        <span>Total</span>
        <span className="font-semibold">{formatCost(total)}</span>
      </p>
    </div>
  )
}

export function SpendOverTime() {
  const { spendData } = useDashboard()
  const [mode, setMode] = useState<SpendMode>('monthly')

  const { chartData, categories } = useMemo(() => {
    if (!spendData || spendData.subscriptions.length === 0) {
      return { chartData: [], categories: [] }
    }

    // Find date range
    const starts = spendData.subscriptions.map((s) => s.startDate)
    const earliest = starts.sort()[0]
    const now = new Date()

    // Build month-by-month data grouped by category
    const months: Record<string, Record<string, number>> = {}
    const allCategories = new Set<string>()

    const startDate = new Date(`${earliest.slice(0, 7)}-01`)
    const cursor = new Date(startDate)

    while (cursor <= now) {
      const monthKey = cursor.toISOString().slice(0, 7)
      months[monthKey] = {}

      for (const sub of spendData.subscriptions) {
        const subStart = sub.startDate.slice(0, 7)
        const subEnd = sub.endDate ? sub.endDate.slice(0, 7) : '9999-12'
        if (monthKey >= subStart && monthKey <= subEnd) {
          const cat = sub.category || 'other'
          allCategories.add(cat)
          months[monthKey][cat] = (months[monthKey][cat] || 0) + sub.costPerMonth
        }
      }

      for (const cost of spendData.oneTimeCosts) {
        if (cost.date.startsWith(monthKey)) {
          const cat = cost.category || 'other'
          allCategories.add(cat)
          months[monthKey][cat] = (months[monthKey][cat] || 0) + cost.amount
        }
      }

      cursor.setMonth(cursor.getMonth() + 1)
    }

    // Sort categories by total spend (descending) for stacking order
    const categoryTotals = Array.from(allCategories).map((cat) => ({
      cat,
      total: Object.values(months).reduce((sum, m) => sum + (m[cat] || 0), 0),
    }))
    categoryTotals.sort((a, b) => b.total - a.total)
    const categoryList = categoryTotals.map((c) => c.cat)

    let data = Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, cats]) => {
        const entry: Record<string, string | number> = {
          month: new Date(`${month}-01`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        }
        for (const c of categoryList) {
          entry[c] = cats[c] || 0
        }
        return entry
      })

    if (mode === 'cumulative') {
      const cumulative: Record<string, number> = {}
      data = data.map((entry) => {
        const newEntry: Record<string, string | number> = { month: entry.month }
        for (const c of categoryList) {
          cumulative[c] = (cumulative[c] || 0) + (entry[c] as number)
          newEntry[c] = cumulative[c]
        }
        return newEntry
      })
    }

    return { chartData: data, categories: categoryList }
  }, [spendData, mode])

  if (!spendData || chartData.length === 0) return null

  return (
    <GlassPanel className="mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs text-text-muted uppercase tracking-[0.15em]">Spend Over Time</h2>
        <Toggle options={modeOptions} value={mode} onChange={setMode} />
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData}>
          <defs>
            {categories.map((c) => (
              <linearGradient key={c} id={`spend-grad-${c}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CATEGORY_COLORS[c] || COLORS.textSecondary} stopOpacity={0.3} />
                <stop offset="100%" stopColor={CATEGORY_COLORS[c] || COLORS.textSecondary} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="rgba(148,163,184,0.05)" />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: COLORS.textMuted }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 10, fill: COLORS.textMuted }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatCost}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} />
          {categories.map((c) => (
            <Area
              key={c}
              type="monotone"
              dataKey={c}
              stackId="spend"
              stroke={CATEGORY_COLORS[c] || COLORS.textSecondary}
              strokeWidth={1.5}
              fill={`url(#spend-grad-${c})`}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </GlassPanel>
  )
}
