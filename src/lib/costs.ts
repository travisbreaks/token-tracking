interface ModelPricing {
  input: number
  output: number
  cacheCreation: number
  cacheRead: number
}

// Prices per 1M tokens. Source of truth for both the dashboard and scripts/collect.ts
// (which imports calculateCost from here).
// Verified 2026-09-28 against https://platform.claude.com/docs/en/about-claude/pricing
// cacheCreation is the 5-minute cache write rate (1.25x base input). 1-hour cache writes
// cost 2x base input; transcripts report them separately (usage.cache_creation
// .ephemeral_1h_input_tokens), and calculateCost prices that share at the 1-hour rate.
// Transcripts without the breakdown are priced as 5-minute writes, a lower bound.
export const PRICING: Record<string, ModelPricing> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheCreation: 12.5, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50, cacheCreation: 12.5, cacheRead: 1.0 },
  'claude-opus-5-5': { input: 4, output: 20, cacheCreation: 5, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheCreation: 6.25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheCreation: 6.25, cacheRead: 0.5 },
  'claude-opus-4-7': { input: 5, output: 25, cacheCreation: 6.25, cacheRead: 0.5 },
  'claude-opus-4-6': { input: 5, output: 25, cacheCreation: 6.25, cacheRead: 0.5 },
  'claude-opus-4-5-20251101': { input: 5, output: 25, cacheCreation: 6.25, cacheRead: 0.5 },
  'claude-sonnet-5': { input: 2, output: 10, cacheCreation: 2.5, cacheRead: 0.2 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5, cacheCreation: 1.25, cacheRead: 0.1 },
}

// Fallback matching for dated or aliased IDs (e.g. 'claude-opus-4-6-20260101').
// Ordered most-specific first so 'fable-5-1' never resolves as 'fable-5'.
const FAMILY_KEYS: [family: string, pricingId: keyof typeof PRICING][] = [
  ['fable-5-1', 'claude-fable-5-1'],
  ['fable-5', 'claude-fable-5'],
  ['opus-5-5', 'claude-opus-5-5'],
  ['opus-5', 'claude-opus-5'],
  ['opus-4-8', 'claude-opus-4-8'],
  ['opus-4-7', 'claude-opus-4-7'],
  ['opus-4-6', 'claude-opus-4-6'],
  ['opus-4-5', 'claude-opus-4-5-20251101'],
  ['sonnet-5', 'claude-sonnet-5'],
  ['sonnet-4-6', 'claude-sonnet-4-6'],
  ['sonnet-4-5', 'claude-sonnet-4-5-20250929'],
  ['haiku-4-5', 'claude-haiku-4-5-20251001'],
]

export function getPricing(model: string): ModelPricing | null {
  if (PRICING[model]) return PRICING[model]
  for (const [family, pricingId] of FAMILY_KEYS) {
    if (model.includes(family)) return PRICING[pricingId]
  }
  return null
}

/** 1-hour cache writes cost 2x base input for every model on the pricing page. */
export const ONE_HOUR_CACHE_WRITE_MULTIPLIER = 2

export function calculateCost(
  model: string,
  input: number,
  output: number,
  cacheCreation: number,
  cacheRead: number,
  /** The part of cacheCreation written to the 1-hour cache, when the transcript reports it. */
  cacheCreation1h = 0,
): number {
  const pricing = getPricing(model)

  if (!pricing) return 0

  const oneHour = Math.min(cacheCreation1h, cacheCreation)
  return (
    (input * pricing.input +
      output * pricing.output +
      (cacheCreation - oneHour) * pricing.cacheCreation +
      oneHour * pricing.input * ONE_HOUR_CACHE_WRITE_MULTIPLIER +
      cacheRead * pricing.cacheRead) /
    1_000_000
  )
}
