# Tutorial: Recording Traffic

Learn how to capture real traffic from a live MCP server and replay it for testing.

## Overview

This is the **alternative workflow** when you have access to a real MCP server. Instead of generating mock data, you capture actual responses and replay them exactly.

**Use this workflow when**:
- Have access to a real MCP server
- Need exact real responses (not AI-generated)
- Want to capture specific scenarios
- Doing regression testing
- Building a test suite from production traffic

## Prerequisites

- Node.js 20+
- mcpmock installed
- Access to a real MCP server
- A mcpdesc file

## Step-by-Step Guide

### Step 1: Start Recording (Proxy Mode)

`mcpmock record` acts as a transparent proxy between your client and the real server:

```bash
mcpmock record \
  --mcpdesc weather-server.mcpdesc.json \
  --port 3000 \
  --target http://real-weather-server:8080 \
  --output traffic.jsonl \
  --verbose
```

**What happens**:
- mcpmock listens on port 3000
- Forwards all requests to real server at port 8080
- Records request/response pairs to `traffic.jsonl`
- Returns real responses to your client

**Output**:
```
[MCPMOCK] Starting traffic recording proxy
[MCPMOCK] Listening on: http://localhost:3000
[MCPMOCK] Target server: http://real-weather-server:8080
[MCPMOCK] Output file: traffic.jsonl
[MCPMOCK] Ready to record traffic...
```

### Step 2: Run Your Tests

Point your client/tests to the proxy:

```bash
# Your client connects to proxy instead of real server
curl -X POST http://localhost:3000/v1/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get-current",
      "arguments": {"city": "London"}
    }
  }'

# Another request
curl -X POST http://localhost:3000/v1/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get-forecast",
      "arguments": {"city": "Paris", "days": 5}
    }
  }'
```

**Each request is recorded**:
```
[MCPMOCK] ← tools/call (get-current) {"city":"London"}
[MCPMOCK] → Response: 200 OK
[MCPMOCK] ✓ Recorded to traffic.jsonl
[MCPMOCK] ← tools/call (get-forecast) {"city":"Paris","days":5}
[MCPMOCK] → Response: 200 OK
[MCPMOCK] ✓ Recorded to traffic.jsonl
```

### Step 3: Stop Recording

Press `Ctrl+C` to stop:

```
^C
[MCPMOCK] Stopping recording...
[MCPMOCK] Recorded 5 interactions
[MCPMOCK] Output: traffic.jsonl (24.5 KB)
```

### Step 4: Inspect Recorded Traffic

Check what was captured:

```bash
cat traffic.jsonl
```

**Format** (JSONL - one JSON object per line). Each interaction is **two lines**
— a `request` and its `response` — linked by a shared `id`:

```json
{"timestamp":"2026-01-01T10:00:00.000Z","direction":"request","id":1,"method":"tools/call","params":{"name":"get-current","arguments":{"city":"London"}}}
{"timestamp":"2026-01-01T10:00:00.001Z","direction":"response","id":1,"result":{"content":[{"type":"text","text":"Current weather..."}]}}
{"timestamp":"2026-01-01T10:00:15.000Z","direction":"request","id":2,"method":"tools/call","params":{"name":"get-forecast","arguments":{"city":"Paris","days":5}}}
{"timestamp":"2026-01-01T10:00:15.001Z","direction":"response","id":2,"result":{"content":[{"type":"text","text":"5-day forecast..."}]}}
```

> **Authoring by hand?** See [Authoring Replay Datasets](authoring-replay-datasets.md)
> for the complete format specification and matching semantics — useful when a
> coding assistant generates a replay dataset from only a mcpdesc file.

### Step 5: Replay Recorded Traffic

Now run your mock server in replay mode:

```bash
mcpmock run \
  weather-server.mcpdesc.json \
  --replay traffic.jsonl \
  --transport streamable-http \
  --port 3000 \
  --verbose
```

**Behavior**:
- Matches incoming requests to recorded traffic
- Returns exact recorded responses
- Falls back to generated mocks if no match found

**Test it**:
```bash
# Same request as during recording
curl -X POST http://localhost:3000/v1/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get-current",
      "arguments": {"city": "London"}
    }
  }'

# Returns EXACT response that was recorded!
```

**Logs show**:
```
[MCPMOCK] ← tools/call (get-current) {"city":"London"}
[MCPMOCK] ✓ Replay match found
[MCPMOCK] → Returning recorded response
```

## Request Matching

mcpmock uses a 2-level smart matching strategy:

### Level 1: Exact Match (100% similarity)
Matches on:
1. **Method** (`tools/call`)
2. **Tool name** (`get-current`)
3. **Arguments** (exact match)

**Example**:
```json
// Recorded
{"name":"get-current","arguments":{"city":"London"}}

// ✅ Level 1: Exact match
{"name":"get-current","arguments":{"city":"London"}}
```

### Level 2: Similar Match (≥70% similarity)
Matches on method + tool name, with similar arguments:

```json
// Recorded
{"name":"get-current","arguments":{"city":"London","units":"celsius"}}

// ✅ Level 2: Similar match (83% similarity - 2 of 3 keys match)
{"name":"get-current","arguments":{"city":"London","units":"celsius","lang":"en"}}

// ❌ Below threshold (50% similarity - only method+tool match)
{"name":"get-current","arguments":{"city":"Paris"}}
```

### Fallback: Faker Generation
If no match meets the similarity threshold, mcpmock generates mock data using Faker.

**Similarity threshold** (default: 70%):
```bash
# Strict matching (90% threshold)
mcpmock run --replay traffic.jsonl --similarity-threshold 90 --port 3000

# Permissive matching (50% threshold)
mcpmock run --replay traffic.jsonl --similarity-threshold 50 --port 3000
```

**Debug mode** shows matching details:
```bash
mcpmock run --replay traffic.jsonl --debug --port 3000
```

Output:
```
[DEBUG] Request: tools/call (get-current) with arguments: {"city":"Paris"}
[DEBUG] Composite key: tools/call:get-current
[DEBUG] Found 2 candidates for composite key
[DEBUG] Candidate 1: similarity 50.00% ✗ (below 70% threshold)
[DEBUG] Candidate 2: similarity 33.33% ✗ (below 70% threshold)
[DEBUG] ✗ No match above 70% threshold, using Faker
```

## Importing mcptest Execution Logs

The `mcpmock import` command converts an **mcptest execution log** (JSON) into
the same replay JSONL format, so recorded test runs can be replayed directly:

```bash
mcpmock import \
  --execution-log execution-log.json \
  --output traffic.jsonl
```

**Output**:
```
[MCPMOCK] Converting executions to JSONL format...

✓ Import complete!
```

The result is the same two-line request/response JSONL described above. Note this
converts mcptest execution logs — not an existing `traffic.jsonl` — into replay
data. To use captured responses as per-tool `--data` override files instead,
edit them by hand or generate them with `mcpmock build`.

**Then run with replay**:
```bash
mcpmock run weather-server.mcpdesc.json --replay traffic.jsonl --port 3000
```

**See**: [mcptest Integration Tutorial](mcptest-integration.md) for more on `mcpmock import`

## Advanced Recording

### Recording Specific Scenarios

Run specific test scenarios while recording:

```bash
# Start recording
mcpmock record --mcpdesc api.mcpdesc.json --port 3000 --target http://prod-api:8080 --output scenarios/login-flow.jsonl &

# Run login test
npm run test:login

# Stop recording
pkill -INT mcpmock

# Replay login scenario
mcpmock run api.mcpdesc.json --replay scenarios/login-flow.jsonl --port 3000
```

### Multiple Scenario Files

Record different scenarios separately:

```bash
# Record error scenarios
mcpmock record --port 3000 --target http://api:8080 --output errors.jsonl
# Trigger error conditions...

# Record success scenarios  
mcpmock record --port 3000 --target http://api:8080 --output success.jsonl
# Trigger success paths...

# Combine for replay
cat errors.jsonl success.jsonl > combined.jsonl
mcpmock run --replay combined.jsonl --port 3000
```

### Production Traffic Capture

**⚠️ Warning**: Be careful recording production traffic

```bash
# Record production traffic (read-only, doesn't modify anything)
mcpmock record \
  --mcpdesc api.mcpdesc.json \
  --port 3000 \
  --target https://production-api.example.com \
  --output prod-traffic.jsonl

# Use in dev/staging
mcpmock run --replay prod-traffic.jsonl --port 3000
```

**Benefits**:
- Test with real production data
- Catch edge cases
- Regression testing

**Risks**:
- May contain sensitive data
- Large file sizes
- Requires mcpdesc file matching production API

## Comparison: Record vs Build

| Aspect | Record Workflow | Build Workflow |
|--------|----------------|----------------|
| **Requires real server** | ✅ Yes | ❌ No |
| **Data realism** | 100% real | AI-generated realistic |
| **Setup time** | Fast (if server available) | Fast (always available) |
| **Reproducibility** | Exact same responses | Consistent but generated |
| **Use case** | Regression, exact responses | Development, new projects |
| **Editing** | Manual JSON editing | Easy regeneration |

**When to use each**:
- **Record**: Regression testing, have real server, need exact responses
- **Build**: New projects, no server access, need flexibility

## Troubleshooting

### Proxy not forwarding requests

**Problem**: Requests timeout or fail

**Solution**:
```bash
# Check target server is reachable
curl http://real-server:8080/health

# Verify mcpdesc file matches real server
# Compare dump serverInfo with real server's initialize response
```

### No matches during replay

**Problem**: All requests fall back to generated mocks

**Solution**:
```bash
# Check JSONL file has content
wc -l traffic.jsonl

# Verify request format matches exactly
# Enable verbose logging
mcpmock run --replay traffic.jsonl --verbose
```

### Large JSONL files

**Problem**: traffic.jsonl is huge

**Solution**:
```bash
# Filter to specific tools only
grep '"name":"search"' traffic.jsonl > search-only.jsonl

# Or split by date/scenario during recording
```

## Real-World Example

Testing a CI/CD pipeline:

```bash
# 1. Record a full pipeline run
mcpmock record \
  --mcpdesc devnet-api.mcpdesc.json \
  --port 3000 \
  --target https://api.devnet.com \
  --output pipeline-success.jsonl

# 2. Run your pipeline (uses proxy)
export API_URL=http://localhost:3000/v1/mcp
npm run test:pipeline

# 3. Use recording for fast local testing
mcpmock run \
  --mcpdesc devnet-api.mcpdesc.json \
  --replay pipeline-success.jsonl \
  --port 3000

# 4. Run tests again (instant responses, no API calls)
npm run test:pipeline
```

## Next Steps

- 📖 Read [mcptest Integration](mcptest-integration.md) for test execution recordings
- 📖 Read [CI/CD Testing](ci-cd-testing.md) for automation
- 🔄 Try [Building Mocks](building-mocks.md) for alternative workflow

## Summary

```bash
# Complete workflow
mcpmock record --port 3000 --target http://real:8080 --output traffic.jsonl  # Record
# ... run tests ...
mcpmock run server.mcpdesc.json --replay traffic.jsonl --port 3000  # Replay
mcpmock import --execution-log run.json --output traffic.jsonl      # From mcptest log
```

**Key takeaways**:
- `mcpmock record` acts as recording proxy
- Captures exact request/response pairs
- `mcpmock run --replay` returns recorded responses with smart matching
- **2-level matching**: Exact match (100%) → Similar match (≥70%) → Faker fallback
- Use `--similarity-threshold` to tune matching strictness (default: 70%)
- Use `--debug` to see detailed matching analysis
- Convert mcptest execution logs to replay JSONL with `mcpmock import`
- Hand-author replay datasets from a mcpdesc file — see [Authoring Replay Datasets](authoring-replay-datasets.md)
- Best for regression testing with real server access
