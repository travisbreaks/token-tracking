# Methodology

How token-tracking turns local AI coding logs into numbers, and what those numbers mean.
Everything here is implemented in `scripts/collect.ts` (Claude Code), `src/lib/codexUsage.ts`
(Codex), `src/lib/costs.ts` and `src/lib/openaiCosts.ts` (pricing). The traps that shaped
these rules, with measurements, are in [GOTCHAS.md](GOTCHAS.md).

## Sources

| Tool | Where | What is read |
|---|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl` | One file per conversation or subagent run. Assistant lines carry `message.id`, `message.model` and `message.usage`; user lines carry the prompt; `tool_use` blocks carry tool names and inputs (file paths are used for project attribution). |
| OpenAI Codex | `~/.codex/sessions/**/*.jsonl` | Three kinds of line: `turn_context` (the model and reasoning effort in use) and `token_usage_record` (one per API response, with `response_id` and token counts) are top-level `type` values; rate-limit snapshots are lines with top-level `type: "event_msg"` and `payload.type: "token_count"`. Message content and `~/.codex/auth.json` are never read. |

## Units

- **Session:** a top-level Claude Code conversation transcript. Counted once, on the local
  day of its first event.
- **Agent run:** a subagent transcript (`agent-*.jsonl`). Counted separately from sessions,
  once, on its first day. Its tokens and cost are in every total.
- **Response:** one API call. Claude responses are identified by `message.id`, Codex
  responses by `response_id`.
- **Day:** the local calendar day of the event, in the time zone of the machine that runs the
  collector. A UTC date would split an evening's work across two days; collecting on a machine
  in another zone shifts the day boundaries.
- **Stub:** a transcript with no output tokens and no typed message is not a session (it is
  usually an empty or aborted file). Its usage, if any, still counts.

## The accounting rule

Every amount lands on the day the event happened:

| Amount | Lands on |
|---|---|
| Tokens and cost of a response | the day of the response |
| A user message | the day it was sent |
| A tool call | the day it was made |
| A session or agent run (the count) | the day it started |

This one rule is what makes the numbers reconcile under any date filter: for every day, the
category split, the model split and the tool counts add up to that day's headline. Assigning
a whole session to its start day breaks this for long or resumed sessions (see GOTCHAS).

## Counting each response once

A Claude response is written as several JSONL lines, one per content block, and each line
repeats the response's `usage`. Input and cache counts repeat unchanged; `output_tokens`
grows as the response streams, and the last line carries the final count. The collector
keeps, per `message.id`, the output already billed, and bills only the increase on later
lines. Input and cache tokens are billed on the first line only.

Replays are deduplicated the same way: a response once per `message.id`, a tool call once per
`tool_use.id`, a user message once per entry `uuid`. Transcripts are read in order of file
modification time, oldest first, so a replayed response is usually attributed to the session
that made the call. Copying or restoring files changes their modification time and can change
that attribution. Output growth is billed to the file where it appears, so if a later copy of
a response carries a larger final count, the later file gets the difference.

A line without a timestamp (rare) is counted on its session's first day.

Lines skipped entirely: lines with an `error`, and lines whose model is `<synthetic>`
(client-generated, not an API call). User entries that are tool results, or that start with
`<ide_`, are not counted as messages.

## Pricing: API-equivalent cost

Each response is priced at the provider's published pay-as-you-go list rates. This answers
"what would this usage have cost on the API?", not "what did I pay?". A subscription bills a
flat fee; the gap between the two is the point of showing both.

### Claude

```
cost = input          x base_input
     + output         x output_rate
     + cache_write_5m x base_input x 1.25
     + cache_write_1h x base_input x 2
     + cache_read     x cache_read_rate
```

- `cache_write_1h` comes from `usage.cache_creation.ephemeral_1h_input_tokens`;
  `cache_write_5m` is the rest of `usage.cache_creation_input_tokens`. Older transcripts
  without the breakdown are priced as 5-minute writes, which is a lower bound.
- `cache_read_rate` is not always 0.1 x input: it is 0.025x on Fable 5.1 and 0.05x on
  Opus 5.5. The table stores the per-model rate directly.
- Dated or suffixed model IDs resolve through a most-specific-first family match, so
  `fable-5-1` never prices as `fable-5`.

### OpenAI (Codex)

```
uncached = input_tokens - cached_input_tokens - cache_write_input_tokens
cost     = uncached x input + cached x cached_input + cache_write x cache_write_rate + output x output_rate
```

- `input_tokens` includes cached tokens (in real data, cached never exceeded input), and
  `output_tokens` includes reasoning tokens, which are reported but not charged twice.
- Cache writes are assumed to sit inside `input_tokens` as well. This is unverified: no Codex
  record in the data this was built on (about 10,400 responses) reported a cache write.
- Rates are the standard tier, short context. Prompts over 272K input tokens are billed at a
  long-context tier (2x input and cache, 1.5x output on GPT-6 Astra). Codex logs a 258,400
  token context window, so its requests stay in the short tier.
- The model of a response is the last `turn_context` model before it in the same file.
- Responses on a model with no published price are counted, with their tokens, but add no
  cost. The dashboard shows how many. They are never estimated.

Pricing tables are dated in their source comments and were last checked against the
providers' pages on 2026-09-28.

## Categories: an estimate

Every Claude session is attributed to projects by where its file operations happened: the
`file_path`, `path` and `notebook_path` inputs of tool calls (so a directory `path` given to a
search tool counts too), and absolute paths inside Bash commands, matched against configured
project roots. The transcript folder name under `~/.claude/projects/` (an encoded working
directory) is not used; each line's `cwd` is the fallback. A session that touched two projects is
split by the share of operations in each. With no file operations, the working directory
decides; with neither, the session is unattributed.

Projects map to categories in a local, gitignored config. The public view shows only
categories. This is an attribution estimate: it says where edits happened, not billed hours,
invoices or measured effort. Reads count as operations just like edits, so a session that
reads one project and edits another is split between the two.

## Effort and orchestration

- **Effort** is read from each assistant entry's `effort` field (Claude Code) and from the
  `turn_context` before each Codex response. Usage without one is `unrecorded`. Each response's
  tokens, thinking tokens and cost are added to its model and level.
- **Orchestration.** Every agent transcript sits under its parent session's folder, so each
  agent run is linked to the top-level session that launched it, as a direct subagent or
  inside a workflow. A transcript's model is the one that carried most of its cost. Top-level
  sessions are grouped by that model, with their agents' cost and models alongside.
- `npm run session-report` prints one session plus its agents, for measuring one arm of a
  paired comparison. See [MODELS-AND-EFFORT.md](MODELS-AND-EFFORT.md).

## Plan limits (local only)

- **Claude:** the local dashboard reads real utilization from the account usage endpoint
  that Claude Code itself uses (undocumented; the OAuth token comes from the macOS
  Keychain). No estimate is computed from token counts: the plan's limits are not published.
- **OpenAI:** the newest `rate_limits` snapshot in the Codex logs, chosen by event
  timestamp. It is as fresh as the last Codex response, and the gauge says "as of".

Neither is ever published.

## What is not counted

- Web search fees. Transcripts carry `usage.server_tool_use` counters, but in real data they
  were always zero even when the WebSearch tool was used, so the fee cannot be derived from
  the logs.
- Fast mode and data-residency multipliers. The fields exist (`usage.speed`,
  `usage.inference_geo`); in the data this was built on, `speed` was always `standard` or
  absent, and `inference_geo` was `not_available`, empty or absent. If yours show fast mode or
  a US-only inference setting, the cost here is low.
- Anything that happens outside these two tools' logs (other clients, API scripts, the web
  apps).
