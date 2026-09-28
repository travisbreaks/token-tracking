import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Newest Codex rate-limit snapshot, for the local fuel gauge. Reads only the tail of the
// few most recently modified session logs and only `token_count` events' `rate_limits`;
// never message content, never ~/.codex/auth.json. File mtime order is not event order,
// so the snapshot with the latest timestamp across those tails wins.

export interface CodexLimitWindow {
  usedPercent: number | null
  windowMinutes: number | null
  resetsAt: string | null
}

export interface CodexLimits {
  capturedAt: string
  planType: string | null
  primary: CodexLimitWindow | null
  secondary: CodexLimitWindow | null
  limitReached: string | null
}

const ROOT = path.join(os.homedir(), '.codex', 'sessions')
const FILES_TO_READ = 5
const TAIL_BYTES = 512 * 1024

interface RawWindow {
  used_percent?: number
  window_minutes?: number
  resets_at?: number
}

const toWindow = (w: RawWindow | null | undefined): CodexLimitWindow | null =>
  w
    ? {
        usedPercent: w.used_percent ?? null,
        windowMinutes: w.window_minutes ?? null,
        resetsAt: w.resets_at == null ? null : new Date(w.resets_at * 1000).toISOString(),
      }
    : null

function sessionFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return sessionFiles(full)
    return e.name.endsWith('.jsonl') ? [full] : []
  })
}

function tail(file: string): string {
  const { size } = fs.statSync(file)
  const start = Math.max(0, size - TAIL_BYTES)
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(size - start)
    fs.readSync(fd, buf, 0, buf.length, start)
    return buf.toString('utf-8')
  } finally {
    fs.closeSync(fd)
  }
}

export function readLatestCodexLimits(root = ROOT): CodexLimits | null {
  const newest = sessionFiles(root)
    .map((f) => ({ f, m: fs.statSync(f).mtimeMs }))
    .sort((a, b) => b.m - a.m)
    .slice(0, FILES_TO_READ)

  let best: CodexLimits | null = null
  for (const { f } of newest) {
    for (const line of tail(f).split('\n')) {
      if (!line.includes('"rate_limits"')) continue
      let o: {
        timestamp?: string
        payload?: {
          type?: string
          rate_limits?: {
            plan_type?: string
            primary?: RawWindow | null
            secondary?: RawWindow | null
            rate_limit_reached_type?: string | null
          }
        }
      }
      try {
        o = JSON.parse(line)
      } catch {
        continue // the first line of a tail is usually cut mid-record
      }
      const rl = o.payload?.type === 'token_count' ? o.payload.rate_limits : undefined
      if (!rl || !o.timestamp) continue
      if (best && o.timestamp <= best.capturedAt) continue
      best = {
        capturedAt: o.timestamp,
        planType: rl.plan_type ?? null,
        primary: toWindow(rl.primary),
        secondary: toWindow(rl.secondary),
        limitReached: rl.rate_limit_reached_type ?? null,
      }
    }
  }
  return best
}
