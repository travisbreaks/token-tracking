import { useEffect, useState } from 'react'
import { Toggle } from '@/components/ui/Toggle'
import { type DashboardView, type TimeRange, useDashboard } from '@/context/DashboardContext'
import { usePageVisible } from '@/hooks/usePageVisible'
import { COLORS } from '@/lib/constants'
import { formatDate } from '@/lib/formatters'

const TITLE_MAP: Record<string, string> = {
  usage: 'USAGE',
  spend: 'SPEND',
  hours: 'HOURS',
}

function AlternatingTitle({ text }: { text: string }) {
  return (
    <>
      {text.split('').map((char, i) => (
        <span key={i} style={{ color: i % 2 === 0 ? COLORS.textPrimary : COLORS.gold }}>
          {char}
        </span>
      ))}
    </>
  )
}

const timeOptions: { label: string; value: TimeRange }[] = [
  { label: 'Today', value: 'day' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'Last Month', value: 'lastMonth' },
  { label: 'All Time', value: 'all' },
]

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function TypewriterLoop({
  text,
  typeSpeed = 90,
  deleteSpeed = 40,
  pauseTyped = 2500,
  pauseDeleted = 800,
}: {
  text: string
  typeSpeed?: number
  deleteSpeed?: number
  pauseTyped?: number
  pauseDeleted?: number
}) {
  const [displayed, setDisplayed] = useState('')
  const [showCursor, setShowCursor] = useState(true)

  useEffect(() => {
    let cancelled = false
    let timeout: ReturnType<typeof setTimeout>

    const sleep = (ms: number) =>
      new Promise<void>((r) => {
        timeout = setTimeout(r, ms)
      })

    async function loop() {
      while (!cancelled) {
        // Type forward
        for (let i = 1; i <= text.length && !cancelled; i++) {
          setDisplayed(text.slice(0, i))
          await sleep(typeSpeed)
        }
        if (cancelled) break
        await sleep(pauseTyped)

        // Delete backward
        for (let i = text.length - 1; i >= 0 && !cancelled; i--) {
          setDisplayed(text.slice(0, i))
          await sleep(deleteSpeed)
        }
        if (cancelled) break
        await sleep(pauseDeleted)
      }
    }

    loop()
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [text, typeSpeed, deleteSpeed, pauseTyped, pauseDeleted])

  useEffect(() => {
    const blink = setInterval(() => setShowCursor((c) => !c), 530)
    return () => clearInterval(blink)
  }, [])

  return (
    <span
      className="text-[10px] tracking-wider font-mono"
      style={{ color: 'rgba(51, 204, 85, 0.45)', minWidth: '7.5em' }}
    >
      {displayed}
      <span style={{ opacity: showCursor ? 1 : 0, color: 'rgba(51, 204, 85, 0.65)' }}>|</span>
    </span>
  )
}

export function Header() {
  const { data, view, setView, timeRange, setTimeRange, spendData, onRefresh, refreshing, isPublic } = useDashboard()
  const visible = usePageVisible()

  const viewOptions: { label: string; value: DashboardView }[] = [
    { label: 'USAGE', value: 'usage' },
    { label: 'HOURS', value: 'hours' },
    ...(spendData ? [{ label: 'SPEND', value: 'spend' as DashboardView }] : []),
  ]

  // Tick counter to force re-render for live "X ago" updates
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!visible) return
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [visible])

  // Auto-refresh data every 60s in dev mode
  useEffect(() => {
    if (!onRefresh || !visible) return
    const id = setInterval(onRefresh, 60_000)
    return () => clearInterval(id)
  }, [onRefresh, visible])

  // Also refresh on tab focus
  useEffect(() => {
    if (!onRefresh) return
    const onFocus = () => onRefresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [onRefresh])

  const ago = timeAgo(data.generatedAt)

  return (
    <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
      <div>
        <h1
          className="font-display text-2xl tracking-[0.15em] uppercase text-text-primary"
          style={{ textShadow: '0 0 20px rgba(51, 204, 85, 0.12)' }}
        >
          <AlternatingTitle text={isPublic ? 'TOKENS' : (TITLE_MAP[view] ?? 'USAGE')} />
        </h1>
        <p className="text-text-muted text-xs mt-1 flex items-center gap-2">
          <span>
            {formatDate(data.dateRange.start)} to {formatDate(data.dateRange.end)}
          </span>
          {isPublic ? (
            // The public file is stamped with a date only, so say when, not how long ago.
            <span className="text-text-muted/50">updated {formatDate(data.generatedAt)}</span>
          ) : onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="text-text-muted/50 hover:text-cyan transition-colors disabled:animate-pulse"
              title="Refresh data"
            >
              {refreshing ? 'refreshing...' : `snapshot ${ago}`}
            </button>
          ) : (
            <span className="text-text-muted/50">snapshot {ago}</span>
          )}
        </p>
        {isPublic && (
          <p className="text-text-muted text-[11px] mt-2 max-w-xl leading-relaxed">
            Claude Code and OpenAI Codex usage, read from the logs both tools keep locally and priced at API list rates.
            These are API-equivalent figures, not what the subscriptions cost. Projects roll up into categories; the
            detail stays local. Updated by hand.{' '}
            <a className="underline hover:text-cyan" href="https://github.com/travisbreaks/token-tracking">
              Source and setup on GitHub
            </a>
            {' / '}
            <a className="underline hover:text-cyan" href="https://travismakes.org/">
              Travis Makes
            </a>
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <a href="./?widget" className="no-underline">
            <TypewriterLoop text="click for widget" />
          </a>
          <a
            href="./?widget"
            title="Fuel widget"
            className="block rounded-full overflow-hidden border hover:border-cyan/60 transition-all hover:shadow-[0_0_12px_rgba(5,217,232,0.2)]"
            style={{ width: 44, height: 44, borderColor: 'rgba(51, 204, 85, 0.2)' }}
          >
            <img src="./lobster.png" alt="Fuel widget" className="w-full h-full object-cover" />
          </a>
        </div>
        {!isPublic && <Toggle options={viewOptions} value={view} onChange={setView} />}
        <div className="flex flex-wrap gap-1">
          {timeOptions.map((opt) => (
            <button
              type="button"
              key={opt.value}
              onClick={() => setTimeRange(opt.value)}
              className="text-[10px] uppercase tracking-[0.08em] font-display px-2.5 py-1 rounded transition-all"
              style={{
                color: timeRange === opt.value ? COLORS.void : COLORS.textMuted,
                backgroundColor: timeRange === opt.value ? COLORS.cyan : 'transparent',
                border: `1px solid ${timeRange === opt.value ? COLORS.cyan : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
