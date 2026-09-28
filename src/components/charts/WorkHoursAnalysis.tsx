import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { useDashboard } from '@/context/DashboardContext'
import { COLORS } from '@/lib/constants'
import type { UsageData } from '@/types/usage'

// ---------- Stat Card ----------

interface StatCardProps {
  label: string
  value: string
  sub?: string
  color: string
  index: number
}

function StatCard({ label, value, sub, color, index }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.4 }}
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

// ---------- Helpers ----------

function fmtDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function barColor(hours: number) {
  if (hours >= 6) return COLORS.cyan
  if (hours >= 3) return COLORS.gold
  return COLORS.textMuted
}

// ---------- Hours by Day chart ----------

function HoursByDayChart({ data }: { data: { date: string; hours: number; periods: number }[] }) {
  const avg = data.length > 0 ? data.reduce((s, d) => s + d.hours, 0) / data.length : 0

  return (
    <GlassPanel>
      <p className="text-text-muted text-[10px] uppercase tracking-[0.15em] mb-4">Hours by Day</p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            tick={{ fill: COLORS.textMuted, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: COLORS.textMuted, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}h`}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(10,12,18,0.92)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6,
              fontSize: 12,
            }}
            labelFormatter={(label) => fmtDate(label as string)}
            formatter={(value: any, _name: any, props: any) => [
              `${(Number(value) || 0).toFixed(1)}h · ${props.payload?.periods ?? 0} period${props.payload?.periods === 1 ? '' : 's'}`,
              'Active',
            ]}
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          />
          <ReferenceLine
            y={avg}
            stroke={COLORS.pink}
            strokeDasharray="4 3"
            strokeOpacity={0.5}
            label={{ value: `avg ${avg.toFixed(1)}h`, fill: COLORS.pink, fontSize: 9, position: 'insideTopRight' }}
          />
          <Bar dataKey="hours" radius={[3, 3, 0, 0]} maxBarSize={32}>
            {data.map((entry, i) => (
              <Cell key={i} fill={barColor(entry.hours)} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </GlassPanel>
  )
}

// ---------- Cumulative Hours chart ----------

function CumulativeHoursChart({ data }: { data: { date: string; cumulative: number }[] }) {
  return (
    <GlassPanel className="h-full">
      <p className="text-text-muted text-[10px] uppercase tracking-[0.15em] mb-4">Cumulative Hours</p>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.gold} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS.gold} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            tick={{ fill: COLORS.textMuted, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: COLORS.textMuted, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}h`}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(10,12,18,0.92)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6,
              fontSize: 12,
            }}
            labelFormatter={(label) => fmtDate(label as string)}
            formatter={(value: any) => [`${(Number(value) || 0).toFixed(1)}h total`, 'Cumulative']}
            cursor={{ stroke: 'rgba(255,255,255,0.08)' }}
          />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke={COLORS.gold}
            strokeWidth={2}
            fill="url(#cumGrad)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </GlassPanel>
  )
}

// ---------- Period Distribution chart ----------

function PeriodDistributionChart({ data }: { data: { bucket: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1)

  return (
    <GlassPanel className="h-full">
      <p className="text-text-muted text-[10px] uppercase tracking-[0.15em] mb-4">Work Period Length</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
          <XAxis type="number" tick={{ fill: COLORS.textMuted, fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="bucket"
            tick={{ fill: COLORS.textMuted, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(10,12,18,0.92)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(value: any) => {
              const v = Number(value) || 0
              return [`${v} period${v === 1 ? '' : 's'}`, '']
            }}
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          />
          <Bar dataKey="count" radius={[0, 3, 3, 0]} maxBarSize={20}>
            {data.map((entry, i) => (
              <Cell key={i} fill={COLORS.cyan} fillOpacity={0.4 + 0.6 * (entry.count / max)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </GlassPanel>
  )
}

// ---------- Gap toggle ----------

const GAP_OPTIONS = [
  { label: '30m', value: '30', desc: 'active exchanges' },
  { label: '60m', value: '60', desc: 'full sessions' },
] as const

type GapKey = '30' | '60'

// ---------- Main component ----------

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Working-hours data is local only (never published), so this panel renders only locally.
export function WorkHoursAnalysis() {
  const { privateData } = useDashboard()
  return privateData ? <WorkHoursAnalysisLocal data={privateData} /> : null
}

function WorkHoursAnalysisLocal({ data }: { data: UsageData }) {
  const { timeRange } = useDashboard()
  const [gap, setGap] = useState<GapKey>('30')

  const { byDay: allWorkByDay, distribution: workPeriodDistribution } = data.workByThreshold?.[gap] ?? {
    byDay: data.workByDay,
    distribution: data.workPeriodDistribution,
  }

  // Apply time range filter to workByDay (same logic as DashboardContext date filter)
  const workByDay = useMemo(() => {
    const now = new Date()
    if (timeRange === 'day') {
      const today = localDateStr(now)
      return Object.fromEntries(Object.entries(allWorkByDay).filter(([date]) => date === today))
    }
    if (timeRange === 'week') {
      const from = localDateStr(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
      return Object.fromEntries(Object.entries(allWorkByDay).filter(([date]) => date >= from))
    }
    if (timeRange === 'month') {
      const from = localDateStr(new Date(now.getFullYear(), now.getMonth(), 1))
      return Object.fromEntries(Object.entries(allWorkByDay).filter(([date]) => date >= from))
    }
    if (timeRange === 'lastMonth') {
      const from = localDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1))
      const to = localDateStr(new Date(now.getFullYear(), now.getMonth(), 0))
      return Object.fromEntries(Object.entries(allWorkByDay).filter(([date]) => date >= from && date <= to))
    }
    return allWorkByDay
  }, [allWorkByDay, timeRange])

  // Recompute stats from filtered workByDay
  const workStats = useMemo(() => {
    const entries = Object.entries(workByDay)
    const totalHours = entries.reduce((s, [, d]) => s + d.hours, 0)
    const activeDays = entries.length
    const avgHoursPerDay = activeDays > 0 ? totalHours / activeDays : 0
    let longestDay = { date: '', hours: 0 }
    for (const [date, d] of entries) {
      if (d.hours > longestDay.hours) longestDay = { date, hours: d.hours }
    }
    const sortedDays = entries.map(([d]) => d).sort()
    let longestStreak = 0
    let streak = 1
    for (let i = 1; i < sortedDays.length; i++) {
      const diff = Math.round((new Date(sortedDays[i]).getTime() - new Date(sortedDays[i - 1]).getTime()) / 86_400_000)
      if (diff === 1) {
        streak++
        longestStreak = Math.max(longestStreak, streak)
      } else streak = 1
    }
    longestStreak = Math.max(longestStreak, streak)
    const totalPeriods = entries.reduce((s, [, d]) => s + d.periods, 0)
    return {
      totalHours: Math.round(totalHours * 10) / 10,
      activeDays,
      avgHoursPerDay: Math.round(avgHoursPerDay * 10) / 10,
      longestDay: { date: longestDay.date, hours: Math.round(longestDay.hours * 10) / 10 },
      longestStreak,
      totalPeriods,
    }
  }, [workByDay])

  const byDayArray = useMemo(() => {
    return Object.entries(workByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, hours: d.hours, periods: d.periods }))
  }, [workByDay])

  const cumulativeData = useMemo(() => {
    let running = 0
    return byDayArray.map((d) => {
      running += d.hours
      return { date: d.date, cumulative: Math.round(running * 10) / 10 }
    })
  }, [byDayArray])

  const longestDayLabel = workStats.longestDay.date
    ? `${fmtDate(workStats.longestDay.date)} · ${workStats.longestDay.hours}h`
    : '-'

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
      {/* Gap threshold toggle */}
      <div className="flex items-center gap-3 mb-5">
        <span className="text-text-muted text-[10px] uppercase tracking-[0.15em]">Gap threshold</span>
        <div className="flex gap-1">
          {GAP_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.value}
              onClick={() => setGap(opt.value)}
              className="text-[10px] uppercase tracking-[0.08em] font-display px-2.5 py-1 rounded transition-all"
              style={{
                color: gap === opt.value ? COLORS.void : COLORS.textMuted,
                backgroundColor: gap === opt.value ? COLORS.cyan : 'transparent',
                border: `1px solid ${gap === opt.value ? COLORS.cyan : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-text-muted text-[10px]">{GAP_OPTIONS.find((o) => o.value === gap)?.desc}</span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <StatCard
          index={0}
          label="Total Hours"
          value={`${workStats.totalHours}h`}
          color={COLORS.gold}
          sub={`${workStats.totalPeriods} work periods`}
        />
        <StatCard index={1} label="Active Days" value={String(workStats.activeDays)} color={COLORS.gold} />
        <StatCard index={2} label="Avg / Active Day" value={`${workStats.avgHoursPerDay}h`} color={COLORS.cyan} />
        <StatCard index={3} label="Longest Day" value={longestDayLabel} color={COLORS.pink} />
        <StatCard
          index={4}
          label="Longest Streak"
          value={`${workStats.longestStreak} day${workStats.longestStreak === 1 ? '' : 's'}`}
          color={COLORS.cyan}
        />
      </div>

      {/* Hours by day: full width */}
      <motion.div
        className="mb-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <HoursByDayChart data={byDayArray} />
      </motion.div>

      {/* Cumulative + Distribution: 2/3 + 1/3 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <CumulativeHoursChart data={cumulativeData} />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
        >
          <PeriodDistributionChart data={workPeriodDistribution} />
        </motion.div>
      </div>
    </motion.div>
  )
}
