# AGENTS.md

Guidance for coding agents working in this repository. Humans: start with the README.

## What this is

A collector that reads Claude Code transcripts and OpenAI Codex logs from the local disk, a
private local dashboard, and a sanitized public dashboard built from one allowlisted JSON
file. The hard parts are correct accounting and never publishing private data; most of the
code exists for those two.

Read before changing behavior: [docs/METHODOLOGY.md](docs/METHODOLOGY.md) (counting rules),
[docs/MODELS-AND-EFFORT.md](docs/MODELS-AND-EFFORT.md) (the model and effort views),
[docs/LOG-FORMATS.md](docs/LOG-FORMATS.md) (the log lines),
[docs/GOTCHAS.md](docs/GOTCHAS.md) (traps, with measurements),
[docs/PUBLISHING-SAFELY.md](docs/PUBLISHING-SAFELY.md) (the privacy pipeline),
[docs/DATA-CONTRACT.md](docs/DATA-CONTRACT.md) (the public file).

## Map

| Path | Role |
|---|---|
| `scripts/collect.ts` | reads transcripts and Codex logs; exports `collect()`; writes `data/private/usage.json` |
| `src/lib/codexUsage.ts` | Codex aggregation (dedupe by `response_id`, newest rate-limit snapshot) |
| `src/lib/costs.ts`, `src/lib/openaiCosts.ts` | pricing tables, dated, with source URLs |
| `scripts/local-config.ts` | loads the gitignored `tracking.local.json` |
| `scripts/public-contract.ts` | the allowlist: every public field and map key |
| `scripts/publish.ts` | private data to `public/data/usage.json`, field by field |
| `scripts/check-public.ts` | the leak gate (`--staged` scans the Git index) |
| `scripts/leak-scan.ts`, `scripts/name-check.ts` | pattern and private-name scanning |
| `scripts/candidates.ts` | what the gate scans: the index, or working files plus `dist/` |
| `scripts/check-message.ts` | commit message and author check (run by `.githooks/commit-msg`) |
| `scripts/check-live.ts` | crawls the deployed site, compares it byte for byte with `dist/` |
| `scripts/session-report.ts` | one session plus its agents: the measured row of a paired trial |
| `scripts/dev-guard.ts`, `vite.config.ts` | local dev server: private-path guard, origin checks, local APIs |
| `scripts/codex-limits.ts` | newest Codex rate-limit snapshot for the local gauge |
| `src/` | React dashboard; `isPublic` in the context decides public vs local rendering |

## Commands

```bash
npm install
git config core.hooksPath .githooks   # pre-commit and commit-msg leak checks
npm run collect                       # needs tracking.local.json (see tracking.example.json)
npm run dev                           # local dashboard, 127.0.0.1:5174
npx tsc -b && npx vitest run          # types and tests
npx biome check src scripts vite.config.ts
npm run publish-data                  # write public/data/usage.json
npm run check-public                  # leak gate on working files + dist/
npm run build:public                  # static public site in dist/
npm run session-report -- --latest    # or -- <session-id prefix>
```

Node 22.12+; gitleaks and exiftool on the PATH for the gate.

## Rules

1. **Private data stays private.** Never commit, print, paste into an issue, or copy into a
   fixture anything from `data/private/`, `tracking.local.json`, or hidden local folders. Do
   not read transcript message content; the collector needs only usage, model, ids, tool
   names and paths.
2. **The public file is an allowlist.** A new public field needs, in one change: the field in
   `PUBLIC_SPEC`, the field built explicitly in `publish.ts`, a test in
   `scripts/__tests__/leak-gate.test.ts`, `docs/DATA-CONTRACT.md`, and a `SCHEMA_VERSION` bump
   if the shape changes. Never spread or copy a private object into the public one. Categories
   are published by month only; do not add a per-day category split.
3. **Keep the accounting rule.** Amounts land on the day they happened; sessions and agent runs
   are counted once on their start day; responses are billed once per `message.id` (output by
   increase), tool calls once per `tool_use.id`, messages once per entry `uuid`.
   `scripts/__tests__/collect.test.ts` covers cross-midnight, replay, multi-model, agent runs,
   1-hour cache pricing and per-day reconciliation; extend it when changing any of these.
4. **Fixtures use invented names only.** Never a real project, person, client or path. If a
   test plants a pattern on purpose (a fake UUID, a fake home path), add that exact string to
   `FIXTURE_TERMS` in `scripts/check-public.ts` for that file only.
5. **Pricing changes carry evidence.** Update the table, the "Verified" date and the source URL
   in the file header; never estimate a price for a model that has none, count it as unpriced.
6. **Run the gate before every commit**, and never use `git commit --no-verify` here. A gate
   that finds nothing proves little: when you add a check, plant a violation, watch it fail,
   remove the plant. If the gate prints `names: SKIPPED`, the private files were absent and the
   name check did not run: do not report that as a pass (it is expected only in CI).
7. **Local server changes keep private paths refused.** Anything new that must not be served
   by URL goes into `scripts/dev-guard.ts` and into the refused list in
   `scripts/__tests__/release-guards.test.ts`, including case variants.
8. **Known lint warnings.** Biome reports three `useExhaustiveDependencies` warnings in
   `src/components/Widget.tsx`. They are deliberate (adding the dependency restarts the
   animations when the tab regains focus). Leave them unless asked.

## Adapting it to another machine

Copy `tracking.example.json` to `tracking.local.json` and set:

| Key | Purpose |
|---|---|
| `projectRoots` | directories whose first path segment is a project name (longest match wins) |
| `aliases` | raw folder names to canonical project names |
| `ignoreSegments` | path segments that are not projects (`node_modules`, `dist`, ...) |
| `categories` | project to category; `npm run publish-data` refuses to run while any is missing |
| `publicCategoryMerge` | local category to public one (for example `Personal` to `Other`) |
| `denylistExtra` | extra terms the gate always blocks: people, clients, usernames, emails |
| `denylistAllow` | expected hits, as `{ term: [file, ...] }`; cannot cover `public/data/` or `dist/` |
| `genericNames` | ordinary words the system word list lacks, treated as common words by the gate |
| `publicNames` | your projects that are public on purpose and linked from the repo; never a private one |

## Adding a provider

1. A reader in `scripts/` that extracts only usage events, with a stable per-response id for
   deduplication and a timestamp for the event day.
2. A pricing table with its source and date, and an unpriced path that counts without cost.
3. An aggregate in the private output, then an explicit public section in the contract and
   `publish.ts`, with tests.
4. Its own dashboard section. Do not add different providers' tokens or dollars together.
