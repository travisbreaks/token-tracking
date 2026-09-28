import { useCallback, useEffect, useState } from 'react'

export interface UsageWindow {
  utilization: number
  resets_at: string | null
}

export interface LiveUsage {
  ok: boolean
  five_hour: UsageWindow
  seven_day: UsageWindow
  seven_day_sonnet?: UsageWindow | null
  error?: string
}

/**
 * Polls /api/usage (Vite dev middleware → Claude OAuth API) every 60s.
 * Returns null when disabled (public site) or when the API isn't available.
 */
export function useLiveUsage(enabled = true) {
  const [usage, setUsage] = useState<LiveUsage | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchUsage = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return
    }
    try {
      const res = await fetch('/api/usage')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const ct = res.headers.get('content-type')
      if (!ct?.includes('json')) throw new Error('Not JSON')
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'API error')
      setUsage(data)
      setLastRefresh(new Date())
    } catch {
      // API not available (deployed site or token issue): stay null
      setUsage(null)
    } finally {
      setLoading(false)
    }
  }, [enabled])

  // Initial fetch
  useEffect(() => {
    fetchUsage()
  }, [fetchUsage])

  // Poll every 60s
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(fetchUsage, 60_000)
    return () => clearInterval(id)
  }, [fetchUsage, enabled])

  return { usage, loading, lastRefresh, refresh: fetchUsage }
}
