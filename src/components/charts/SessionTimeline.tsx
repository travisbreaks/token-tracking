import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { useDashboard } from '@/context/DashboardContext'
import { COLORS, MODEL_COLORS } from '@/lib/constants'
import { formatCost, formatDateTime, formatDuration, formatTokens, getModelDisplayName } from '@/lib/formatters'

export function SessionTimeline() {
  const { filteredSessions } = useDashboard()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...filteredSessions].sort((a, b) => b.startTime.localeCompare(a.startTime)).slice(0, 30),
    [filteredSessions],
  )

  return (
    <GlassPanel className="col-span-full">
      <h2 className="text-xs text-text-muted uppercase tracking-[0.15em] mb-4">
        Sessions <span className="text-text-muted/50">({filteredSessions.length} total, showing latest 30)</span>
      </h2>
      <div
        className="space-y-2 max-h-[480px] overflow-y-auto pr-1"
        style={{ scrollbarWidth: 'thin', scrollbarColor: `${COLORS.textMuted}30 transparent` }}
      >
        {sorted.map((s) => {
          const isExpanded = expandedId === s.id
          const primaryModel = s.models[0] ? getModelDisplayName(s.models[0]) : 'unknown'

          return (
            <div key={s.id}>
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : s.id)}
                className="w-full text-left p-3 rounded-lg bg-panel/50 hover:bg-panel/80 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-text-secondary whitespace-nowrap">{formatDateTime(s.startTime)}</span>
                    <Badge label={s.project} color={COLORS.cyan} />
                    <Badge label={primaryModel} color={MODEL_COLORS[primaryModel] || COLORS.textMuted} />
                  </div>
                  <div className="flex items-center gap-4 text-xs shrink-0">
                    <span className="text-text-muted">{formatDuration(s.durationMs)}</span>
                    <span className="text-text-secondary">{formatTokens(s.tokens.output)} out</span>
                    <span className="text-gold font-semibold">{formatCost(s.costUSD)}</span>
                  </div>
                </div>
              </button>
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 py-3 bg-panel/30 rounded-b-lg text-xs space-y-2">
                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <p className="text-text-muted text-[10px]">INPUT</p>
                          <p className="text-text-secondary">{formatTokens(s.tokens.input)}</p>
                        </div>
                        <div>
                          <p className="text-text-muted text-[10px]">OUTPUT</p>
                          <p className="text-text-secondary">{formatTokens(s.tokens.output)}</p>
                        </div>
                        <div>
                          <p className="text-text-muted text-[10px]">CACHE READ</p>
                          <p className="text-text-secondary">{formatTokens(s.tokens.cacheRead)}</p>
                        </div>
                        <div>
                          <p className="text-text-muted text-[10px]">CACHE CREATE</p>
                          <p className="text-text-secondary">{formatTokens(s.tokens.cacheCreation)}</p>
                        </div>
                      </div>
                      {Object.keys(s.toolsUsed).length > 0 && (
                        <div>
                          <p className="text-text-muted text-[10px] mb-1">TOOLS</p>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(s.toolsUsed)
                              .sort((a, b) => b[1] - a[1])
                              .map(([tool, count]) => (
                                <span
                                  key={tool}
                                  className="text-[10px] text-text-muted bg-surface px-1.5 py-0.5 rounded"
                                >
                                  {tool} <span className="text-text-muted/50">x{count}</span>
                                </span>
                              ))}
                          </div>
                        </div>
                      )}
                      <p className="text-text-muted/50 text-[9px]">{s.id}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </GlassPanel>
  )
}
