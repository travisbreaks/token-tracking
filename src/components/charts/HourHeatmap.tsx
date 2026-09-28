import { useMemo } from 'react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { useDashboard } from '@/context/DashboardContext'
import { COLORS } from '@/lib/constants'

export function HourHeatmap() {
  const { filteredSessions } = useDashboard()

  const hours = useMemo(() => {
    // Compute hour distribution from filtered sessions so it responds to time range
    const dist: Record<number, number> = {}
    for (const s of filteredSessions) {
      const hour = new Date(s.startTime).getHours()
      dist[hour] = (dist[hour] || 0) + 1
    }
    const max = Math.max(1, ...Object.values(dist))
    return Array.from({ length: 24 }, (_, i) => {
      const count = dist[i] || 0
      return { hour: i, count, intensity: count / max }
    })
  }, [filteredSessions])

  return (
    <GlassPanel className="flex flex-col h-full">
      <h2 className="text-xs text-text-muted uppercase tracking-[0.15em] mb-4">Activity by Hour</h2>
      <div className="flex gap-1 flex-1 min-h-0">
        {hours.map((h) => (
          <div key={h.hour} className="flex-1 h-full flex flex-col justify-end">
            <div
              className="w-full rounded-sm transition-all duration-300"
              style={{
                height: `${Math.max(2, h.intensity * 100)}%`,
                backgroundColor: h.intensity > 0.7 ? COLORS.cyan : h.intensity > 0.3 ? COLORS.gold : COLORS.textMuted,
                opacity: Math.max(0.15, h.intensity),
              }}
              title={`${h.hour}:00, ${h.count} sessions`}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[9px] text-text-muted">
        <span>12a</span>
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>12a</span>
      </div>
    </GlassPanel>
  )
}
