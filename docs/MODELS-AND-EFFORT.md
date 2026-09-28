# Choosing a model and an effort level

Two dials, measured from real logs. This repo shows what each choice cost; the
[effort map](https://travismakes.org/effort-map/) ([source](https://github.com/travisbreaks/effort-map))
is the method for deciding. Use them together: the map says how to run a fair comparison,
this repo fills in the measured cost of each arm.

Numbers below are a snapshot of one real dataset (Claude Code and Codex logs, January to
September 2026, published 2026-09-28). They are observational: different rows are different
tasks and months, so they show where money went, not which setting is better. Your own logs
will show your own numbers in the dashboard's "Models and effort" section.

## Three separate decisions

1. **The top-level model**, the one running the conversation. It affects both cost and capability.
2. **Each agent's model.** It also affects both cost and capability.
3. **Effort**, per model. It influences reasoning and tool use without imposing a fixed budget.

They are independent. A cheap model at high effort and an expensive model at low effort are
both reasonable, for different work.

## 1. The top-level model is where the money goes

In this dataset the main loops (top-level conversations, excluding every agent they launched)
carried **86.7% of all Claude Code cost**. A main loop re-reads its growing context on every
turn: 95 to 99% of its tokens are cache reads. So the top-level model's per-token rates,
especially cache reads and output, decide the bill.

| Top-level model | Sessions | Per session | Per typed message | Main loop share |
|---|---|---|---|---|
| Opus 5.5 | 15 | $26.66 | $1.57 | 77% |
| Opus 5 | 229 | $16.57 | $2.65 | 96% |
| Fable 5.1 | 22 | $190.18 | $4.28 | 89% |
| Fable 5 | 16 | $195.27 | $4.58 | 81% |
| Opus 4.8 | 27 | $378.21 | $3.55 | 83% |
| Opus 4.7 | 180 | $106.95 | $2.91 | 90% |

Costs are API-equivalent and include the session's agents. Per session varies with how long
sessions run; per typed message is a count-based denominator, not an equal unit of work. Opus 5.5 is new here (15 sessions),
so treat its row as early.

Why the rates matter, per million tokens (published list prices, checked 2026-09-28):

| Model | Input | Output | Cache read | 1-hour cache write |
|---|---|---|---|---|
| Fable 5.1 | $10 | $50 | $0.25 | $20 |
| Opus 5.5 | $4 | $20 | $0.20 | $8 |
| Opus 5 | $5 | $25 | $0.50 | $10 |
| Sonnet 5 | $2 | $10 | $0.20 | $4 |

Opus 5.5 is cheaper than Fable 5.1 on every token class, including the cache reads that
dominate a main loop. (Opus 5 is the exception worth knowing: its cache reads cost twice
Fable 5.1's, so a naive "Fable costs 2x" rule is wrong for long sessions.)

**A hypothesis to test:** run the conversation on a lower-priced model and delegate selected
pieces to another model when that improves the result. The Opus 5.5 sessions here used
Fable 5.1, Sonnet 5 and Opus 5.5 agents and averaged less API-equivalent cost per typed
message than the Fable-led sessions. Different tasks, session lengths and dates could explain
that difference. No matched quality results establish which arrangement is better.

Lower rates and lower observed cost do not establish greater token efficiency. Test both
arrangements on the same work, count total tokens and cost, and judge the outputs against
the same checks (section 4). Treat model capability as something to evaluate for the task.

## 2. How Claude Code picks an agent's model

From the [subagents documentation](https://code.claude.com/docs/en/sub-agents), first match
wins in the normal configuration:

1. the `model` parameter on the individual agent call;
2. the agent definition's `model:` frontmatter (`inherit` means the main conversation's model);
3. the `CLAUDE_CODE_SUBAGENT_MODEL` environment variable;
4. **the main conversation's model** (the default).

As of Claude Code 2.1.257, `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` overrides that
normal precedence. With `CLAUDE_CODE_SUBAGENT_MODEL` set, it forces that model; without
it, agents use the main model. Forks and inheriting subagent skills have exceptions. Check
the linked vendor documentation and the running task's actual model before a comparison.

The default is the trap: with nothing set, every agent inherits the top-level model, so a
session on the strongest model launches agents on the strongest model too. Set a cheaper
default (for example `CLAUDE_CODE_SUBAGENT_MODEL=sonnet`) and name a stronger model on the
calls that need it.

An agent definition can also set `effort` (overrides the session's level) and `maxTurns` (stops
a runaway agent without forcing a model). These are separate dials: a cheap model at high
effort suits wide exploration; a reasoning agent can simply `inherit`.

The dashboard's "Who runs the top level" table shows, per top-level model, what its agents
actually ran on. Agent transcripts are linked to their parent session by folder (see
[METHODOLOGY.md](METHODOLOGY.md)).

## 3. Effort

From Anthropic's [effort documentation](https://platform.claude.com/docs/en/build-with-claude/effort):
effort covers **all** output tokens (thinking, text, and tool calls and their arguments;
lower effort also means fewer, terser tool calls). It is "a behavioral signal, not a strict
token budget". The API default is `high` on most models and `medium` on Opus 5.5. Changing the
top-level effort between requests restarts the prompt cache; on models that support it
(Fable 5.1, Opus 5.5, Opus 5 and a few others) a per-message effort change, in beta, keeps it.
Do not carry settings over from an earlier model; the levels are calibrated per model.

What the logs show, per response (all levels with at least 100 responses):

| Model | Effort | Responses | Output / response | Thinking share of output | Cost / response |
|---|---|---|---|---|---|
| Opus 5.5 | high | 2,321 | 912 | 41% | $0.129 |
| Opus 5.5 | xhigh | 1,106 | 1,096 | 47% | $0.131 |
| Fable 5.1 | medium | 497 | 1,151 | 25% | $0.414 |
| Fable 5.1 | high | 1,953 | 1,631 | 33% | $0.510 |
| Fable 5.1 | xhigh | 3,192 | 1,693 | 44% | $0.412 |
| Opus 5 | medium | 677 | 215 | 29% | $0.106 |
| Opus 5 | high | 5,611 | 1,035 | 31% | $0.242 |
| Opus 5 | xhigh | 14,425 | 952 | 27% | $0.216 |

| Codex model | Effort | Responses | Output / response | Reasoning share | Cost / response |
|---|---|---|---|---|---|
| gpt-6-astra | low | 475 | 154 | 7% | $0.180 |
| gpt-6-astra | medium | 1,580 | 444 | 14% | $0.241 |
| gpt-6-astra | high | 2,204 | 589 | 22% | $0.236 |
| gpt-6-astra | xhigh | 3,965 | 822 | 26% | $0.265 |
| gpt-6-astra | max | 144 | 1,046 | 28% | $0.293 |

How to read them:

- **These higher-effort rows have more output.** On Codex, output per response rises steadily
  from low to max and the reasoning share with it. On Claude it mostly rises, not always:
  effort is not a budget.
- **Cost per response barely follows effort.** Most of a response's cost is re-reading context,
  not thinking, so Fable 5.1 at xhigh averaged less per response than at high. The total cost of
  a setting depends on the whole task, including retries and corrections. Higher effort could
  increase or reduce the responses needed; these rows do not measure that effect.
- **Rows are different work.** Harder tasks get higher effort. Do not read a row as "xhigh
  costs X more"; read it as what that setting cost on the work it was used for.
- **`unrecorded`** rows are usage from before the tool logged effort (effort appears in Claude
  Code transcripts from mid-July 2026 in this data), and thinking tokens are only reported on
  newer lines.

## 4. Deciding: a paired comparison

The effort map's method: start with the lowest setting that reliably clears the work; raise it
only for an observed reason; when a run fails, diagnose before raising effort; compare two
settings on the same task against the same checks. Its
[comparison worksheet](https://github.com/travisbreaks/effort-map/blob/main/evals/comparison.md)
has a row for "API tokens and measured cost". This repo fills it:

```bash
# run arm A and arm B in fresh sessions, same prompt, same starting checkout
npm run collect
npm run session-report -- --latest          # or: -- <session-id prefix>
```

`session-report` prints the session plus every agent it launched: API-equivalent cost, tokens
by type, cost by model, responses by effort level, and elapsed time. It reads local data and
prints to the terminal only. Actual per-model spend requires a fresh collection; older
mixed-model snapshots are labeled unallocated rather than credited to the dominant model.

The same method answers the orchestration question: run one task with the strong model at the
top, and again with a cheaper top-level model that sends the hard part to the strong model as
an agent. Compare the checks passed and the two session reports.

## Limits

- API-equivalent cost is not a subscription bill. Plans meter usage in their own units and
  pools; this measures relative cost, not what you will be charged or when you hit a limit.
- One dataset, one person's work. The proposed orchestration pattern remains a hypothesis;
  these observations do not predict your savings or quality.
- Model and effort labels are not comparable across vendors or model generations.
