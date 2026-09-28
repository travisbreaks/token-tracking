import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { type LiveUsage, useLiveUsage } from '@/hooks/useLiveUsage'
import { getModelDisplayName } from '@/lib/formatters'
import type { SpendData } from '@/types/subscriptions'
import type { DailyAggregate, PublicUsageData, SessionDetail, UsageData } from '@/types/usage'

export type TimeRange = 'day' | 'week' | 'month' | 'lastMonth' | 'all'
export type ChartMetric = 'tokens' | 'sessions' | 'cost'
export type DashboardView = 'usage' | 'spend' | 'hours'

interface DashboardState {
  data: UsageData | PublicUsageData
  /** Full local data; null on the public site, where only daily aggregates exist. */
  privateData: UsageData | null
  isPublic: boolean
  spendData: SpendData | null
  liveUsage: LiveUsage | null
  liveLoading: boolean
  view: DashboardView
  setView: (v: DashboardView) => void
  timeRange: TimeRange
  setTimeRange: (r: TimeRange) => void
  chartMetric: ChartMetric
  setChartMetric: (m: ChartMetric) => void
  selectedProjects: string[]
  setSelectedProjects: (p: string[]) => void
  selectedModels: string[]
  setSelectedModels: (m: string[]) => void
  filteredDaily: DailyAggregate[]
  filteredSessions: SessionDetail[]
  projectList: string[]
  modelList: string[]
  onRefresh?: () => void
  refreshing: boolean
}

const Ctx = createContext<DashboardState | null>(null)

export function useDashboard() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider')
  return ctx
}

export function DashboardProvider({
  data,
  privateData,
  spendData = null,
  children,
  onRefresh,
  refreshing = false,
}: {
  data: UsageData | PublicUsageData
  privateData: UsageData | null
  spendData?: SpendData | null
  children: ReactNode
  onRefresh?: () => void
  refreshing?: boolean
}) {
  const isPublic = privateData === null
  const { usage: liveUsage, loading: liveLoading } = useLiveUsage(!isPublic)
  const [view, setView] = useState<DashboardView>('usage')
  const [timeRange, setTimeRange] = useState<TimeRange>('month')
  const [chartMetric, setChartMetric] = useState<ChartMetric>('cost')
  const [selectedProjects, setSelectedProjects] = useState<string[]>([])
  const [selectedModels, setSelectedModels] = useState<string[]>([])

  const projectList = useMemo(() => (privateData ? Object.keys(privateData.byProject).sort() : []), [privateData])
  const modelList = useMemo(() => Object.keys(data.byModel).map(getModelDisplayName).sort(), [data])

  // Local date helper: matches the collector's bucketing (local time, not UTC)
  const localDate = useCallback(
    (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    [],
  )

  const dateFilter = useMemo(() => {
    const now = new Date()
    if (timeRange === 'day') {
      return { from: localDate(now), to: localDate(now) }
    }
    if (timeRange === 'week') {
      return { from: localDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)), to: '' }
    }
    if (timeRange === 'month') {
      return { from: localDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: '' }
    }
    if (timeRange === 'lastMonth') {
      return {
        from: localDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: localDate(new Date(now.getFullYear(), now.getMonth(), 0)),
      }
    }
    return { from: '', to: '' }
  }, [timeRange, localDate])

  const filteredDaily = useMemo(() => {
    let days = data.daily
    if (dateFilter.from) {
      if (timeRange === 'day') {
        days = days.filter((d) => d.date === dateFilter.from)
      } else if (dateFilter.to) {
        days = days.filter((d) => d.date >= dateFilter.from && d.date <= dateFilter.to)
      } else {
        days = days.filter((d) => d.date >= dateFilter.from)
      }
    }
    return days
  }, [data.daily, dateFilter, timeRange])

  const filteredSessions = useMemo(() => {
    if (!privateData) return []
    let sessions = privateData.sessions
    if (dateFilter.from) {
      // Convert session UTC startTime to local date for comparison (matches daily bucketing)
      if (dateFilter.to) {
        sessions = sessions.filter((s) => {
          const d = localDate(new Date(s.startTime))
          return d >= dateFilter.from && d <= dateFilter.to
        })
      } else {
        sessions = sessions.filter((s) => localDate(new Date(s.startTime)) >= dateFilter.from)
      }
    }
    if (selectedProjects.length > 0) {
      sessions = sessions.filter((s) => selectedProjects.includes(s.project))
    }
    if (selectedModels.length > 0) {
      sessions = sessions.filter((s) => s.models.some((m) => selectedModels.includes(getModelDisplayName(m))))
    }
    return sessions
  }, [privateData, dateFilter, selectedProjects, selectedModels, localDate])

  const value = useMemo(
    () => ({
      data,
      privateData,
      isPublic,
      spendData,
      liveUsage,
      liveLoading,
      view,
      setView,
      timeRange,
      setTimeRange,
      chartMetric,
      setChartMetric,
      selectedProjects,
      setSelectedProjects,
      selectedModels,
      setSelectedModels,
      filteredDaily,
      filteredSessions,
      projectList,
      modelList,
      onRefresh,
      refreshing,
    }),
    [
      data,
      privateData,
      isPublic,
      spendData,
      liveUsage,
      liveLoading,
      view,
      timeRange,
      chartMetric,
      selectedProjects,
      selectedModels,
      filteredDaily,
      filteredSessions,
      projectList,
      modelList,
      onRefresh,
      refreshing,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
