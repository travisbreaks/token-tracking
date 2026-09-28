import { execFileSync } from 'node:child_process'
// The private-name part of the leak gate, shared by check-public (local files) and
// check-live (the deployed site). Local only: it needs data/private and tracking.local.json.
import fs from 'node:fs'
import path from 'node:path'
import { type Finding, jsonStrings, scanCompacted, scanNames, tierNames } from './leak-scan'
import { LOCAL_CONFIG_PATH } from './local-config'
import { publicVocabulary } from './public-contract'

const ROOT = path.join(import.meta.dirname, '..')
const PRIVATE_FILE = path.join(ROOT, 'data', 'private', 'usage.json')

/**
 * Scan texts (keyed by repo-relative path; build output under "dist/", the published data
 * as "public/data/usage.json") for every private name. Returns null when the private
 * files are absent (CI).
 */
export function scanPrivateNames(
  texts: Map<string, string>,
  allow: (f: Finding) => boolean,
): { findings: Finding[]; summary: string } | null {
  if (!fs.existsSync(PRIVATE_FILE) || !fs.existsSync(LOCAL_CONFIG_PATH)) return null
  const priv = JSON.parse(fs.readFileSync(PRIVATE_FILE, 'utf-8'))
  const cfg = JSON.parse(fs.readFileSync(LOCAL_CONFIG_PATH, 'utf-8'))
  // This repo's own name, and its GitHub owner (from the origin remote), are public by
  // definition: they are in every link to the repo.
  const ownName = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).name
  let owner = ''
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf-8' }).trim()
    owner = url.match(/github\.com[:/]([^/]+)\//)?.[1] ?? ''
  } catch {
    // no remote yet
  }
  const names = [
    ...Object.keys(priv.byProject ?? {}),
    ...Object.keys(cfg.aliases ?? {}),
    ...Object.keys(cfg.categories ?? {}),
  ]
    .filter((n) => n !== ownName && n.toLowerCase() !== owner.toLowerCase())
    // publicNames: projects that are public on purpose (a published repo or page) and that the
    // public repo links to. Reviewed, local, and never a way to silence a private project.
    .filter((n) => !(cfg.publicNames ?? []).map((p: string) => p.toLowerCase()).includes(n.toLowerCase()))
  // Project roots, as written and expanded, are always substring-matched like extra terms.
  const home = process.env.HOME ?? ''
  const roots: string[] = (cfg.projectRoots ?? []).flatMap((r: string) => {
    const expanded = r.startsWith('~/') ? `${home}/${r.slice(2)}` : r
    return [r, expanded].map((x) => x.replace(/\/+$/, '')).filter((x) => x.length > 2 && x !== '~')
  })
  const dictPath = '/usr/share/dict/words'
  const dictionary = new Set(
    fs.existsSync(dictPath) ? fs.readFileSync(dictPath, 'utf-8').toLowerCase().split('\n') : [],
  )
  // genericNames: reviewed ordinary words the system word list lacks (e.g. "dashboard").
  for (const w of cfg.genericNames ?? []) dictionary.add(String(w).toLowerCase())
  // Words of the contract's own labels ("MCP", "Client work") are vocabulary: a project
  // sharing one can only surface through the fixed label, which the schema pins.
  const vocab = new Set([...publicVocabulary()].map((s) => s.toLowerCase()))
  const vocabWords = new Set([...vocab].flatMap((s) => s.split(/[^a-z0-9]+/)).filter(Boolean))
  const isVocab = (n: string) => vocabWords.has(n.toLowerCase())
  const tiered = tierNames(
    [...new Set(names)].filter((n) => !isVocab(n)),
    dictionary,
  )
  const distinctive = tiered.distinctive
  const generic = [...tiered.generic, ...names.filter(isVocab)]
  // Prose check targets names that became generic only through inflection stemming: plain
  // dictionary words, junk fragments and vocabulary words would only produce noise.
  const proseGeneric = tiered.generic.filter(
    (n) => /^[a-z0-9][a-z0-9._ -]*$/i.test(n) && !dictionary.has(n.toLowerCase()),
  )
  // Extra terms (people, clients, agent names, account handles) are always substring-matched.
  const extra: string[] = [...(cfg.denylistExtra ?? []), ...new Set(roots)]
  // Minified bundles are full of 2 and 3 letter identifiers, so very short names are
  // checked in source and prose, not in dist/.
  const distNames = distinctive.filter((n) => n.length > 3)
  // Minified bundles and binary files are dense with short identifiers and byte runs.
  // The path list (a pseudo-file whose key starts with "(") holds build hashes with random letter pairs.
  const denseText = (f: string) =>
    f.startsWith('dist/') || f.startsWith('(') || /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf)$/i.test(f)
  const PROSE = /\.(md|html|ya?ml|txt|json)$|(^|\/)CNAME$/

  const findings: Finding[] = []
  for (const [f, text] of texts) {
    findings.push(...scanNames(f, text, [...(denseText(f) ? distNames : distinctive), ...extra], allow))
    findings.push(...scanCompacted(f, text, [...distinctive, ...extra], allow))
    // Stem-demoted names still count in prose, word-bounded. The lockfile is excluded: it
    // is package names only.
    if (PROSE.test(f) && !f.endsWith('package-lock.json') && !f.includes('data/usage.json'))
      findings.push(...scanNames(f, text, proseGeneric, allow))
    // Published data: every generic name, exact, against every JSON string outside the
    // contract's fixed vocabulary.
    if (f.endsWith('data/usage.json')) {
      const strings = new Set(
        jsonStrings(JSON.parse(text))
          .map((s) => s.toLowerCase())
          .filter((s) => !vocab.has(s)),
      )
      for (const g of generic) {
        if (strings.has(g.toLowerCase())) findings.push({ file: f, line: 0, term: g, kind: 'private-name' })
      }
    }
  }
  return {
    findings,
    summary: `names: ${distinctive.length} distinctive + ${extra.length} extra substring-checked, ${generic.length} generic exact-checked (${proseGeneric.length} also in prose)`,
  }
}
