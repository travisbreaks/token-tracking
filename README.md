# token-tracking

AI token use across Claude Code and OpenAI Codex, read from the logs both tools already
keep on disk. Daily tokens, API-equivalent cost, model mix, tool calls and work
categories; what each model and effort level actually cost, and which model running the top
level of a session drives the bill; plus a fuel gauge for each provider's plan limits.

It pairs with the [effort map](https://travismakes.org/effort-map/), a method for choosing a
model and effort level: the map says how to compare settings fairly, this repo measures what
each setting cost.

Planned public view: `tokens.travismakes.org` (not deployed yet).

## Two modes

**Local** (`npm run dev`, bound to 127.0.0.1): the working dashboard. Per-session detail,
project names, working hours, and plan limits: Claude from its account usage endpoint,
OpenAI from the newest rate-limit snapshot in the Codex logs. A Spend view appears when
`data/private/subscriptions.json` exists. The old project-billing panels are not part of
this repo.

**Public** (`npm run build:public`): a static site built from one sanitized file,
`public/data/usage.json`. Daily and category totals only. The fuel widget runs a
labeled demo there, with simulated limits.

## Documentation

- [docs/MODELS-AND-EFFORT.md](docs/MODELS-AND-EFFORT.md): choosing a top-level model, agent
  models and effort, with measured costs, and how to run a paired comparison.
- [docs/METHODOLOGY.md](docs/METHODOLOGY.md): how sessions, days, dedupe, pricing and
  categories work.
- [docs/GOTCHAS.md](docs/GOTCHAS.md): the traps in these logs and in pricing, with measured
  effects (for example, keeping the first streamed line per response misses a quarter of
  output tokens).
- [docs/PUBLISHING-SAFELY.md](docs/PUBLISHING-SAFELY.md): the privacy pipeline, and what
  nearly leaked while it was built.
- [docs/DATA-CONTRACT.md](docs/DATA-CONTRACT.md): every field of the public JSON.
- [docs/LOG-FORMATS.md](docs/LOG-FORMATS.md): what Claude Code and Codex log lines look like.
- [AGENTS.md](AGENTS.md): guidance for coding agents working in this repo.

## How the numbers are counted

- **API-equivalent cost.** Every response is priced at the provider's published API list
  rate (`src/lib/costs.ts`, `src/lib/openaiCosts.ts`). It is not what a subscription
  bills. Claude 1-hour cache writes are priced at 2x input when the transcript reports
  them, 5-minute writes at 1.25x. OpenAI responses on models with no published price are
  counted but add no cost, and the dashboard says how many.
- **Days.** Tokens, cost, messages and tool calls land on the local day they happened.
- **Sessions and agent runs.** A session is a top-level Claude Code conversation,
  counted once on the day it starts. Subagent transcripts are counted separately as agent
  runs; their tokens and cost are in every total.
- **No double counting.** A response is billed once per message id, a tool call once per
  tool_use id, a user message once per entry id, so replayed transcripts count once.
- **Categories are an estimate.** A session is split across projects by where its file
  operations happened, and projects map to categories in a local config. It is not
  billed time, invoices or measured labor.
- **Freshness.** The public view changes only when someone publishes a new snapshot.

## Privacy contract

The public file carries exactly what `scripts/public-contract.ts` names, and the validator
rejects anything else, including unknown keys inside maps.

Published: daily totals (sessions, agent runs, messages, tool calls, tokens by type,
API-equivalent USD) with a per-day split by model; a monthly split by work category; all-time
usage by model and effort level, and by the model that ran the top level with its agents; tool
call counts; and OpenAI (Codex) totals and effort levels.

Never published: project names, session IDs or rows, file paths, category splits finer than a
month, timestamps finer than a day, time zone, hour-of-day or working-hours data, subscriptions, plan or rate-limit
state, MCP server names (every MCP tool counts as `MCP`), and model IDs that are not on
the providers' public pricing pages (they count as `claude-other` / `openai-other`).

How that is enforced:

1. `publish.ts` builds the public object field by field; nothing is copied wholesale.
2. It refuses to run while any project lacks a category.
3. `npm run check-public` is the leak gate: schema, forbidden patterns (session IDs, home
   and volume paths, MCP names, emails), image metadata, gitleaks, and, locally, every
   real project name. The name list is the secret, so CI runs everything except that part.
   CI passing is not privacy approval on its own; the local staged scan is required.
4. The pre-commit hook runs the gate on the Git index itself (`check-public -- --staged`),
   so it checks exactly the bytes being committed.
5. The site is built by GitHub Actions from a clean checkout, where private files do not
   exist.
6. `npm run check-live` crawls the deployed site, checks that every file is byte-identical
   to the reviewed local build, and runs the leak checks on the live bytes.
7. The `commit-msg` hook checks commit messages and the author identity, which the file gate
   never sees.
8. The local dev server refuses private files by URL (case-insensitively) and sends no CORS
   grants.

The public page loads its fonts from Google Fonts, so a visitor's browser contacts Google.

## Setup

Requires Node 22.12 or newer, [gitleaks](https://github.com/gitleaks/gitleaks) and
[exiftool](https://exiftool.org) (on macOS: `brew install gitleaks exiftool`). The live
Claude plan gauge reads the Claude Code login from the macOS Keychain, so it works on macOS
only; everything else runs anywhere.

```bash
npm install
git config core.hooksPath .githooks            # enables the pre-commit and commit-msg checks
cp tracking.example.json tracking.local.json   # gitignored; edit roots and categories
npm run collect        # reads ~/.claude/projects and ~/.codex/sessions -> data/private/
npm run dev            # local dashboard at http://127.0.0.1:5174 (?widget for the gauges)
npm run session-report -- --latest   # one session plus its agents: cost, tokens, models, effort
```

Publishing a snapshot:

```bash
npm run collect && npm run publish-data && npm run check-public
git add public/data/usage.json && git commit -m "data: refresh"
git push                              # CI checks, builds and deploys
npm run build:public && npm run check-live   # after the deploy finishes
```

## What it reads

- `~/.claude/projects/**/*.jsonl`: Claude Code transcripts. Token usage, model, tool
  names and file paths (paths only to attribute sessions to projects).
- `~/.codex/sessions/**/*.jsonl`: Codex logs. Only `turn_context` (model),
  `token_usage_record` (tokens) and `token_count` (rate limits) events. Never message
  content, never `~/.codex/auth.json`.
- Local mode only: the Claude Code OAuth token from the macOS Keychain, to call the plan
  usage endpoint.

## If something leaks

1. Take it down first: disable GitHub Pages for the repo, or revert the commit and let CI
   redeploy.
2. Remove it from history: rewrite with `git filter-repo`, force-push, and file GitHub's
   sensitive-data removal request so cached views and forks are purged.
3. Treat any leaked credential as compromised and rotate it.
4. Add the missed term or pattern to the gate, with a test that fails on it, before the
   next publish.

## License

MIT. See [LICENSE](LICENSE).
