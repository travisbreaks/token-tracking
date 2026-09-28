// OpenAI API list prices per 1M tokens, standard tier, short context. Source of truth for the
// OpenAI section of the dashboard and scripts/collect.ts.
// Verified 2026-09-28 against https://developers.openai.com/api/docs/pricing and
// https://developers.openai.com/api/docs/models/gpt-6-astra
// Long context: prompts over 272K input tokens are billed at 2x input and cache rates and
// 1.5x output. Codex sessions log a 258,400-token context window, below that threshold, so
// Codex requests are priced at the short-context rates here.
// Models with no published price stay unpriced: counted, but adding no cost.

export interface OpenAIModelPricing {
  input: number
  cachedInput: number
  cacheWrite: number
  output: number
}

export interface OpenAITokenUsage {
  input: number
  cachedInput: number
  cacheWrite: number
  output: number
}

export const OPENAI_PRICING: Record<string, OpenAIModelPricing> = {
  'gpt-6-astra': { input: 10, cachedInput: 1, cacheWrite: 12.5, output: 50 },
  'gpt-6-sol': { input: 2, cachedInput: 0.2, cacheWrite: 2.5, output: 10 },
  'gpt-6-luna': { input: 0.1, cachedInput: 0.01, cacheWrite: 0.125, output: 0.5 },
  'gpt-5.6-sol': { input: 4, cachedInput: 0.4, cacheWrite: 5, output: 20 },
  'gpt-5.6-terra': { input: 2, cachedInput: 0.2, cacheWrite: 2.5, output: 12 },
  'gpt-5.6-luna': { input: 0.2, cachedInput: 0.02, cacheWrite: 0.25, output: 1.2 },
}

// Fallback matching for dated or suffixed IDs, most specific first.
const FAMILY_KEYS: [family: string, pricingId: keyof typeof OPENAI_PRICING][] = [
  ['gpt-6-astra', 'gpt-6-astra'],
  ['gpt-6-sol', 'gpt-6-sol'],
  ['gpt-6-luna', 'gpt-6-luna'],
  ['gpt-5.6-sol', 'gpt-5.6-sol'],
  ['gpt-5.6-terra', 'gpt-5.6-terra'],
  ['gpt-5.6-luna', 'gpt-5.6-luna'],
]

export function getOpenAIPricing(model: string): OpenAIModelPricing | null {
  if (OPENAI_PRICING[model]) return OPENAI_PRICING[model]
  for (const [family, pricingId] of FAMILY_KEYS) {
    if (model.includes(family)) return OPENAI_PRICING[pricingId]
  }
  return null
}

/**
 * API-equivalent cost of one response, or null when the model has no published price.
 * Cached input and cache writes are counted inside input_tokens, and reasoning tokens
 * inside output_tokens: OpenAI's usage convention, assumed for the Codex log format.
 */
export function calculateOpenAICost(model: string, usage: OpenAITokenUsage): number | null {
  const pricing = getOpenAIPricing(model)
  if (!pricing) return null
  const uncached = Math.max(0, usage.input - usage.cachedInput - usage.cacheWrite)
  return (
    (uncached * pricing.input +
      usage.cachedInput * pricing.cachedInput +
      usage.cacheWrite * pricing.cacheWrite +
      usage.output * pricing.output) /
    1_000_000
  )
}
