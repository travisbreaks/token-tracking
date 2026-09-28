// Pure scanning helpers for check-public.ts, kept separate so tests can exercise them.

export interface Finding {
  file: string
  line: number
  term: string
  kind: string
}

// Patterns that must never appear in anything publishable. These run in CI as well.
export const PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: 'session-uuid', re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi },
  { kind: 'agent-session-id', re: /\bagent-(?:compact-)?[0-9a-f]{6,}\b/gi },
  { kind: 'home-path', re: /\/Users\/[A-Za-z0-9._-]+|\/home\/[A-Za-z0-9._-]+\//g },
  { kind: 'volume-path', re: /\/Volumes\/[A-Za-z0-9._-]+|\/private\/var\/folders\/[A-Za-z0-9._-]+/g },
  { kind: 'mcp-tool-name', re: /\bmcp__[A-Za-z0-9_-]+/g },
  { kind: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
]

export function scanPatterns(file: string, text: string, allow: (f: Finding) => boolean): Finding[] {
  const out: Finding[] = []
  for (const { kind, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const f = { file, line: lineOf(text, m.index ?? 0), term: m[0], kind }
      if (!allow(f)) out.push(f)
    }
  }
  return out
}

/**
 * Split names into distinctive (searched everywhere, word-bounded, all separator variants)
 * and generic (dictionary words like "public" or "target", and junk fragments such as
 * brace lists). Generic names are matched as exact JSON strings and in prose files, where
 * a bounded dictionary word is still worth a look; code would false-positive constantly.
 */
export function tierNames(names: string[], dictionary: Set<string>) {
  const distinctive: string[] = []
  const generic: string[] = []
  for (const raw of names) {
    const n = raw.trim()
    if (!n) continue
    const junk = !/[a-z]/i.test(n) || /[^a-z0-9._ -]/i.test(n)
    if (junk || isDictionaryWord(n.toLowerCase(), dictionary)) generic.push(n)
    else distinctive.push(n)
  }
  return { distinctive, generic }
}

// The system word list has base forms only, so try common inflections too
// ("lanterns", "folded", "harbors" are generic words, not project names).
function isDictionaryWord(w: string, dictionary: Set<string>): boolean {
  if (dictionary.has(w)) return true
  const stems = [
    w.replace(/ies$/, 'y'),
    w.replace(/es$/, ''),
    w.replace(/s$/, ''),
    w.replace(/ed$/, ''),
    w.replace(/ed$/, 'e'),
    w.replace(/ing$/, ''),
    w.replace(/ing$/, 'e'),
  ]
  // Only long stems count: "<word>+ings" style invented names must not slip into generic.
  return stems.some((s) => s !== w && s.length >= 5 && dictionary.has(s))
}

/** A name and its separator variants: a-b, a_b, "a b" and ab (catches camelCase too). */
export function nameVariants(name: string): string[] {
  const parts = name
    .toLowerCase()
    .split(/[-_ ]+/)
    .filter(Boolean)
  if (parts.length < 2) return [name.toLowerCase()]
  const variants = new Set([name.toLowerCase(), parts.join('-'), parts.join('_'), parts.join(' ')])
  const joined = parts.join('')
  if (joined.length >= 6) variants.add(joined)
  return [...variants]
}

export function scanNames(file: string, text: string, names: string[], allow: (f: Finding) => boolean): Finding[] {
  const out: Finding[] = []
  const lower = text.toLowerCase()
  for (const name of names) {
    for (const needle of nameVariants(name)) out.push(...scanOne(file, text, lower, name, needle, allow))
  }
  return out
}

function scanOne(
  file: string,
  text: string,
  lower: string,
  name: string,
  needle: string,
  allow: (f: Finding) => boolean,
): Finding[] {
  const out: Finding[] = []
  let from = 0
  while (true) {
    const i = lower.indexOf(needle, from)
    if (i < 0) break
    from = i + needle.length
    // Word-ish boundary: not glued to letters or digits on either side.
    const before = lower[i - 1] ?? ''
    const after = lower[i + needle.length] ?? ''
    if (/[a-z0-9]/.test(before) || /[a-z0-9]/.test(after)) continue
    const f = { file, line: lineOf(text, i), term: name, kind: 'private-name' }
    if (!allow(f)) out.push(f)
  }
  return out
}

/**
 * Separator-blind pass: removes "-", "_" and spaces from the text and looks for each name
 * (8+ characters once compacted) without word boundaries. Catches a single-word name written
 * with separators inserted ("quartzclient" as "quartz_client") and camelCase forms. Line
 * numbers map back to the original text.
 */
export function scanCompacted(file: string, text: string, names: string[], allow: (f: Finding) => boolean): Finding[] {
  const compact: string[] = []
  const origin: number[] = []
  const lower = text.toLowerCase()
  for (let i = 0; i < lower.length; i++) {
    const c = lower[i]
    if (c === '-' || c === '_' || c === ' ') continue
    compact.push(c)
    origin.push(i)
  }
  const hay = compact.join('')
  const out: Finding[] = []
  for (const name of names) {
    const needle = name.toLowerCase().replace(/[-_ ]/g, '')
    if (needle.length < 8) continue
    let from = 0
    while (true) {
      const i = hay.indexOf(needle, from)
      if (i < 0) break
      from = i + needle.length
      const f = { file, line: lineOf(text, origin[i]), term: name, kind: 'private-name-compacted' }
      if (!allow(f)) out.push(f)
    }
  }
  return out
}

/** Every string (keys and values) inside a parsed JSON value. */
export function jsonStrings(v: unknown, into: string[] = []): string[] {
  if (typeof v === 'string') into.push(v)
  else if (Array.isArray(v)) for (const x of v) jsonStrings(x, into)
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      into.push(k)
      jsonStrings(x, into)
    }
  }
  return into
}

function lineOf(text: string, index: number) {
  let n = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++
  return n
}
