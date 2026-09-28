import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// tracking.local.json is gitignored. It is the only place that knows where projects live,
// what they are called, and which category each one belongs to.
// See tracking.example.json for the shape.
export const LOCAL_CONFIG_PATH = path.join(import.meta.dirname, '..', 'tracking.local.json')

export const UNCATEGORIZED = 'Uncategorized'

interface RawConfig {
  projectRoots?: string[]
  aliases?: Record<string, string>
  ignoreSegments?: string[]
  categories?: Record<string, string>
  publicCategoryMerge?: Record<string, string>
  denylistExtra?: string[]
}

export interface LocalConfig {
  projectRoots: string[]
  aliases: Record<string, string>
  ignoreSegments: Set<string>
  categories: Record<string, string>
  publicCategoryMerge: Record<string, string>
  denylistExtra: string[]
}

const expandHome = (p: string) => (p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p)
const withSlash = (p: string) => (p.endsWith('/') ? p : `${p}/`)

export function loadLocalConfig(): LocalConfig {
  let raw: RawConfig = {}
  if (fs.existsSync(LOCAL_CONFIG_PATH)) {
    raw = JSON.parse(fs.readFileSync(LOCAL_CONFIG_PATH, 'utf-8'))
  } else {
    console.warn('No tracking.local.json found: every session is attributed to "general".')
  }
  return {
    projectRoots: (raw.projectRoots ?? []).map((r) => withSlash(expandHome(r))).sort((a, b) => b.length - a.length),
    aliases: raw.aliases ?? {},
    ignoreSegments: new Set(raw.ignoreSegments ?? []),
    categories: raw.categories ?? {},
    publicCategoryMerge: raw.publicCategoryMerge ?? {},
    denylistExtra: raw.denylistExtra ?? [],
  }
}
