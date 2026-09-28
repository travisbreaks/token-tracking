// Chart colors mapped to design tokens
export const COLORS = {
  gold: '#cca43b',
  pink: '#ff2a6d',
  cyan: '#05d9e8',
  void: '#080808',
  panel: '#111111',
  surface: '#1a1a1a',
  textPrimary: '#f0f0f0',
  textSecondary: '#94a3b8',
  textMuted: '#7d8597',
  green: '#22c55e',
} as const

// Model colors for charts
export const MODEL_COLORS: Record<string, string> = {
  'Opus 4.6': COLORS.pink,
  'Opus 4.5': COLORS.gold,
  'Sonnet 4.6': '#06b6d4',
  'Sonnet 4.5': COLORS.cyan,
  'Haiku 4.5': '#8b5cf6',
}

// Provider colors for spend charts: derived from the name, so this public file does not
// list which services are subscribed to. A subscription entry can set its own color.
const PROVIDER_PALETTE = [COLORS.pink, '#10a37f', '#4285f4', '#8b5cf6', '#f97316', '#eab308', '#00c7b7', '#ec4899']
export function providerColor(provider: string): string {
  let h = 0
  for (let i = 0; i < provider.length; i++) h = (h * 31 + provider.charCodeAt(i)) >>> 0
  return PROVIDER_PALETTE[h % PROVIDER_PALETTE.length]
}

// Category colors
export const CATEGORY_COLORS: Record<string, string> = {
  'ai-tools': COLORS.cyan,
  infrastructure: '#ff9900',
  hosting: '#00c7b7',
  domains: '#8b5cf6',
  'developer-tools': '#f97316',
  media: '#ec4899',
  other: COLORS.textSecondary,
}

// Project colors (rotate through palette)
export const PROJECT_PALETTE = [
  COLORS.cyan,
  COLORS.pink,
  COLORS.gold,
  '#8b5cf6', // purple
  '#22c55e', // green
  '#f97316', // orange
  '#ec4899', // rose
  '#06b6d4', // teal
  '#a855f7', // violet
  '#eab308', // yellow
]
