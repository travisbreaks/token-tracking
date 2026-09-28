import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Toggle } from '@/components/ui/Toggle'
import { type ChartMetric, useDashboard } from '@/context/DashboardContext'
import { COLORS } from '@/lib/constants'
import { formatCost, formatDate, formatTokens } from '@/lib/formatters'
import type { SpendData } from '@/types/subscriptions'

const metricOptions: { label: string; value: ChartMetric }[] = [
  { label: 'COST', value: 'cost' },
  { label: 'TOKENS', value: 'tokens' },
  { label: 'SESSIONS', value: 'sessions' },
]

const metricConfig: Record<ChartMetric, { key: string; color: string; formatter: (v: number) => string }> = {
  cost: { key: 'costUSD', color: COLORS.gold, formatter: formatCost },
  tokens: { key: 'totalTokens', color: COLORS.cyan, formatter: formatTokens },
  sessions: { key: 'sessions', color: COLORS.pink, formatter: (v: number) => String(v) },
}

interface Milestone {
  /** Formatted date string matching XAxis values (e.g. "Jan 15") */
  date: string
  rawDate: string
  label: string
  sublabel: string
  context: string
  color: string
}

function formatFullDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function getActivePlanName(rawDate: string, spendData: SpendData): string | null {
  const claudeSubs = spendData.subscriptions
    .filter((s) => s.provider === 'Anthropic' && !s.freeTier)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
  for (const sub of claudeSubs) {
    if (rawDate >= sub.startDate && (!sub.endDate || rawDate <= sub.endDate)) {
      return `${sub.name} ($${sub.costPerMonth}/mo)`
    }
  }
  return null
}

function buildMilestones(spendData: SpendData | null): Milestone[] {
  if (!spendData) return []
  const ms: Milestone[] = []

  // Anthropic plan starts (sorted chronologically)
  const claudeSubs = spendData.subscriptions
    .filter((s) => s.provider === 'Anthropic' && !s.freeTier)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  claudeSubs.forEach((sub, i) => {
    const prev = claudeSubs[i - 1]
    const context = prev ? `upgraded from ${prev.name} ($${prev.costPerMonth}/mo)` : 'first Claude subscription'
    ms.push({
      date: formatDate(sub.startDate),
      rawDate: sub.startDate,
      label: sub.name,
      sublabel: `$${sub.costPerMonth}/mo · ${formatFullDate(sub.startDate)}`,
      context,
      color: COLORS.pink,
    })
  })

  // One-time out-of-pocket costs: collapse same-date charges into one marker
  const costsByDate = new Map<string, { total: number; rawDate: string }>()
  for (const cost of spendData.oneTimeCosts) {
    const key = formatDate(cost.date)
    const existing = costsByDate.get(key)
    costsByDate.set(key, { total: (existing?.total ?? 0) + cost.amount, rawDate: cost.date })
  }
  for (const [date, { total, rawDate }] of costsByDate) {
    const activePlan = getActivePlanName(rawDate, spendData)
    const context = activePlan ? `billed separately from ${activePlan}` : 'no subscription active yet'
    ms.push({
      date,
      rawDate,
      label: formatCost(total),
      sublabel: `API charge · ${formatFullDate(rawDate)}`,
      context,
      color: COLORS.gold,
    })
  }

  return ms
}

interface HoveredMarker {
  x: number
  milestone: Milestone
}

function MarkerLabel({
  viewBox,
  milestone,
  onHover,
}: {
  viewBox?: { x: number; y: number; width: number; height: number }
  milestone: Milestone
  onHover: (state: HoveredMarker | null) => void
}) {
  if (!viewBox) return null
  const { x, y } = viewBox
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: SVG milestone hover tooltip
    <g onMouseEnter={() => onHover({ x, milestone })} onMouseLeave={() => onHover(null)} style={{ cursor: 'default' }}>
      {/* Small hit area at top of line */}
      <rect x={x - 7} y={y} width={14} height={14} fill="transparent" />
      {/* Dot marker */}
      <circle cx={x} cy={y + 6} r={3.5} fill={milestone.color} opacity={0.8} />
    </g>
  )
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  const { chartMetric } = useDashboard()
  if (!active || !payload?.length) return null
  const cfg = metricConfig[chartMetric]
  return (
    <div className="glass-panel px-3 py-2 text-xs">
      <p className="text-text-muted mb-1">{label}</p>
      <p style={{ color: cfg.color }}>{cfg.formatter(payload[0].value)}</p>
    </div>
  )
}

export function UsageOverTime() {
  const { filteredDaily, chartMetric, setChartMetric, spendData } = useDashboard()
  const [hoveredMarker, setHoveredMarker] = useState<HoveredMarker | null>(null)
  const cfg = metricConfig[chartMetric]

  const chartData = filteredDaily.map((d) => ({
    date: formatDate(d.date),
    costUSD: d.costUSD,
    totalTokens: d.tokens.total,
    // Sessions started that day: the same count as the Sessions card (agent runs excluded).
    sessions: d.sessionsStarted ?? d.sessions,
  }))

  // Only show milestones whose formatted date appears in the current chart range
  const chartDates = new Set(chartData.map((d) => d.date))
  const milestones = buildMilestones(spendData).filter((m) => chartDates.has(m.date))

  return (
    <GlassPanel className="col-span-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs text-text-muted uppercase tracking-[0.15em]">Usage Over Time</h2>
        <Toggle options={metricOptions} value={chartMetric} onChange={setChartMetric} />
      </div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={cfg.color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={cfg.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.05)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: COLORS.textMuted }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 10, fill: COLORS.textMuted }}
              axisLine={false}
              tickLine={false}
              tickFormatter={cfg.formatter}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey={cfg.key} stroke={cfg.color} strokeWidth={2} fill="url(#areaGrad)" />
            {milestones.map((m) => (
              <ReferenceLine
                key={`${m.date}-${m.label}`}
                x={m.date}
                stroke={m.color}
                strokeOpacity={0.4}
                strokeWidth={1}
                strokeDasharray="4 3"
                label={<MarkerLabel milestone={m} onHover={setHoveredMarker} />}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>

        {hoveredMarker && (
          <div
            className="absolute pointer-events-none glass-panel px-3 py-2 text-xs z-10 max-w-[240px]"
            style={{
              left: hoveredMarker.x + 12,
              top: 8,
              transform: hoveredMarker.x > 400 ? 'translateX(-100%) translateX(-24px)' : undefined,
            }}
          >
            <p className="font-semibold text-sm leading-tight" style={{ color: hoveredMarker.milestone.color }}>
              {hoveredMarker.milestone.label}
            </p>
            <p className="text-text-secondary mt-0.5 leading-snug">{hoveredMarker.milestone.sublabel}</p>
            <p className="text-text-muted mt-1 leading-snug border-t border-white/5 pt-1">
              {hoveredMarker.milestone.context}
            </p>
          </div>
        )}
      </div>
    </GlassPanel>
  )
}
