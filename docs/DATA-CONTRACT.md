# Public data contract

`public/data/usage.json`, schema version 3. The authoritative definition is
`PUBLIC_SPEC` in `scripts/public-contract.ts`; `validatePublic()` rejects any file that has a
field not listed there, including unknown keys inside maps. Counting rules are in
[METHODOLOGY.md](METHODOLOGY.md); how to use the model and effort sections is in
[MODELS-AND-EFFORT.md](MODELS-AND-EFFORT.md).

Dates are local calendar dates of the machine that ran the collector, `YYYY-MM-DD`; months are
`YYYY-MM`. Money is USD at API list prices (API-equivalent), not billed amounts. Top-level
figures are Claude Code; the `openai` section is Codex; nothing adds the two together.

## Top level

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | number | `3` |
| `generatedAt` | date | the local day `publish-data` ran |
| `dateRange` | `{ start, end }` | first and last day with data |
| `overview` | object | all-time Claude Code totals |
| `daily` | array | one entry per day, no category split |
| `monthly` | array | one entry per month, with the category split |
| `byCategory` | map | all-time totals per category |
| `byModel` | map | all-time totals per Claude model |
| `toolUsage` | map | all-time tool calls per tool |
| `effort` | map | all-time usage per Claude model and effort level |
| `orchestration` | map | all-time sessions grouped by the model that ran the top level |
| `openai` | object, optional | Codex usage |

## `overview`

| Field | Meaning |
|---|---|
| `totalSessions` | top-level conversations |
| `totalAgentRuns` | subagent and workflow-agent runs |
| `totalMessages` | typed user messages |
| `totalTokens` | input + output + cache write + cache read |
| `totalCostUSD` | API-equivalent cost |
| `activeDays` | days with billed usage |

## `daily[]`

| Field | Meaning |
|---|---|
| `date` | the day |
| `sessionsStarted`, `agentRunsStarted` | counted once, on the day they started; these sum to the overview totals |
| `sessions` | transcripts (sessions and agent runs) with billed usage that day. Not a session count: a multi-day session appears on each day |
| `messages`, `toolCalls` | on the day they happened |
| `tokens` | `{ input, output, cacheCreation, cacheRead, total }` |
| `costUSD` | that day's API-equivalent cost |
| `byModel` | per model: `{ tokens, costUSD, sessions, agentRuns }`. `sessions`/`agentRuns` count those started that day that used the model; one session can use several models, so they overlap |
| `tools` | tool calls per tool that day; sums to `toolCalls` |

There is deliberately no per-day category split: a daily "Client work" series reads as a
timeline of one client engagement.

## `monthly[]`

| Field | Meaning |
|---|---|
| `month` | `YYYY-MM` |
| `costUSD`, `tokens` | the month's headline (the sum of its `daily` entries) |
| `byCategory` | per category: `{ tokens, costUSD, messages, sessions, agentRuns }`. Amounts sum to the month's headline; counts follow the session's main project |

## `effort`

`effort[model][level] = { responses, tokens, thinkingTokens, costUSD }`.

- `level` is what Claude Code logged for the turn: `low`, `medium`, `high`, `xhigh`, `max`;
  `unrecorded` for usage from before effort was logged; `other` for anything unexpected.
- `thinkingTokens` is part of `tokens.output`, and is 0 where the transcript did not report it.
- Summing every model and level gives the overview's cost and tokens.

## `orchestration`

`orchestration[topLevelModel]` groups top-level sessions by the model that carried most of
their cost, and files each agent run under the session that launched it:

| Field | Meaning |
|---|---|
| `sessions`, `messages` | top-level sessions in the group, and their typed messages |
| `main` | `{ tokens, costUSD }` of the top-level transcripts themselves |
| `subagents` | agents launched directly: `{ runs, costUSD, tokens, byModel }` |
| `workflows` | agents launched inside workflow fan-outs, same shape |

`byModel[agentModel] = { runs, costUSD }`, keyed by the model each agent run mostly used.
Summing `main` and both lanes over every group gives the overview cost, less any agent runs
whose parent session is missing from the logs.

## Allowed map keys

- **Categories:** `Client work`, `Own sites & products`, `AI infra & tooling`,
  `Creative & music`, `Writing`, `Learning & research`, `Other`. Personal work, civic work,
  unresolved projects and anything unattributed are all in `Other`.
- **Claude models:** the IDs in `src/lib/costs.ts`, plus `claude-other` for anything not on the
  published pricing page.
- **Claude effort levels:** `low`, `medium`, `high`, `xhigh`, `max`, `unrecorded`, `other`.
- **Tools:** Claude Code's built-in tool names (`BUILTIN_TOOLS` in the contract), `MCP` for
  every MCP tool, and `Other tools`.
- **OpenAI models:** the IDs in `src/lib/openaiCosts.ts`, plus `openai-other`.
- **OpenAI effort levels:** `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, `ultra`,
  `unrecorded`, `other`.

## `openai`

| Field | Meaning |
|---|---|
| `firstDate`, `lastDate` | range of Codex activity |
| `totals` | `{ responses, unpricedResponses, tokens, costUSD }` |
| `daily[]` | `{ date, responses, unpricedResponses, tokens, costUSD }` |
| `byModel` | per model: `{ responses, tokens, costUSD, priced }` |
| `effort` | `effort[model][level] = { responses, tokens, costUSD }`, level from each response's `turn_context` |

`tokens` here is `{ input, cachedInput, cacheWrite, output, reasoning }`, where `input`
includes cached tokens and `output` includes reasoning. `unpricedResponses` are counted but add
no cost.

## Invariants you can rely on

- For every day: the `byModel` costs sum to `costUSD` and `tools` sums to `toolCalls` (costs
  within a fraction of a cent, from per-entry rounding).
- For every month: the `byCategory` costs sum to the month's `costUSD` (same tolerance).
- Summing `daily` gives the overview: `sessionsStarted`, `agentRunsStarted`, `messages`,
  `tokens.total`, `costUSD`.
- Codex `effort` responses sum to `openai.totals.responses`.
- No field ever holds a project name, a session ID, a path, a time of day, or plan or
  rate-limit state.
