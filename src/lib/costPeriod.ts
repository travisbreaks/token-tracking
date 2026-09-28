import type { TimeRange } from '@/context/DashboardContext'
import type { Subscription } from '@/types/subscriptions'
import type { DailyAggregate } from '@/types/usage'

const DAY_MS = 24 * 60 * 60 * 1000
export const AVG_DAYS_PER_MONTH = 30.44

export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface CostComparison {
  /** Whole days in the range, inclusive. */
  days: number
  /** Selected usage priced at pay-as-you-go API list rates. Not money spent. */
  apiCost: number
  /** Pro-rated Claude subscription cost across the range. Money actually spent. */
  subCost: number
  ratio: number
  savings: number
  dailyRate: number
  monthlyProjected: number
  annualProjected: number
  monthlyRatio: number
  annualRatio: number
  monthlySub: number
  annualSub: number
  planLabel: string
}

/** Local-midnight [start, end] bounds for a dashboard time range. */
export function rangeBounds(timeRange: TimeRange, now: Date, firstSession: string): { start: Date; end: Date } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (timeRange === 'day') return { start: today, end: today }
  if (timeRange === 'week') {
    return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6), end: today }
  }
  if (timeRange === 'month') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: today }
  }
  if (timeRange === 'lastMonth') {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth(), 0),
    }
  }
  // all time: from the first recorded session
  const first = new Date(firstSession)
  return { start: new Date(first.getFullYear(), first.getMonth(), first.getDate()), end: today }
}

export function computeCostComparison(
  daily: DailyAggregate[],
  subscriptions: Subscription[],
  timeRange: TimeRange,
  now: Date,
  firstSession: string,
): CostComparison | null {
  // The comparison basket is the Claude subscription, whichever plan was active on
  // each day: Pro, then Max ($100), then Max ($200).
  const claudeSubs = subscriptions.filter((s) => s.provider === 'Anthropic')
  if (claudeSubs.length === 0) return null

  const { start: startDate, end: endDate } = rangeBounds(timeRange, now, firstSession)
  const start = localDateStr(startDate)
  const end = localDateStr(endDate)
  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1)

  const apiCost = daily.filter((d) => d.date >= start && d.date <= end).reduce((sum, d) => sum + d.costUSD, 0)

  // Walk each day and pro-rate whichever plan was active that day at
  // $costPerMonth / 30.44, so plan changes inside the range are exact.
  let subCost = 0
  const planNames = new Set<string>()
  for (let i = 0; i < days; i++) {
    const dayStr = localDateStr(new Date(startDate.getTime() + i * DAY_MS))
    for (const sub of claudeSubs) {
      if (dayStr < sub.startDate) continue
      if (sub.endDate && dayStr > sub.endDate) continue
      subCost += sub.costPerMonth / AVG_DAYS_PER_MONTH
      planNames.add(sub.name)
    }
  }

  // Run rate divides by time actually elapsed, not billed days: a range ending today is
  // only part-way through its final day, and treating it as whole understates the rate.
  const elapsedDays = Math.max(1 / 24, Math.min(days, (now.getTime() - startDate.getTime()) / DAY_MS))
  const dailyRate = apiCost / elapsedDays

  // Forecasts look forward, so they compare against the plan in force today.
  const todayStr = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
  const currentSub = claudeSubs.find((s) => todayStr >= s.startDate && (!s.endDate || todayStr <= s.endDate))
  const monthlySub = currentSub?.costPerMonth ?? 0
  const monthlyProjected = dailyRate * AVG_DAYS_PER_MONTH
  const annualProjected = dailyRate * 365.25

  return {
    days,
    apiCost,
    subCost,
    ratio: subCost > 0 ? apiCost / subCost : 0,
    savings: apiCost - subCost,
    dailyRate,
    monthlyProjected,
    annualProjected,
    monthlyRatio: monthlySub > 0 ? monthlyProjected / monthlySub : 0,
    annualRatio: monthlySub > 0 ? annualProjected / (monthlySub * 12) : 0,
    monthlySub,
    annualSub: monthlySub * 12,
    planLabel: planNames.size === 1 ? [...planNames][0] : `${planNames.size} Claude plans`,
  }
}
