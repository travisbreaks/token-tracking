export function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function formatCost(usd: number): string {
  if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}K`
  if (usd >= 100) return `$${usd.toFixed(0)}`
  if (usd >= 1) return `$${usd.toFixed(2)}`
  return `$${usd.toFixed(4)}`
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}

export function formatDate(iso: string): string {
  // Date-only strings ("2026-02-21") parse as UTC midnight, which rolls back to
  // the previous day in time zones west of UTC. Parse as local noon instead to get the correct date.
  const d =
    iso.length === 10
      ? (() => {
          const [y, m, day] = iso.split('-').map(Number)
          return new Date(y, m - 1, day)
        })()
      : new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function getModelDisplayName(model: string): string {
  // Ordered most-specific first: 'fable-5-1' must be checked before 'fable-5'.
  if (model.includes('fable-5-1')) return 'Fable 5.1'
  if (model.includes('fable-5')) return 'Fable 5'
  if (model.includes('opus-5-5')) return 'Opus 5.5'
  if (model.includes('opus-5')) return 'Opus 5'
  if (model.includes('opus-4-8')) return 'Opus 4.8'
  if (model.includes('opus-4-7')) return 'Opus 4.7'
  if (model.includes('opus-4-6')) return 'Opus 4.6'
  if (model.includes('opus-4-5')) return 'Opus 4.5'
  if (model.includes('sonnet-5')) return 'Sonnet 5'
  if (model.includes('sonnet-4-6')) return 'Sonnet 4.6'
  if (model.includes('sonnet-4-5')) return 'Sonnet 4.5'
  if (model.includes('haiku-4-5')) return 'Haiku 4.5'
  return model
}
