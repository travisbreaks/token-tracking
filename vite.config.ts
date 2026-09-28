import { execFile, execSync } from 'node:child_process'
import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'
import { readLatestCodexLimits } from './scripts/codex-limits.ts'
import { isPrivateRequest } from './scripts/dev-guard.ts'

// Local mode only. Every plugin below uses configureServer, so none of it exists in a
// production build: the public site is static files and nothing else.

const ROOT_DIR = import.meta.dirname
const PORT = Number(process.env.TT_PORT ?? 5174)
const PRIVATE_DIR = path.resolve(ROOT_DIR, 'data/private')

// A page open in any browser tab can still send a request to 127.0.0.1 (the browser blocks
// reading the response, not the side effect). Refuse anything not from this dashboard.
function sameOrigin(req: IncomingMessage) {
  const allowed = [`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]
  const origin = req.headers.origin
  const host = req.headers.host
  if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) return false
  return origin === undefined || allowed.includes(origin)
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function localApiPlugin(): Plugin {
  let usageCache: { data: Record<string, unknown>; ts: number } | null = null
  let codexCache: { data: unknown; ts: number } | null = null
  const USAGE_TTL = 5 * 60_000
  const CODEX_TTL = 30_000

  return {
    name: 'token-tracking-local-api',
    configureServer(server) {
      // Registered before Vite's own file serving: private files are never served by URL.
      server.middlewares.use((req, res, next) => {
        if (req.url && isPrivateRequest(req.url, ROOT_DIR)) return json(res, 403, { ok: false, error: 'private' })
        next()
      })

      server.middlewares.use('/api', (req, res, next) => {
        if (!sameOrigin(req)) return json(res, 403, { ok: false, error: 'forbidden origin' })
        next()
      })

      // Private data, served from data/private/ (never from publicDir).
      server.middlewares.use('/api/private/usage', (_req, res) => {
        const file = path.join(PRIVATE_DIR, 'usage.json')
        if (!fs.existsSync(file)) return json(res, 404, { ok: false, error: 'Run `npm run collect` first' })
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(fs.readFileSync(file))
      })

      server.middlewares.use('/api/private/subscriptions', (req, res) => {
        const file = path.join(PRIVATE_DIR, 'subscriptions.json')
        if (req.method === 'GET') {
          if (!fs.existsSync(file)) return json(res, 404, { ok: false })
          res.setHeader('Content-Type', 'application/json')
          return res.end(fs.readFileSync(file))
        }
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'GET or POST' })
        let body = ''
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        req.on('end', () => {
          try {
            const data = JSON.parse(body)
            fs.mkdirSync(PRIVATE_DIR, { recursive: true })
            fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
            json(res, 200, { ok: true })
          } catch (e) {
            json(res, 500, { ok: false, error: (e as Error).message })
          }
        })
      })

      // POST /api/refresh re-runs the collector.
      server.middlewares.use('/api/refresh', (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' })
        const script = path.resolve(ROOT_DIR, 'scripts/collect.ts')
        execFile('node', ['--import', 'tsx', script], { cwd: ROOT_DIR }, (err, stdout, stderr) => {
          if (err) json(res, 500, { ok: false, error: stderr || err.message })
          else json(res, 200, { ok: true, output: stdout })
        })
      })

      // GET /api/usage: Claude plan utilization from the OAuth usage endpoint (undocumented).
      // Cached for 5 min; serves the stale copy when rate limited.
      server.middlewares.use('/api/usage', async (_req, res) => {
        try {
          if (usageCache && Date.now() - usageCache.ts < USAGE_TTL) return json(res, 200, usageCache.data)
          const raw = execSync('security find-generic-password -s "Claude Code-credentials" -w', {
            encoding: 'utf-8',
            timeout: 5000,
          }).trim()
          const token = JSON.parse(raw)?.claudeAiOauth?.accessToken
          if (!token) return json(res, 500, { ok: false, error: 'No OAuth token found in Keychain' })

          const apiRes = await fetch('https://api.anthropic.com/api/oauth/usage', {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'anthropic-beta': 'oauth-2025-04-20',
            },
          })
          if (!apiRes.ok) {
            if (usageCache) return json(res, 200, { ...usageCache.data, stale: true })
            return json(res, apiRes.status, { ok: false, error: await apiRes.text() })
          }
          const result = { ok: true, ...((await apiRes.json()) as Record<string, unknown>) }
          usageCache = { data: result, ts: Date.now() }
          json(res, 200, result)
        } catch (e) {
          if (usageCache) return json(res, 200, { ...usageCache.data, stale: true })
          json(res, 500, { ok: false, error: (e as Error).message })
        }
      })

      // GET /api/codex-limits: newest OpenAI (Codex) rate-limit snapshot from local logs.
      server.middlewares.use('/api/codex-limits', (_req, res) => {
        try {
          if (!codexCache || Date.now() - codexCache.ts > CODEX_TTL) {
            codexCache = { data: readLatestCodexLimits(), ts: Date.now() }
          }
          if (!codexCache.data) return json(res, 404, { ok: false, error: 'No Codex rate-limit snapshots found' })
          json(res, 200, { ok: true, ...(codexCache.data as object) })
        } catch (e) {
          json(res, 500, { ok: false, error: (e as Error).message })
        }
      })
    },
  }
}

export default defineConfig({
  base: './',
  server: {
    port: PORT,
    host: '127.0.0.1',
    strictPort: true,
    // Same-origin app: no other local origin gets a CORS grant to read anything here.
    cors: false,
    // Second layer behind the middleware above. Vite matches these against absolute paths,
    // so directory patterns need a leading **/ (or the repo root, for top-level hidden dirs).
    fs: {
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem}',
        '**/.git/**',
        '**/data/private/**',
        '**/*.local.*',
        path.join(ROOT_DIR, '.*', '**'),
        '**/astra/**',
      ],
    },
  },
  plugins: [react({ babel: { plugins: ['babel-plugin-react-compiler'] } }), tailwindcss(), localApiPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(ROOT_DIR, './src'),
    },
  },
  build: {
    // Stated explicitly: no source maps in the public build.
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'vendor-react'
          if (id.includes('node_modules/recharts')) return 'vendor-recharts'
          if (id.includes('node_modules/motion')) return 'vendor-motion'
        },
      },
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**', 'src/utils/**', 'scripts/**'],
    },
  },
})
