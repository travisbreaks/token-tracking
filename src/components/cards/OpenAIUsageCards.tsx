import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { useDashboard } from '@/context/DashboardContext'
import { COLORS } from '@/lib/constants'
import { localDateStr, rangeBounds } from '@/lib/costPeriod'
import { formatCost, formatTokens } from '@/lib/formatters'

export function OpenAIUsageCards() {
  const { data, timeRange } = useDashboard()
  const openai = data.openai

  const row = useMemo(() => {
    if (!openai) return null
    const { start, end } = rangeBounds(timeRange, new Date(), openai.firstDate)
    const from = localDateStr(start)
    const to = localDateStr(end)
    const days = openai.daily.filter((d) => d.date >= from && d.date <= to)
    const sum = (pick: (d: (typeof days)[number]) => number) => days.reduce((s, d) => s + pick(d), 0)
    const input = sum((d) => d.tokens.input)
    const cached = sum((d) => d.tokens.cachedInput)
    return {
      cost: sum((d) => d.costUSD),
      responses: sum((d) => d.responses),
      unpriced: sum((d) => d.unpricedResponses),
      output: sum((d) => d.tokens.output),
      reasoning: sum((d) => d.tokens.reasoning),
      cacheHit: input > 0 ? cached / input : 0,
      activeDays: days.filter((d) => d.responses > 0).length,
    }
  }, [openai, timeRange])

  if (!openai || !row) return null

  // Plan limits are account state: present locally, never in the public file.
  const showLimit = 'planLimit' in openai
  const limit = showLimit ? openai.planLimit : null
  const limitColor =
    limit?.usedPercent == null
      ? COLORS.textMuted
      : limit.usedPercent >= 90
        ? COLORS.pink
        : limit.usedPercent >= 60
          ? COLORS.gold
          : COLORS.green
  const models = Object.entries(openai.byModel).sort((a, b) => b[1].responses - a[1].responses)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.4 }}
      className="mb-6"
    >
      <GlassPanel>
        <p className="text-text-muted text-[10px] uppercase tracking-[0.15em] mb-5">OpenAI Compute (Codex)</p>

        <AnimatePresence mode="wait">
          <motion.div
            key={timeRange}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            <div className={`grid grid-cols-2 gap-4 mb-5 ${showLimit ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
              <div>
                <p className="text-text-muted text-[10px] uppercase tracking-[0.15em] mb-1">API-equivalent</p>
                <p className="text-2xl font-display font-semibold" style={{ color: COLORS.gold }}>
                  {formatCost(row.cost)}
                </p>
                <p className="text-text-muted text-xs mt-0.5">
                  {row.activeDays}d active{row.unpriced > 0 ? `, ${row.unpriced} unpriced` : ''}
                </p>
              </div>

              <div>
                <p className="text-text-muted text-[10px] uppercase tracking-[0.15em] mb-1">Responses</p>
                <p className="text-2xl font-display font-semibold" style={{ color: COLORS.cyan }}>
                  {row.responses.toLocaleString()}
                </p>
                <p className="text-text-muted text-xs mt-0.5">
                  {formatTokens(row.output)} out, {formatTokens(row.reasoning)} reasoning
                </p>
              </div>

              <div>
                <p className="text-text-muted text-[10px] uppercase tracking-[0.15em] mb-1">Cache Hit</p>
                <p className="text-2xl font-display font-semibold" style={{ color: COLORS.green }}>
                  {(row.cacheHit * 100).toFixed(1)}%
                </p>
                <p className="text-text-muted text-xs mt-0.5">of input tokens</p>
              </div>

              {showLimit && (
                <div>
                  <p className="text-text-muted text-[10px] uppercase tracking-[0.15em] mb-1">Plan Limit</p>
                  <p className="text-2xl font-display font-semibold" style={{ color: limitColor }}>
                    {limit?.usedPercent == null ? 'n/a' : `${limit.usedPercent}%`}
                  </p>
                  <p className="text-text-muted text-xs mt-0.5">
                    {limit
                      ? `${limit.planType ?? 'plan'}, ${limit.windowMinutes === 10080 ? 'weekly' : `${limit.windowMinutes}m`} window${
                          limit.resetsAt ? `, resets ${new Date(limit.resetsAt).toLocaleDateString()}` : ''
                        }`
                      : 'not reported'}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3">
          {models.map(([model, m]) => (
            <p key={model} className="text-xs text-text-secondary">
              {model} <span className="text-text-muted">{m.responses.toLocaleString()}</span>{' '}
              <span style={{ color: m.priced ? COLORS.gold : COLORS.textMuted }}>
                {m.priced ? formatCost(m.costUSD) : 'unpriced'}
              </span>
            </p>
          ))}
        </div>

        <p className="text-text-muted text-[10px] border-t border-white/5 pt-3">
          API-equivalent = the same usage priced at OpenAI pay-as-you-go list rates, not what a plan costs. Unpriced
          models have no published price and add nothing.
          {showLimit &&
            ` Plan limit is the latest reading in the logs (${limit ? new Date(limit.capturedAt).toLocaleString() : 'none'}), not live.`}{' '}
          All-time model totals above.
        </p>
      </GlassPanel>
    </motion.div>
  )
}
