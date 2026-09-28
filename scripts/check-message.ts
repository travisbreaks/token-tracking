// Commit-message leak check, run by .githooks/commit-msg. The file gate (check-public)
// never sees commit metadata, and a message becomes public with the repo.
//
// Scans the message, and the author and committer identities, with the same patterns and
// private-name list as check-public. Co-Authored-By trailers are skipped: attribution is the
// author's deliberate choice. Identity emails must be GitHub noreply addresses. A display
// name is public in every commit by definition, so a name finding that is exactly the
// display name (ignoring case, spaces and separators) is not a leak.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { type Finding, scanPatterns } from './leak-scan'
import { scanPrivateNames } from './name-check'

const NOREPLY = /@users\.noreply\.github\.com$/i
const compact = (s: string) => s.toLowerCase().replace(/[-_ .]/g, '')

/** Message text as Git will store it: no comment lines, nothing below a `commit -v` scissors line. */
export function cleanMessage(raw: string, commentChar = '#'): string {
  const lines = raw.split('\n')
  const scissors = lines.findIndex((l) => l.startsWith(commentChar) && /^. -+ >8 -+$/.test(l))
  return (scissors >= 0 ? lines.slice(0, scissors) : lines)
    .filter((l) => !l.startsWith(commentChar) && !/^co-authored-by:/i.test(l.trim()))
    .join('\n')
}

/** "Name <email> 1727000000 -0500" -> { name, email } */
export function parseIdent(ident: string): { name: string; email: string } {
  const m = ident.match(/^(.*?)\s*<([^>]*)>/)
  return { name: (m?.[1] ?? ident).trim(), email: (m?.[2] ?? '').trim() }
}

export function checkCommit(message: string, identities: Record<string, string>): Finding[] {
  const none = (_f: Finding) => false
  const findings: Finding[] = [...scanPatterns('(commit message)', message, none)]
  const texts = new Map<string, string>([['(commit message)', message]])
  const displayNames = new Map<string, string>()
  for (const [role, ident] of Object.entries(identities)) {
    const key = `(commit ${role})`
    const { name, email } = parseIdent(ident)
    if (!NOREPLY.test(email)) findings.push({ file: key, line: 1, term: `${role} email`, kind: 'non-noreply-identity' })
    findings.push(...scanPatterns(key, name, none))
    texts.set(key, name) // the noreply address carries the public GitHub handle; check the name
    displayNames.set(key, compact(name))
  }
  const ownName = (f: Finding) => displayNames.has(f.file) && compact(f.term) === displayNames.get(f.file)
  findings.push(...(scanPrivateNames(texts, none)?.findings ?? []).filter((f) => !ownName(f)))
  return findings
}

function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: check-message <commit-message-file>')
    process.exit(2)
  }
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf-8' }).trim()
  let commentChar = '#'
  try {
    commentChar = git('config', 'core.commentChar') || '#'
  } catch {
    // not set: Git's default
  }
  const findings = checkCommit(cleanMessage(fs.readFileSync(file, 'utf-8'), commentChar), {
    author: git('var', 'GIT_AUTHOR_IDENT'),
    committer: git('var', 'GIT_COMMITTER_IDENT'),
  })
  if (findings.length) {
    console.error(`COMMIT MESSAGE CHECK FAILED (${findings.length}):`)
    for (const f of findings) console.error(`  ${f.kind}: ${JSON.stringify(f.term)} in ${f.file}`)
    process.exit(1)
  }
}

if (process.argv[1] === import.meta.filename) main()
