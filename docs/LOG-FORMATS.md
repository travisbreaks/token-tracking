# Log formats

What the lines this repo reads look like, so you can build your own reader. Values are
placeholders; the field names and nesting are real (Claude Code and Codex, September 2026).
Fields this repo does not use are omitted. Formats are not documented by the vendors and can
change; check a fresh file before relying on a field.

## Claude Code: `~/.claude/projects/<encoded working dir>/<session>.jsonl`

One file per conversation. Agent runs are separate files under the session's folder:
`<session>/subagents/agent-<id>.jsonl` and
`<session>/subagents/workflows/<workflow>/agent-<id>.jsonl`.

### Assistant line (one per content block of a response)

```json
{
  "type": "assistant",
  "uuid": "<uuid>",
  "timestamp": "2026-09-28T21:56:01.121Z",
  "sessionId": "<session id>",
  "cwd": "<working directory>",
  "isSidechain": false,
  "effort": "high",
  "perTurnEffort": "high",
  "message": {
    "id": "<message id>",
    "model": "claude-opus-5-5",
    "role": "assistant",
    "content": [
      { "type": "tool_use", "id": "<tool_use id>", "name": "Read", "input": { "file_path": "<path>" } }
    ],
    "usage": {
      "input_tokens": 3,
      "output_tokens": 412,
      "cache_creation_input_tokens": 1520,
      "cache_read_input_tokens": 88410,
      "cache_creation": { "ephemeral_5m_input_tokens": 0, "ephemeral_1h_input_tokens": 1520 },
      "output_tokens_details": { "thinking_tokens": 180 },
      "service_tier": "standard",
      "speed": "standard",
      "inference_geo": "not_available"
    }
  }
}
```

- Every line of one response repeats `message.id` and `usage`. Input and cache counts repeat;
  `output_tokens` (and `thinking_tokens`) grow line by line. Bill input and cache once, and
  output by increase. See [GOTCHAS.md](GOTCHAS.md) 1 and 2.
- `effort` is the turn's effort level. `perTurnEffort` is often null, and where present it
  matched `effort` on every line checked; this repo reads `effort`.
- `model` is `<synthetic>` on client-generated lines, which are not API calls.
- A line can carry an `error` field instead of a normal response; skip it.
- `speed` and `output_tokens_details` are absent on older lines.

### User line

```json
{
  "type": "user",
  "uuid": "<uuid>",
  "timestamp": "2026-09-28T21:55:58.004Z",
  "sessionId": "<session id>",
  "cwd": "<working directory>",
  "message": { "role": "user", "content": "the prompt text" }
}
```

A typed message has string `content`, or a content array with a `text` block. Tool results
come back as user lines whose content is `tool_result` blocks; they are not typed messages.

## Codex: `~/.codex/sessions/**/*.jsonl`

### Turn context: the model and effort for the responses that follow

```json
{ "type": "turn_context", "timestamp": "...", "payload": { "model": "gpt-6-astra", "effort": "xhigh" } }
```

### One API response

```json
{
  "type": "token_usage_record",
  "timestamp": "...",
  "payload": {
    "response_id": "<response id>",
    "usage": {
      "input_tokens": 27815,
      "cached_input_tokens": 4864,
      "cache_write_input_tokens": 0,
      "output_tokens": 216,
      "reasoning_output_tokens": 151,
      "total_tokens": 28031
    }
  }
}
```

`input_tokens` includes the cached tokens; `output_tokens` includes the reasoning tokens. The
model is not on this line: take it from the last `turn_context` before it.

### Rate limits and context window

```json
{
  "type": "event_msg",
  "timestamp": "...",
  "payload": {
    "type": "token_count",
    "info": { "model_context_window": 258400, "last_token_usage": { "...": "same shape as usage above" } },
    "rate_limits": {
      "plan_type": "<plan>",
      "primary": { "used_percent": 11.0, "window_minutes": 10080, "resets_at": 1790000000 },
      "secondary": null,
      "rate_limit_reached_type": null
    }
  }
}
```

The top-level `type` is `event_msg`; `token_count` is `payload.type`. `resets_at` is Unix
seconds. Pick the snapshot with the latest `timestamp`, not the one in the newest file.
