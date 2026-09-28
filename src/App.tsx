import { useCallback, useEffect, useState } from 'react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { Widget } from '@/components/Widget'
import { DashboardProvider } from '@/context/DashboardContext'
import type { SpendData } from '@/types/subscriptions'
import type { PublicUsageData, UsageData } from '@/types/usage'

// Public mode reads only the published, sanitized file. Local mode reads the full private
// data through the dev server's /api/private endpoints, which do not exist in a build.
const isPublic = import.meta.env.VITE_PUBLIC_MODE === 'true'
const isWidget = new URLSearchParams(window.location.search).has('widget')

type Loaded = { data: UsageData | PublicUsageData; privateData: UsageData | null }

async function fetchData(): Promise<Loaded> {
  if (isPublic) {
    const res = await fetch('./data/usage.json')
    if (!res.ok) throw new Error('No published data yet')
    const data = (await res.json()) as PublicUsageData
    return { data, privateData: null }
  }
  const res = await fetch(`/api/private/usage?t=${Date.now()}`)
  if (!res.ok) throw new Error('Run `npm run collect` first to generate usage data')
  const data = (await res.json()) as UsageData
  return { data, privateData: data }
}

async function fetchSpendData(): Promise<SpendData | null> {
  if (isPublic) return null
  try {
    const res = await fetch('/api/private/subscriptions')
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export default function App() {
  // Widget mode: self-contained, no dashboard data needed
  if (isWidget) {
    return <Widget />
  }

  return <Dashboard />
}

function Dashboard() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [spendData, setSpendData] = useState<SpendData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchData()
      .then(setLoaded)
      .catch((e) => setError(e.message))
    fetchSpendData().then(setSpendData)
  }, [])

  const refreshData = useCallback(async () => {
    if (isPublic) return
    setRefreshing(true)
    try {
      const res = await fetch('/api/refresh', { method: 'POST' })
      const result = await res.json()
      if (!result.ok) throw new Error(result.error)
      setLoaded(await fetchData())
    } catch (e) {
      console.error('Refresh failed:', e)
    } finally {
      setRefreshing(false)
    }
  }, [])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-panel p-8 max-w-md text-center">
          <h1 className="text-gold font-display text-xl mb-4">NO DATA</h1>
          <p className="text-text-secondary text-sm">{error}</p>
          {!isPublic && <code className="block mt-4 text-cyan text-xs">npm run collect</code>}
        </div>
      </div>
    )
  }

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-text-muted animate-pulse font-display">LOADING...</div>
      </div>
    )
  }

  return (
    <DashboardProvider
      data={loaded.data}
      privateData={loaded.privateData}
      spendData={spendData}
      onRefresh={isPublic ? undefined : refreshData}
      refreshing={refreshing}
    >
      <DashboardShell />
    </DashboardProvider>
  )
}
