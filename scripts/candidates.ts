import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// What the leak gate scans.
//   'staged': the Git index, byte for byte. This is exactly what the next commit will
//             contain, whatever the working files say. Used by the pre-commit hook.
//   'worktree': every committable working file plus the build output. Used before a
//             publish and in CI, where the checkout is the candidate.

export type Mode = 'staged' | 'worktree'

const git = (root: string, args: string[]) => execFileSync('git', args, { cwd: root, maxBuffer: 1 << 28 })

function walk(root: string, dir: string): string[] {
  const abs = path.join(root, dir)
  if (!fs.existsSync(abs)) return []
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name)
    return e.isDirectory() ? walk(root, rel) : [rel.split(path.sep).join('/')]
  })
}

/** Repo-relative path -> file bytes, for the chosen mode. */
export function readCandidates(root: string, mode: Mode): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  if (mode === 'staged') {
    const listed = git(root, ['ls-files', '--cached', '-z']).toString('utf-8').split('\0').filter(Boolean)
    for (const f of listed) out.set(f, git(root, ['show', `:${f}`]))
    return out
  }
  const listed = git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
    .toString('utf-8')
    .split('\0')
    .filter(Boolean)
  for (const f of [...listed, ...walk(root, 'dist')]) {
    const abs = path.join(root, f)
    // Files only: an untracked symlink to a directory is listed by git but is not content.
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) out.set(f, fs.readFileSync(abs))
  }
  return out
}

/** Files whose staged bytes differ from the working copy (partially staged). */
export function partiallyStaged(root: string): string[] {
  return git(root, ['diff', '--name-only', '-z']).toString('utf-8').split('\0').filter(Boolean)
}
