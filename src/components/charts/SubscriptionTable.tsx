import { useMemo, useState } from 'react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { useDashboard } from '@/context/DashboardContext'
import { CATEGORY_COLORS, COLORS, providerColor } from '@/lib/constants'
import { formatCost } from '@/lib/formatters'
import type { BillingType, OneTimeCost, Subscription, SubscriptionCategory } from '@/types/subscriptions'

const isDev = import.meta.env.DEV

const CATEGORY_LABELS: Record<SubscriptionCategory, string> = {
  'ai-tools': 'AI Tools',
  infrastructure: 'Infrastructure',
  hosting: 'Hosting',
  domains: 'Domains',
  'developer-tools': 'Dev Tools',
  media: 'Music / Audio',
  other: 'Entertainment',
}

interface AddFormState {
  name: string
  provider: string
  costPerMonth: string
  billingCycleDay: string
  startDate: string
  category: SubscriptionCategory
  billingType: BillingType
  isOneTime: boolean
  amount: string
  date: string
  costNote: string
}

const emptyForm: AddFormState = {
  name: '',
  provider: '',
  costPerMonth: '',
  billingCycleDay: '1',
  startDate: new Date().toISOString().slice(0, 10),
  category: 'other',
  billingType: 'fixed',
  isOneTime: false,
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  costNote: '',
}

export function SubscriptionTable() {
  const { spendData } = useDashboard()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<AddFormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

  const now = new Date()
  const activeSubs = spendData?.subscriptions.filter((s) => !s.endDate || new Date(s.endDate) > now) ?? []
  const endedSubs = spendData?.subscriptions.filter((s) => s.endDate && new Date(s.endDate) <= now) ?? []

  // Group active subs by category
  const byCategory = useMemo(() => {
    const groups: Record<string, Subscription[]> = {}
    for (const sub of activeSubs) {
      const cat = sub.category || 'other'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(sub)
    }
    // Sort groups by total cost descending
    return Object.entries(groups)
      .map(([cat, subs]) => ({
        category: cat as SubscriptionCategory,
        subs,
        total: subs.reduce((sum, s) => sum + s.costPerMonth, 0),
        paidCount: subs.filter((s) => !s.freeTier).length,
      }))
      .sort((a, b) => b.total - a.total)
  }, [activeSubs])

  const monthlyTotal = activeSubs.reduce((sum, s) => sum + s.costPerMonth, 0)

  if (!spendData) return null

  async function handleSave() {
    if (!isDev || !spendData) return
    setSaving(true)
    try {
      const id = `${form.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`

      if (form.isOneTime) {
        const newCost: OneTimeCost = {
          id,
          name: form.name,
          provider: form.provider,
          amount: parseFloat(form.amount) || 0,
          date: form.date,
          category: form.category,
        }
        const updated = {
          ...spendData,
          oneTimeCosts: [...spendData.oneTimeCosts, newCost],
        }
        await fetch('/api/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        })
      } else {
        const newSub: Subscription = {
          id,
          name: form.name,
          provider: form.provider,
          costPerMonth: parseFloat(form.costPerMonth) || 0,
          billingCycleDay: parseInt(form.billingCycleDay, 10) || 1,
          startDate: form.startDate,
          endDate: null,
          category: form.category,
          billingType: form.billingType,
          costNote: form.costNote || undefined,
        }
        const updated = {
          ...spendData,
          subscriptions: [...spendData.subscriptions, newSub],
        }
        await fetch('/api/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        })
      }

      setForm(emptyForm)
      setShowAdd(false)
      window.location.reload()
    } catch (e) {
      console.error('Failed to save:', e)
    } finally {
      setSaving(false)
    }
  }

  async function handleEnd(subId: string) {
    if (!isDev || !spendData) return
    const updated = {
      ...spendData,
      subscriptions: spendData.subscriptions.map((s) =>
        s.id === subId ? { ...s, endDate: new Date().toISOString().slice(0, 10) } : s,
      ),
    }
    await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
    window.location.reload()
  }

  return (
    <GlassPanel className="mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xs text-text-muted uppercase tracking-[0.15em]">Subscriptions</h2>
          <span className="text-[10px] text-text-muted">
            {activeSubs.length} active, <span className="text-gold font-semibold">{formatCost(monthlyTotal)}</span>/mo
          </span>
        </div>
        {isDev && (
          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            className="text-xs text-cyan hover:text-cyan/80 transition-colors"
          >
            {showAdd ? 'CANCEL' : '+ ADD'}
          </button>
        )}
      </div>

      {/* Add form (dev only) */}
      {showAdd && isDev && (
        <div className="mb-4 p-3 rounded-lg bg-panel/60 space-y-3">
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, isOneTime: false }))}
              className={`text-xs px-2 py-1 rounded ${!form.isOneTime ? 'bg-gold/20 text-gold' : 'text-text-muted'}`}
            >
              Subscription
            </button>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, isOneTime: true }))}
              className={`text-xs px-2 py-1 rounded ${form.isOneTime ? 'bg-gold/20 text-gold' : 'text-text-muted'}`}
            >
              One-Time
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="bg-void/50 border border-white/10 rounded px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-cyan/40 outline-none"
            />
            <input
              placeholder="Provider"
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
              className="bg-void/50 border border-white/10 rounded px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-cyan/40 outline-none"
            />
            {form.isOneTime ? (
              <>
                <input
                  placeholder="Amount ($)"
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="bg-void/50 border border-white/10 rounded px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-cyan/40 outline-none"
                />
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="bg-void/50 border border-white/10 rounded px-2 py-1.5 text-xs text-text-primary focus:border-cyan/40 outline-none"
                />
              </>
            ) : (
              <>
                <input
                  placeholder="$/month"
                  type="number"
                  value={form.costPerMonth}
                  onChange={(e) => setForm((f) => ({ ...f, costPerMonth: e.target.value }))}
                  className="bg-void/50 border border-white/10 rounded px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-cyan/40 outline-none"
                />
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="bg-void/50 border border-white/10 rounded px-2 py-1.5 text-xs text-text-primary focus:border-cyan/40 outline-none"
                />
              </>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as SubscriptionCategory }))}
              className="bg-void/50 border border-white/10 rounded px-2 py-1.5 text-xs text-text-primary focus:border-cyan/40 outline-none"
            >
              {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
            {!form.isOneTime && (
              <select
                value={form.billingType}
                onChange={(e) => setForm((f) => ({ ...f, billingType: e.target.value as BillingType }))}
                className="bg-void/50 border border-white/10 rounded px-2 py-1.5 text-xs text-text-primary focus:border-cyan/40 outline-none"
              >
                <option value="fixed">Fixed</option>
                <option value="usage-based">Usage-Based</option>
                <option value="metered">Metered</option>
              </select>
            )}
            <input
              placeholder="Note (optional)"
              value={form.costNote}
              onChange={(e) => setForm((f) => ({ ...f, costNote: e.target.value }))}
              className="flex-1 bg-void/50 border border-white/10 rounded px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-cyan/40 outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !form.name || !form.provider}
            className="text-xs px-3 py-1.5 rounded bg-cyan/20 text-cyan hover:bg-cyan/30 disabled:opacity-40 transition-colors"
          >
            {saving ? 'SAVING...' : 'SAVE'}
          </button>
        </div>
      )}

      {/* Category groups */}
      <div className="space-y-1">
        {byCategory.map(({ category, subs, total, paidCount }) => {
          const catColor = CATEGORY_COLORS[category] || COLORS.textSecondary
          const isExpanded = expandedCategory === category
          const pct = monthlyTotal > 0 ? (total / monthlyTotal) * 100 : 0

          return (
            <div key={category}>
              {/* Category header row */}
              <button
                type="button"
                onClick={() => setExpandedCategory(isExpanded ? null : category)}
                className="w-full flex items-center gap-2 py-2 px-1 hover:bg-white/[0.02] rounded transition-colors"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
                <span className="text-xs text-text-secondary flex-1 text-left">
                  {CATEGORY_LABELS[category] || category}
                </span>
                <span className="text-[10px] text-text-muted">
                  {paidCount} paid{subs.length > paidCount ? ` + ${subs.length - paidCount} free` : ''}
                </span>
                <div className="w-20 h-1.5 rounded-full bg-panel overflow-hidden mx-2">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: catColor, opacity: 0.7 }}
                  />
                </div>
                <span className="text-xs font-semibold w-16 text-right" style={{ color: catColor }}>
                  {formatCost(total)}
                </span>
                <span className="text-text-muted text-[10px]">/mo</span>
                <span className="text-text-muted text-[10px] ml-1">{isExpanded ? '\u25B2' : '\u25BC'}</span>
              </button>

              {/* Expanded subscription rows */}
              {isExpanded && (
                <div className="ml-4 mb-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-text-muted text-[10px] uppercase tracking-wider">
                        <th className="text-left pb-1 font-normal">Service</th>
                        <th className="text-left pb-1 font-normal">Provider</th>
                        <th className="text-right pb-1 font-normal">Cost/Mo</th>
                        <th className="text-left pb-1 font-normal pl-3">Type</th>
                        <th className="text-left pb-1 font-normal pl-3">Projects</th>
                        <th className="text-left pb-1 font-normal pl-3">Note</th>
                        {isDev && <th className="pb-1" />}
                      </tr>
                    </thead>
                    <tbody>
                      {subs.map((sub) => {
                        const color = sub.color || providerColor(sub.provider)
                        return (
                          <tr key={sub.id} className="border-t border-white/5">
                            <td className="py-1.5">
                              {sub.url ? (
                                <a
                                  href={sub.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-text-primary hover:text-cyan transition-colors"
                                >
                                  {sub.name}
                                </a>
                              ) : (
                                <span className="text-text-primary">{sub.name}</span>
                              )}
                            </td>
                            <td className="py-1.5">
                              <span className="inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                                <span className="text-text-secondary">{sub.provider}</span>
                              </span>
                            </td>
                            <td
                              className="py-1.5 text-right font-semibold"
                              style={{ color: sub.freeTier ? COLORS.textMuted : color }}
                            >
                              {sub.freeTier ? 'FREE' : formatCost(sub.costPerMonth)}
                            </td>
                            <td className="py-1.5 pl-3">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                                  sub.billingType === 'usage-based'
                                    ? 'bg-amber-500/15 text-amber-400'
                                    : sub.billingType === 'metered'
                                      ? 'bg-purple-500/15 text-purple-400'
                                      : 'bg-green-500/15 text-green-400'
                                }`}
                              >
                                {sub.billingType || 'fixed'}
                              </span>
                            </td>
                            <td className="py-1.5 pl-3">
                              {sub.projects?.length ? (
                                <span className="text-[10px] text-text-muted">{sub.projects.join(', ')}</span>
                              ) : (
                                <span className="text-[10px] text-text-muted/40">-</span>
                              )}
                            </td>
                            <td className="py-1.5 pl-3">
                              {sub.costNote ? (
                                <span className="text-[10px] text-text-muted italic">{sub.costNote}</span>
                              ) : (
                                <span className="text-[10px] text-text-muted/40">-</span>
                              )}
                            </td>
                            {isDev && (
                              <td className="py-1.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleEnd(sub.id)}
                                  className="text-text-muted hover:text-pink transition-colors text-[10px]"
                                >
                                  END
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Ended subscriptions */}
      {endedSubs.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/5">
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Ended</p>
          <div className="space-y-1">
            {endedSubs.map((sub) => (
              <div key={sub.id} className="flex items-center justify-between text-text-muted text-[10px]">
                <span>
                  {sub.name} ({sub.provider})
                </span>
                <span>
                  {formatCost(sub.costPerMonth)}/mo, ended {sub.endDate}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* One-time costs */}
      {spendData.oneTimeCosts.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/5">
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2">One-Time Costs</p>
          <div className="space-y-1">
            {spendData.oneTimeCosts.map((cost) => (
              <div key={cost.id} className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">
                  {cost.name} <span className="text-text-muted">({cost.provider})</span>
                </span>
                <span className="text-gold font-semibold">
                  {formatCost(cost.amount)} <span className="text-text-muted font-normal">{cost.date}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassPanel>
  )
}
