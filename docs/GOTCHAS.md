# Gotchas

Traps found while building this, each with how it showed up and what the code does about it.
The measurements come from one real dataset: about 8,400 Claude Code transcript files and
10,400 Codex responses, January to September 2026. Counts drift slightly as new sessions are
written; the proportions hold. Your numbers will differ; the traps will
not. How the rules fit together is in [METHODOLOGY.md](METHODOLOGY.md).

## Claude Code transcripts

### 1. Every response is written several times

One API response becomes one JSONL line per content block (text, each parallel tool call),
and every line repeats the response's `usage`. Summing every line overcounts badly. Measured
against the deduplicated totals:

| Field | Naive sum of every line |
|---|---|
| input tokens | 2.90x |
| cache read tokens | 2.44x |
| output tokens | 2.75x |

Fix: bill each `message.id` once.

### 2. ...but "first line wins" undercounts output by a quarter

The repeated lines are streaming snapshots. Input and cache counts repeat unchanged (all but
40 of about 329,000 repeated lines), but `output_tokens` grows, and the final count is the
largest one seen (usually, not always, the last line). Keeping the first line per `message.id` missed **24.1% of all output tokens** (42.1M of
174.8M), across 64,931 of 238,706 responses. Output is the most expensive token type, so the
cost error is at least as large.

Fix (`scripts/collect.ts`): bill input and cache on the first line; for output (and thinking
tokens, which stream the same way), remember what was billed per id and bill only the increase
on each later line. Never subtract.

### 3. 1-hour cache writes cost more, and they are most of your cache writes

`cache_creation_input_tokens` is the total; `usage.cache_creation` splits it into
`ephemeral_5m_input_tokens` (1.25x input) and `ephemeral_1h_input_tokens` (2x input). Claude
Code writes mostly to the 1-hour cache: across 238,905 deduplicated responses, 1.03B tokens of
1-hour writes against 370M of 5-minute writes (74% one-hour). Pricing every write at the
5-minute rate understated total API-equivalent cost by about 9% in this dataset. Token counts
are unaffected, so a token-only check will not catch it.

The split usually sums to the total, but not always: 48 of about 568,000 lines disagree, 38 of
them with a total of 0 and a nonzero split. The collector trusts the total and bills the
1-hour share only up to it, so those few writes are priced at zero. Negligible here; worth
knowing.

### 4. Cache reads are not always 0.1x input

Fable 5.1 reads cost 0.025x input, Opus 5.5 reads 0.05x, everything else 0.1x. Store the
per-model read rate; do not derive it with one multiplier.

### 5. Tool calls and messages repeat too, within a file and across files

The same tool call can appear on more than one line of one transcript, and resumed sessions
replay earlier content into a new file. Before deduplication, 7.9% of tool calls in this
dataset (about 26,400) were duplicates, most of them within the same transcript and the rest
replayed into another one. (The exact split depends on which copy is read first.) 9.4% of typed user messages were duplicates of an entry already counted. Tokens
were not affected (responses were already deduplicated by `message.id`), which is exactly why
this went unnoticed. Recent transcripts show fewer of them; handle them anyway.

Fix: tool calls once per `tool_use.id`, user messages once per entry `uuid`, and read files
oldest first so the original session keeps the credit.

### 6. Most transcript files are subagents, not conversations

`agent-*.jsonl` files are agent runs: 7,182 of 8,238 active transcripts here. They live under
their parent session's folder, in two layouts:
`<project>/<session>/subagents/agent-*.jsonl` for agents launched directly, and
`<project>/<session>/subagents/workflows/<workflow>/agent-*.jsonl` for agents inside a workflow
fan-out. Counting files as sessions inflated "sessions" about 8x. Count them separately, keep
their tokens and cost in the totals (that usage is real), and use the folder to link each run
to the session that launched it.

### 7. Long sessions cross days, and resumed ones cross months

Putting a whole session on its start day made one month's category bars add up to 60% of that
month's headline cost, while all-time totals still matched to the cent. An all-time parity
check hides this. Put every amount on the day it happened, and test a single day and a single
month, not just the grand total.

### 8. Use the local day, not the UTC day

Evening work crosses UTC midnight. Bucketing by the UTC date splits one working day in two.
Key days in the machine's local time, and stamp the publish date the same way.

### 9. Lines that are not API calls

Skip lines with an `error`, and lines whose model is `<synthetic>` (written by the client,
not billed). User entries that are tool results, or that start with `<ide_`, are not typed
messages.

### 10. Token counts do not compare across model generations

Anthropic's pricing page notes that Claude 4.7 and later use a tokenizer that produces about
30% more tokens for the same text. A rise in tokens across a model change is not necessarily
more work.

## Codex logs

### 11. The model is not on the usage record, and the event types nest differently

`token_usage_record` carries tokens but no model. The model (and the reasoning effort) is on
the last `turn_context` before it in the same file. Parse in file order. Those two are
top-level `type` values; rate-limit snapshots are not: they are lines with top-level
`type: "event_msg"` and `payload.type: "token_count"`, with `payload.rate_limits`. A reader
that filters on top-level type finds no rate limits at all.

### 12. `input_tokens` already includes cached tokens

Price `input - cached - cache_write` at the input rate, cached at the cached rate. Adding them
double counts. Output likewise includes reasoning tokens. No record here ever reported a cache
write, so that part of the convention is unverified.

### 13. Long-context pricing exists, but Codex stays under it

GPT-6 Astra bills prompts over 272K input tokens at 2x input and cache and 1.5x output. Codex
logs a 258,400-token context window, so its requests stay in the short tier. If you price
other OpenAI traffic, check the prompt size per request.

### 14. The newest rate-limit snapshot is not in the newest file

Pick the `rate_limits` snapshot with the latest event timestamp. File modification order is
not event order: at one point here, the first snapshot in the most recently modified file was
weeks old. `rate_limits` has `primary` and `secondary` windows, each with `used_percent`,
`window_minutes` and `resets_at` (Unix seconds); `secondary` is usually null.

### 15. Some models have no published price

Codex logs include responses from models that have no published price. Count their responses
and tokens, add no cost, and say how many were unpriced. Estimating a price makes the total look precise and
be wrong. Publish them under a generic ID, not their internal names.

## Pricing in general

### 16. Prices change; date your table

While this was built, Anthropic cancelled a scheduled Claude price increase (the introductory
price became the standard one), and a model our OpenAI table had left unpriced turned out to
have a published price. Put the verification date and source URL next to every pricing
table, and re-check before publishing numbers.

### 17. Some costs are not in the logs at all

Transcripts carry `usage.server_tool_use` counters, but they were zero here even when web
search was used, so web search fees cannot be derived. Fast mode and data-residency
multipliers have fields (`usage.speed`, `usage.inference_geo`); check them before assuming
standard pricing. API-equivalent cost is a floor, not an invoice.

### 18. API-equivalent is not what you paid

On a subscription, the list-price figure measures usage, not spend. Label it that way
everywhere a number appears; a bare dollar sign reads as a bill.

## Models and effort

Full guidance, with measurements, is in [MODELS-AND-EFFORT.md](MODELS-AND-EFFORT.md).

### 19. Effort is logged, but only recently

Claude Code writes the effective effort level on each assistant entry (an `effort` field),
from mid-July 2026 in this data; Codex writes it on each `turn_context`. Older usage has no
level: report it as unrecorded rather than guessing. Thinking tokens
(`usage.output_tokens_details.thinking_tokens`) are likewise only on newer lines.

### 20. Effort is not a budget, and cost per response barely follows it

The higher-effort rows contained more output and a larger thinking share on average, but cost per
response is mostly context (cache reads), so it hardly moved: Fable 5.1 at xhigh averaged less
per response than at high. These observations do not establish whether higher effort increases
or reduces total responses, corrections or task cost. Compare settings per task, not per response.

### 21. Defaults differ by model

The API default effort is `high` on most models and `medium` on Opus 5.5. A setting carried
over from one model runs a different amount of thinking on another; calibrate per model.

### 22. Agents inherit the top-level model unless told otherwise

Claude Code picks an agent's model from the call's `model` parameter, then the agent file's
`model:`, then `CLAUDE_CODE_SUBAGENT_MODEL`, and finally the main conversation's model. With
nothing set, a session on the most expensive model generally launches its agents on it too.
The force override and built-in exceptions are covered in [MODELS-AND-EFFORT.md](MODELS-AND-EFFORT.md).

### 23. Main loops carried most cost in this dataset

Main loops carried 86.7% of all Claude Code cost here, and 95 to 99% of their tokens were
cache reads. Both top-level and agent models affect cost and capability. This dataset
identifies where cost accumulated; it does not establish the best arrangement for a different
task or prove that an agent model will have little effect on the bill.

## Publishing your numbers

Privacy traps (case-insensitive file systems, commit metadata, image metadata, build hashes,
the Git index versus the working tree) are in [PUBLISHING-SAFELY.md](PUBLISHING-SAFELY.md).
