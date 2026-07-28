# Authoring Replay Datasets (Design-First)

A precise specification of the `mcpmock` replay JSONL format, written for a
**coding assistant that must generate a replay dataset from scratch** using only
a mcpdesc file as the source of truth — no live server, no recording.

Use this when you want deterministic, hand-crafted responses for specific tool
invocations (for example: "when `get-customer` is called with `customerId=100`,
return Alice; with `customerId=999`, return a not-found error").

> This document is the authoritative format reference. It is derived from the
> source of truth: the `TrafficEntry` type in
> [../src/lib/types.ts](../src/lib/types.ts) and the loader/matcher in
> [../src/lib/traffic-replayer.ts](../src/lib/traffic-replayer.ts).

## 1. What a replay dataset is

A replay dataset is a **JSONL** file (one JSON object per line). `mcpmock run
--replay <file>` loads it and, for each incoming JSON-RPC request, returns a
recorded response instead of generating one with Faker.

JSONL rules:

- One complete JSON object per line.
- No surrounding `[` / `]`, and **no commas** between lines.
- Each line must be valid, self-contained JSON.
- Every interaction is **two lines**: a `request` and its `response`, linked by a
  shared `id`.

## 2. The entry schema (`TrafficEntry`)

Every line is one `TrafficEntry`:

```ts
interface TrafficEntry {
  timestamp: string;                          // ISO 8601, e.g. "2026-07-28T10:00:00.000Z"
  direction: "request" | "response";
  id: number | string | null;                // links a request to its response
  method?: string;                            // request only, e.g. "tools/call"
  params?: Record<string, unknown> | unknown[]; // request only
  result?: unknown;                           // response only (success)
  error?: {                                   // response only (failure)
    code: number;
    message: string;
    data?: unknown;
  };
}
```

Field usage by direction:

| Field       | `request` line          | `response` line                    |
| ----------- | ----------------------- | ---------------------------------- |
| `timestamp` | required (any valid ISO)| required (any valid ISO)           |
| `direction` | `"request"`             | `"response"`                       |
| `id`        | required to be matchable| must equal the request's `id`      |
| `method`    | required                | omit                               |
| `params`    | required for tool calls | omit                               |
| `result`    | omit                    | set for a successful response      |
| `error`     | omit                    | set instead of `result` for errors |

A `response` line carries **only** `id` plus either `result` **or** `error`. It
never contains `method` or `params`.

## 3. The minimal interaction

```jsonl
{"timestamp":"2026-07-28T10:00:00.000Z","direction":"request","id":"customer-100","method":"tools/call","params":{"name":"get-customer","arguments":{"customerId":"100"}}}
{"timestamp":"2026-07-28T10:00:00.001Z","direction":"response","id":"customer-100","result":{"content":[{"type":"text","text":"{\"customerId\":\"100\",\"name\":\"Alice\",\"status\":\"active\"}"}]}}
```

For a `tools/call`, `params` must be:

- `params.name` — the tool name (must match a tool in the mcpdesc file).
- `params.arguments` — an object whose keys/values satisfy that tool's
  `inputSchema`.

Tool results follow the MCP `CallToolResult` shape, most commonly:

```json
{ "content": [ { "type": "text", "text": "..." } ] }
```

The `text` field is frequently a JSON-stringified payload (note the escaped
quotes in the example above). It can also be plain prose — anything the tool
would return.

## 4. How matching works (this drives how you author)

For each incoming request, the replayer ([traffic-replayer.ts](../src/lib/traffic-replayer.ts))
does the following:

### 4.1 Composite key

Requests are grouped by a composite key:

- `tools/call` and `prompts/get` → `"<method>:<name>"` (e.g. `tools/call:get-customer`).
- Every other method → just `"<method>"` (e.g. `resources/read`).

Consequence: for `resources/read` and similar methods there is no name segment,
so **arguments are the only discriminator**. If you need different responses for
different resources, they must differ in their `params`/arguments.

### 4.2 Level 1 — exact argument match

Arguments are "cleaned" (keys named `_meta` or starting with `_` are removed),
sorted, and hashed (MD5). If an incoming request's argument hash equals a
recorded entry's hash, that recorded response is returned immediately. This is
the path you want for deterministic per-argument responses.

### 4.3 Level 2 — similarity match

If no exact match exists, the replayer scores each candidate under the same
composite key:

```
similarity = matchedWeight / max(keyCount(incoming), keyCount(recorded))
```

where each argument key contributes:

- `1.0` if the key exists in both **and** the JSON-stringified values are equal,
- `0.5` if the key exists in both but the values differ,
- `0` if the key is missing from one side.

The best candidate is returned only if its similarity is **≥ the threshold**
(default 70%, set with `--similarity-threshold`).

### 4.4 Level 3 — Faker fallback

If nothing meets the threshold, mcpmock ignores the dataset for that request and
generates data with Faker.

### 4.5 The returned `id`

The recorded `id` is used **only** to pair a request with its response at load
time. When responding, the replayer echoes the **incoming** request's JSON-RPC
`id`, not the recorded one. So your dataset `id`s are internal labels — they do
not need to match anything the client sends.

## 5. Authoring rules and pitfalls

1. **Use a unique `id` per interaction.** The loader stores requests and
   responses in maps keyed by `id`; reusing an `id` causes a later entry to
   silently overwrite an earlier one. Descriptive labels work well:
   `"get-customer-100"`, `"get-customer-missing"`.
2. **Pair every request with exactly one response** sharing the same `id`. An
   unpaired request is dropped (never matched); an unpaired response is ignored.
3. **`id: null` is skipped.** Notification-style entries with `id: null` are not
   indexed, so never use `null` for interactions you want replayed.
4. **Don't rely on `_`-prefixed arguments** — they are stripped before matching.
5. **Author one interaction per distinct argument set** you want to answer
   exactly, and run with `--similarity-threshold 100` for strict, deterministic
   behavior. Lower the threshold if you want a few recorded entries to cover
   nearby argument variations.
6. **Errors are first-class.** Emit `error` instead of `result` to simulate
   failures (see the worked example below).

## 6. Worked example (from a mcpdesc, by hand)

Given a mcpdesc that declares a `get-customer` tool with an `inputSchema`
requiring a `customerId` string, an agent can author three deterministic
outcomes — two successes and one error:

```jsonl
{"timestamp":"2026-07-28T10:00:00.000Z","direction":"request","id":"customer-100","method":"tools/call","params":{"name":"get-customer","arguments":{"customerId":"100"}}}
{"timestamp":"2026-07-28T10:00:00.001Z","direction":"response","id":"customer-100","result":{"content":[{"type":"text","text":"{\"customerId\":\"100\",\"name\":\"Alice\",\"status\":\"active\"}"}]}}
{"timestamp":"2026-07-28T10:00:01.000Z","direction":"request","id":"customer-200","method":"tools/call","params":{"name":"get-customer","arguments":{"customerId":"200"}}}
{"timestamp":"2026-07-28T10:00:01.001Z","direction":"response","id":"customer-200","result":{"content":[{"type":"text","text":"{\"customerId\":\"200\",\"name\":\"Bob\",\"status\":\"suspended\"}"}]}}
{"timestamp":"2026-07-28T10:00:02.000Z","direction":"request","id":"customer-missing","method":"tools/call","params":{"name":"get-customer","arguments":{"customerId":"999"}}}
{"timestamp":"2026-07-28T10:00:02.001Z","direction":"response","id":"customer-missing","error":{"code":-32004,"message":"Customer not found","data":{"customerId":"999"}}}
```

Run it deterministically:

```bash
mcpmock run server.mcpdesc.json \
  --replay customer-replay.jsonl \
  --similarity-threshold 100 \
  --debug
```

`--debug` prints the composite key, argument hash, and per-candidate similarity
for every request — the fastest way to confirm your entries match as intended.

## 7. A design-first authoring procedure

Given only a mcpdesc file, a coding assistant can build a dataset as follows:

1. Parse the mcpdesc and enumerate each tool, its `name`, and its `inputSchema`.
2. For each tool, decide the argument sets worth covering (happy paths, edge
   cases, and error cases). The `inputSchema` (required fields, enums, formats)
   guides realistic values.
3. For each argument set, emit a `request` line (`method: "tools/call"`,
   `params.name`, `params.arguments`) and a `response` line with a matching
   unique `id`.
4. Populate `result.content[0].text` with a realistic payload consistent with
   the tool's described output, or emit an `error` for failure scenarios.
5. Repeat for `prompts/get` (`params.name` + `params.arguments`) and other
   methods as needed; remember non-tool/prompt methods key on `method` alone.
6. Validate the file (Section 8), then run with `--similarity-threshold 100`
   for exact behavior or the default 70% for fuzzy coverage.

## 8. Validating a hand-authored file

Check every line is valid JSON:

```bash
jq -c . customer-replay.jsonl > /dev/null
```

Inspect direction/method per line:

```bash
jq -r '[.id, .direction, (.method // "")] | @tsv' customer-replay.jsonl
```

Confirm each `id` has exactly one request and one response:

```bash
jq -s 'group_by(.id) | map({id: .[0].id, entries: length, directions: map(.direction)})' customer-replay.jsonl
```

Then dry-run the matching with `--debug` and confirm each request resolves to a
recorded response rather than falling back to Faker.

## 9. Reference

- Format type: `TrafficEntry` in [../src/lib/types.ts](../src/lib/types.ts)
- Loader + matcher: [../src/lib/traffic-replayer.ts](../src/lib/traffic-replayer.ts)
- Recorder (writes this format): [../src/lib/traffic-recorder.ts](../src/lib/traffic-recorder.ts)
- Recording tutorial: [recording-traffic.md](recording-traffic.md)
- mcptest → JSONL conversion: [mcptest-integration.md](mcptest-integration.md)
