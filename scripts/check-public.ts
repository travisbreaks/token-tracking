// The leak gate.
//
//   npm run check-public            working tree + dist/: before a publish, and in CI
//   npm run check-public -- --staged  the Git index, exactly what the next commit holds
//                                     (the pre-commit hook runs this mode)
//
// Every check below reads the same in-memory snapshot of candidate bytes, never the disk
// a second time, so a file changed after staging cannot slip past.
//
// Always (CI too): schema of the published data, forbidden patterns (session IDs, home and
// volume paths, MCP tool names, emails), image metadata, and gitleaks.
// Locally only: every real project name, alias and extra term from data/private and
// tracking.local.json. That list is the secret, so CI cannot run this part.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { type Mode, partiallyStaged, readCandidates } from './candidates'
import { type Finding, scanPatterns } from './leak-scan'
import { LOCAL_CONFIG_PATH } from './local-config'
import { scanPrivateNames } from './name-check'
import { validatePublic } from './public-contract'

const ROOT = path.join(import.meta.dirname, '..')
const PUBLIC_DATA = 'public/data/usage.json'
const IMAGE = /\.(png|jpe?g|gif|webp)$/i
const PATHS_KEY = '(file and folder names)'
// PNG chunks that only describe pixels. Any other PNG tag is a text or metadata chunk.
const PNG_STRUCTURAL = new Set(
  [
    'ImageWidth',
    'ImageHeight',
    'BitDepth',
    'ColorType',
    'Compression',
    'Filter',
    'Interlace',
    'SRGBRendering',
    'Gamma',
    'PixelsPerUnitX',
    'PixelsPerUnitY',
    'PixelUnits',
    'Palette',
    'Transparency',
    'BackgroundColor',
    'SignificantBits',
    'WhitePointX',
    'WhitePointY',
    'RedX',
    'RedY',
    'GreenX',
    'GreenY',
    'BlueX',
    'BlueY',
  ].map((t) => `PNG:${t}`),
)
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf)$/i
const mode: Mode = process.argv.includes('--staged') ? 'staged' : 'worktree'

const failures: string[] = []
const fail = (msg: string) => failures.push(msg)

const candidates = readCandidates(ROOT, mode)
console.log(`mode: ${mode} (${candidates.size} files)`)

// Guard: private files must be ignored, never committable.
for (const f of candidates.keys()) {
  if (
    f.startsWith('data/private/') ||
    f.includes('.local.') ||
    f.startsWith('astra/') ||
    /^\.(?!github\/|githooks\/|gitignore$)/.test(f)
  ) {
    fail(`private file is a commit candidate (check .gitignore): ${f}`)
  }
}

// A partially staged publish is ambiguous: the index and the working copy disagree about
// what is being released. Refuse it rather than guess.
if (mode === 'staged') {
  const partial = partiallyStaged(ROOT)
  if (partial.includes(PUBLIC_DATA)) fail(`${PUBLIC_DATA} is partially staged: stage it fully or restore it`)
  const others = partial.filter((f) => f !== PUBLIC_DATA && candidates.has(f))
  if (others.length) console.log(`note: ${others.length} partially staged file(s); scanning the staged version`)
}

// --- 1. Schema ---
const data = candidates.get(PUBLIC_DATA)
if (!data) {
  fail(`${PUBLIC_DATA} is missing from the candidate set (run npm run publish-data)`)
} else {
  for (const e of validatePublic(JSON.parse(data.toString('utf-8'))).slice(0, 50)) fail(`schema: ${e}`)
}

// --- Local allowlist of expected hits: { "term": ["relative/path", ...] } ---
let allowMap: Record<string, string[]> = {}
if (fs.existsSync(LOCAL_CONFIG_PATH)) {
  allowMap = JSON.parse(fs.readFileSync(LOCAL_CONFIG_PATH, 'utf-8')).denylistAllow ?? {}
}
// The allowlist is local and unreviewed by anyone else, so it may never silence the
// published data or the build output.
for (const [term, paths] of Object.entries(allowMap)) {
  for (const p of paths) {
    if (p.startsWith('public/data/') || p.startsWith('dist/')) fail(`denylistAllow may not cover ${p} (term ${term})`)
  }
}
// Committed exemptions: the invented values the leak-gate tests plant on purpose, allowed
// term by term in that one file only (never a whole-file skip).
const PLANTED = [
  '0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0',
  'agent-a1b2c3d4e5f6',
  '/Users/someone',
  'mcp__svc__tool',
  'mcp__x__y',
  'mcp__private_brokerage__place_order',
  'someone@example.com',
  '/Volumes/SomeDisk',
  '/private/var/folders/ab',
]
const FIXTURE_TERMS: Record<string, string[]> = {
  'scripts/__tests__/leak-gate.test.ts': PLANTED,
  'scripts/check-public.ts': [
    ...PLANTED,
    'agent-a1b2c3',
    'bot@example.com',
    'pat@example.com',
    '123+pat@users.noreply.github.com',
  ], // these lists themselves
  'scripts/__tests__/collect.test.ts': ['agent-a1b2c3'], // an invented subagent transcript name
  'scripts/__tests__/release-guards.test.ts': [
    '0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0',
    '/Users/someone',
    'bot@example.com',
    'pat@example.com',
    '123+pat@users.noreply.github.com',
  ],
}
const allow = (f: Finding) =>
  (FIXTURE_TERMS[f.file] ?? []).includes(f.term) ||
  (allowMap[f.term] ?? allowMap[f.term.toLowerCase()] ?? []).includes(f.file)

// --- 2. Patterns ---
// Text files as UTF-8; binaries (images, fonts) as latin1, so an embedded plain string is
// still visible; and every candidate path, since a name can leak as a file or folder name.
const texts = new Map<string, string>()
for (const [f, bytes] of candidates) texts.set(f, bytes.toString(BINARY.test(f) ? 'latin1' : 'utf-8'))
texts.set(PATHS_KEY, [...candidates.keys()].join('\n'))
const findings: Finding[] = []
for (const [f, text] of texts) findings.push(...scanPatterns(f, text, allow))

// --- 3. Private names (local only) ---
const nameScan = scanPrivateNames(texts, allow)
if (nameScan) {
  findings.push(...nameScan.findings)
  console.log(nameScan.summary)
} else {
  console.log('names: SKIPPED (no data/private/usage.json or tracking.local.json; CI mode)')
}
for (const f of findings) fail(`${f.kind}: ${JSON.stringify(f.term)} in ${f.file}:${f.line}`)

// Mirror the candidate bytes to a temp dir so exiftool and gitleaks see exactly them.
const mirror = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'tt-gate-'))
for (const [f, bytes] of candidates) {
  fs.mkdirSync(path.dirname(path.join(mirror, f)), { recursive: true })
  fs.writeFileSync(path.join(mirror, f), bytes)
}

// --- 4. Image metadata: EXIF/XMP/GPS/IPTC carry capture times, time zones, locations and
// authors. Publishable images must have none (strip with `exiftool -all= <file>`).
const images = [...candidates.keys()].filter((f) => IMAGE.test(f))
if (images.length) {
  try {
    const out = execFileSync(
      'exiftool',
      [
        '-j',
        '-G1',
        '-EXIF:all',
        '-XMP:all',
        '-GPS:all',
        '-IPTC:all',
        '-PNG:all',
        ...images.map((f) => path.join(mirror, f)),
      ],
      { encoding: 'utf-8' },
    )
    for (const rec of JSON.parse(out) as Record<string, unknown>[]) {
      const tags = Object.keys(rec).filter((k) => k !== 'SourceFile' && !PNG_STRUCTURAL.has(k))
      if (tags.length)
        fail(`image metadata in ${path.relative(mirror, String(rec.SourceFile))}: ${tags.slice(0, 5).join(', ')}`)
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') fail('exiftool is not installed; image metadata unchecked')
    else throw e
  }
}

// --- 5. gitleaks over the same bytes ---
try {
  execFileSync('gitleaks', ['version'], { stdio: 'ignore' })
  try {
    execFileSync('gitleaks', ['dir', mirror, '--no-banner', '--redact', '--exit-code', '1'], { stdio: 'pipe' })
    console.log('gitleaks: clean')
  } catch (e) {
    fail(`gitleaks: findings\n${(e as { stdout?: Buffer }).stdout?.toString() ?? ''}`)
  }
} catch {
  fail('gitleaks is not installed (brew install gitleaks); the gate does not pass without it')
}

console.log(`scanned ${candidates.size} files and their paths, ${images.length} images for metadata`)
if (failures.length) {
  console.error(`\nLEAK GATE FAILED (${failures.length}):`)
  for (const f of failures.slice(0, 200)) console.error(`  ${f}`)
  process.exit(1)
}
console.log('LEAK GATE PASSED')
