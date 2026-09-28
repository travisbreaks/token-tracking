// Runs the leak gate against the DEPLOYED site, and proves the deploy is the reviewed build.
//
//   npm run build:public && npm run check-live          (default https://tokens.travismakes.org)
//   npm run check-live -- https://other.host
//
// 1. Fetches the page and every asset it references, recursively (HTML, CSS, JS imports,
//    images), plus the published data.
// 2. Compares each live file's SHA-256 with the local dist/ built from the reviewed commit.
//    Any difference or missing file fails: a valid but stale site is not this release.
// 3. Runs schema, pattern, private-name, image-metadata and gitleaks checks on the live bytes.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type Finding, scanPatterns } from './leak-scan'
import { scanPrivateNames } from './name-check'
import { validatePublic } from './public-contract'

const ROOT = path.join(import.meta.dirname, '..')
const DIST = path.join(ROOT, 'dist')
const base = (process.argv[2] ?? 'https://tokens.travismakes.org').replace(/\/+$/, '')
const failures: string[] = []
const none = (_f: Finding) => false
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const IMAGE = /\.(png|jpe?g|gif|webp)$/i
const TEXT = /\.(html|js|css|json|txt|svg)$/i

async function get(rel: string): Promise<Buffer> {
  // Cache-busted so a stale CDN copy cannot pass for the new deploy.
  const url = `${base}/${rel}`
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

// Asset references inside HTML, CSS and JS: src/href attributes, url(), and quoted
// relative paths to files with a known extension ("./chunk.js", `./lobster.png`).
function references(text: string, from: string): string[] {
  const dir = path.posix.dirname(from)
  const out = new Set<string>()
  const patterns = [
    /(?:src|href)="([^"#?]+)"/g,
    /url\(\s*['"]?([^'")?#]+)['"]?\s*\)/g,
    /["'`](\.{0,2}\/?[A-Za-z0-9_./-]+\.(?:js|css|png|jpe?g|gif|webp|svg|woff2?|json))["'`]/g,
  ]
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const ref = m[1]
      if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:')) continue // external or inline
      if (ref.startsWith('/')) {
        out.add(ref.slice(1))
        continue
      }
      // A relative path in a JS string is either a module import (relative to the script)
      // or a DOM URL like an img src (relative to the page). Try both.
      for (const baseDir of new Set([dir, '.'])) {
        const rel = path.posix.normalize(path.posix.join(baseDir, ref))
        if (!rel.startsWith('..')) out.add(rel)
      }
    }
  }
  return [...out]
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('No local dist/: run `npm run build:public` from the reviewed commit first.')
    process.exit(1)
  }

  // Crawl from the page, plus the data file the app fetches at runtime.
  const live = new Map<string, Buffer>()
  const queue = ['index.html', 'data/usage.json']
  while (queue.length) {
    const rel = queue.shift() as string
    if (live.has(rel)) continue
    let body: Buffer
    try {
      body = await get(rel === 'index.html' ? '' : rel)
    } catch (e) {
      // Quoted-path matching can pick up strings that are not assets; only fail when the
      // local build has the file (then the deploy is missing it).
      if (fs.existsSync(path.join(DIST, rel))) failures.push(`missing on live site: ${rel} (${(e as Error).message})`)
      continue
    }
    live.set(rel, body)
    if (TEXT.test(rel) || rel === 'index.html') {
      for (const ref of references(body.toString('utf-8'), rel)) if (!live.has(ref)) queue.push(ref)
    }
  }

  // 2. The deploy must be byte-identical to the reviewed local build.
  for (const [rel, body] of live) {
    const local = path.join(DIST, rel)
    if (!fs.existsSync(local)) failures.push(`live file not in the reviewed build: ${rel}`)
    else if (sha(fs.readFileSync(local)) !== sha(body))
      failures.push(`live file differs from the reviewed build: ${rel}`)
  }

  // 3. Leak checks on the live bytes.
  const data = live.get('data/usage.json')
  if (!data) failures.push('live data/usage.json not found')
  else for (const e of validatePublic(JSON.parse(data.toString('utf-8'))).slice(0, 50)) failures.push(`schema: ${e}`)

  const texts = new Map(
    [...live].filter(([rel]) => !IMAGE.test(rel)).map(([rel, b]) => [`dist/${rel}`, b.toString('utf-8')] as const),
  )
  const findings: Finding[] = []
  for (const [f, text] of texts) findings.push(...scanPatterns(f, text, none))
  const names = scanPrivateNames(texts, none)
  if (names) {
    findings.push(...names.findings)
    console.log(names.summary)
  } else console.log('names: SKIPPED (private files absent)')
  for (const f of findings) failures.push(`${f.kind}: ${JSON.stringify(f.term)} in ${f.file}:${f.line}`)

  const mirror = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'tt-live-'))
  for (const [rel, body] of live) {
    fs.mkdirSync(path.dirname(path.join(mirror, rel)), { recursive: true })
    fs.writeFileSync(path.join(mirror, rel), body)
  }
  const images = [...live.keys()].filter((r) => IMAGE.test(r))
  if (images.length) {
    const out = execFileSync(
      'exiftool',
      ['-j', '-EXIF:all', '-XMP:all', '-GPS:all', '-IPTC:all', ...images.map((r) => path.join(mirror, r))],
      { encoding: 'utf-8' },
    )
    for (const rec of JSON.parse(out) as Record<string, unknown>[]) {
      const tags = Object.keys(rec).filter((k) => k !== 'SourceFile')
      if (tags.length) failures.push(`image metadata in live ${path.relative(mirror, String(rec.SourceFile))}`)
    }
  }
  try {
    execFileSync('gitleaks', ['dir', mirror, '--no-banner', '--redact', '--exit-code', '1'], { stdio: 'pipe' })
  } catch (e) {
    failures.push(`gitleaks on live files: ${(e as { stdout?: Buffer }).stdout?.toString() ?? (e as Error).message}`)
  }

  console.log(`checked ${live.size} live files (${images.length} images) at ${base} against local dist/`)
  if (failures.length) {
    console.error(`\nLIVE CHECK FAILED (${failures.length}):`)
    for (const f of failures.slice(0, 200)) console.error(`  ${f}`)
    process.exit(1)
  }
  console.log('LIVE CHECK PASSED: the deploy matches the reviewed build and passes the leak checks')
}

main().catch((e) => {
  console.error(`LIVE CHECK ERROR: ${(e as Error).message}`)
  process.exit(1)
})
