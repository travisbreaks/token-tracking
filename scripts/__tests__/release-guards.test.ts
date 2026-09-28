import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { partiallyStaged, readCandidates } from '../candidates'
import { checkCommit, cleanMessage, parseIdent } from '../check-message'
import { isPrivateRequest } from '../dev-guard'

describe('leak gate reads the commit candidate, not the working file', () => {
  it('returns the staged bytes when the working copy was changed after staging', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-staged-'))
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo })
    git('init', '-q')
    fs.writeFileSync(path.join(repo, 'note.txt'), 'notes about vellumquartz work\n')
    git('add', 'note.txt')
    fs.writeFileSync(path.join(repo, 'note.txt'), 'safe public text\n')

    expect(readCandidates(repo, 'staged').get('note.txt')?.toString()).toContain('vellumquartz')
    expect(readCandidates(repo, 'worktree').get('note.txt')?.toString()).toBe('safe public text\n')
    expect(partiallyStaged(repo)).toEqual(['note.txt'])
  })
})

describe('local dev server refuses private files by URL', () => {
  const root = '/repo'
  const refused = [
    '/data/private/usage.json',
    '/tracking.local.json',
    '/tracking.local.json?import',
    '/@fs/repo/tracking.local.json',
    '/data%2fprivate%2fusage.json',
    '/src/../tracking.local.json',
    '/%2e%68idden/state.md',
    '/.env',
    '/astra/2026-01-01-0000-note.md',
    '/.git/config',
    // Case variants: one file on a case-insensitive file system.
    '/Data/Private/usage.json',
    '/DATA/PRIVATE/USAGE.JSON',
    '/Tracking.Local.JSON',
    '/Astra/2026-01-01-0000-note.md',
    '/.HIDDEN/state.md',
    '/@id/repo/data/private/usage.json',
  ]
  const served = ['/', '/index.html', '/src/main.tsx', '/@vite/client', '/data/usage.json', '/lobster.png']

  it.each(refused)('refuses %s', (url) => expect(isPrivateRequest(url, root)).toBe(true))
  it.each(served)('serves %s', (url) => expect(isPrivateRequest(url, root)).toBe(false))
})

describe('commit message check', () => {
  const noreply = 'Pat Example <123+pat@users.noreply.github.com> 1790000000 -0500'

  it('keeps the message, drops comments, trailers and everything below a scissors line', () => {
    const raw =
      'feat: thing\n\nbody line\nCo-Authored-By: Bot <bot@example.com>\n# comment\n# ------------------------ >8 ------------------------\ndiff with /Users/someone\n'
    expect(cleanMessage(raw)).toBe('feat: thing\n\nbody line')
    expect(cleanMessage('x\n; note\n', ';')).toBe('x\n')
  })

  it('parses an identity', () => {
    expect(parseIdent(noreply)).toEqual({ name: 'Pat Example', email: '123+pat@users.noreply.github.com' })
  })

  it('requires noreply emails for author and committer', () => {
    const f = checkCommit('docs: x', { author: noreply, committer: 'Pat Example <pat@example.com> 1 +0000' })
    expect(f.map((x) => `${x.kind} ${x.file}`)).toContain('non-noreply-identity (commit committer)')
    expect(f.some((x) => x.file === '(commit author)' && x.kind === 'non-noreply-identity')).toBe(false)
  })

  it('flags planted IDs and paths in the message', () => {
    const f = checkCommit('fix: 0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0 in /Users/someone', { author: noreply })
    expect(f.map((x) => x.kind).sort()).toEqual(['home-path', 'session-uuid'])
  })
})
