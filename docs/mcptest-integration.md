# mcptest → mcpmock Integration Tutorial

## Overview

This tutorial demonstrates the complete workflow for converting test execution logs from **mcptest** into mock data for **mcpmock**, enabling fast, reliable testing without a live MCP server.

## Why This Integration?

### Problem
- Running tests against live MCP servers is slow (30-60 seconds)
- Server availability required for CI/CD
- Difficult to maintain consistent test environments
- Hard to test edge cases and error conditions

### Solution
- **mcptest**: Record real server responses with version tracking
- **mcpmock**: Replay recorded responses instantly (3-5 seconds)
- Fast, reliable, reproducible tests
- No server dependency in CI/CD

## Prerequisites

- **mcptest v0.5.0+** installed
- **mcpmock v0.2.3+** installed
- An MCP server to test (we'll use chess-coach v0.7.0)
- Server's mcpdesc file from mcpcontract

## Complete Workflow

### Step 1: Generate Test Scenarios

Start by generating test scenarios from your MCP server's mcpdesc file:

```bash
cd /path/to/mcp-test

# Generate scenarios from mcpdesc
mcptest generate \
  --mcpdesc ../chess-coach/mcpcontract/mcpdesc/v0.7.0-dump.json \
  --output tests/scenarios \
  --coverage basic
```

**Output**:
```
✓ Tools processed: 13
✓ Scenarios generated: 24
✓ Files created: 24
✓ Scenarios saved to: tests/scenarios
```

This creates 24 YAML test scenarios for chess-coach's 13 tools.

### Step 2: Record Execution Log

Record test executions against the live server:

```bash
# Create output directories
mkdir -p tests/execution-logs tests/golden

# Record execution log with version tracking
mcptest record \
  --scenarios tests/scenarios/ \
  --server stdio:///path/to/venv/bin/python?args=-m,chess_coach.mcp_server.server \
  --golden tests/golden \
  --export tests/execution-logs/v0.7.0.json \
  --env DATABASE_PATH=/path/to/chess_coach.db \
  --verbose
```

**Output**:
```
[MCPTEST] Loaded 24 scenario(s)
[MCPTEST] Connected to MCP server

Recording: analyze_opening - basic test
  ✓ analyze_opening (new)

...

[MCPTEST] ✓ Execution log written successfully
  Version: 1.0.0
  McpDesc Version: https://developer.cisco.com/mcp-description/schema/0.3.1
  Executions: 24
  Server: chess-coach v1.25.0

✓ Execution log exported to: tests/execution-logs/v0.7.0.json

Recording Summary
Recorded: 24

Golden files saved to: tests/golden
```

**What Was Created**:
1. **Execution Log** (`tests/execution-logs/v0.7.0.json`):
   - 24 tool call executions
   - Complete request/response data
   - Version metadata (dumpVersion, checksum, server info)
   - Timestamps and execution hashes

2. **Golden Files** (`tests/golden/*.golden.json`):
   - Expected responses for regression testing
   - Used by mcptest for validation

### Step 3: Convert to JSONL Format

Now convert the execution log to mcpmock's JSONL format:

```bash
cd /path/to/mcp-mock

# Import execution log
mcpmock import \
  --execution-log ../mcp-test/tests/execution-logs/v0.7.0.json \
  --output tests/mock-data/chess-coach-v0.7.0.jsonl \
  --verbose
```

**Output**:
```
[MCPMOCK] Starting import...
[MCPMOCK] Loaded execution log v1.0.0
[MCPMOCK] Server: chess-coach v1.25.0
[MCPMOCK] Executions: 24
[MCPMOCK] Converting executions to JSONL format...
[MCPMOCK] Generated 48 traffic entries (24 request/response pairs)

✓ Import complete!

Conversion Summary:
  Execution log:    ../mcp-test/tests/execution-logs/v0.7.0.json
  Server:           chess-coach v1.25.0
  Executions:       24
  Traffic entries:  48 (24 req/resp pairs)
  Output:           tests/mock-data/chess-coach-v0.7.0.jsonl

Next Steps:
  1. Run mock server with replay:
     mcpmock run <mcpdesc-file> --replay tests/mock-data/chess-coach-v0.7.0.jsonl
```

**JSONL Format**:
Each execution becomes two entries (request + response):

```json
{"timestamp":"2025-12-28T17:33:45.627Z","direction":"request","id":1,"method":"tools/call","params":{"name":"analyze_opening","arguments":{"opening_name":"example","player_color":"white"}}}
{"timestamp":"2025-12-28T17:33:45.627Z","direction":"response","id":1,"result":"No data found for opening: example"}
```

### Step 4: Run Mock Server

Start the mock server in replay mode:

```bash
# Run mock server with recorded traffic
mcpmock run \
  --mcpdesc ../chess-coach/mcpcontract/mcpdesc/v0.7.0-dump.json \
  --replay tests/mock-data/chess-coach-v0.7.0.jsonl \
  --verbose
```

**Output**:
```
[MCPMOCK] Starting mcpmock run command...
[MCPMOCK] Loading mcpdesc file: ../chess-coach/mcpcontract/mcpdesc/v0.7.0-dump.json
[MCPMOCK] Dump loaded: chess-coach v1.25.0
[MCPMOCK] Schema version: https://developer.cisco.com/mcp-description/schema/0.3.1
[MCPMOCK] Loading replay traffic from: tests/mock-data/chess-coach-v0.7.0.jsonl
[MCPMOCK] Loaded 24 responses for 1 methods
[MCPMOCK] Starting stdio server
[MCPMOCK] Starting MCP mock server
[MCPMOCK] Loaded mcpdesc: chess-coach v1.25.0
[MCPMOCK] Protocol: 2025-06-18
[MCPMOCK] Transport: stdio
[MCPMOCK] Capabilities: 13 tools | 0 resources | 4 prompts
[MCPMOCK] Ready. Waiting for client connection...
```

### Step 5: Test with mcptest

Now run your tests against the mock server (super fast!):

```bash
cd /path/to/mcp-test

# Test against mock server
mcptest run \
  --scenarios tests/scenarios/ \
  --server stdio:///path/to/mcp-mock/build/index.js?args=run,--mcpdesc,../chess-coach/mcpcontract/mcpdesc/v0.7.0-dump.json,--replay,tests/mock-data/chess-coach-v0.7.0.jsonl \
  --golden tests/golden \
  --golden-compare
```

**Benefits**:
- **Speed**: 3-5 seconds (vs 30-60 seconds with live server)
- **Reliability**: No server availability issues
- **Consistency**: Same responses every time
- **CI/CD Ready**: No external dependencies

## Version Management Workflow

When your server evolves to a new version:

### 1. Record New Version

```bash
cd /path/to/mcp-test

# Generate scenarios for v0.8.0
mcptest generate \
  --mcpdesc ../chess-coach/mcpcontract/mcpdesc/v0.8.0-dump.json \
  --output tests/scenarios-v0.8.0 \
  --coverage basic

# Record with incremental mode (preserves unchanged)
mcptest record \
  --scenarios tests/scenarios-v0.8.0/ \
  --server stdio:///path/to/venv/bin/python?args=-m,chess_coach.mcp_server.server \
  --golden tests/golden \
  --export tests/execution-logs/v0.8.0.json \
  --incremental \
  --env DATABASE_PATH=/path/to/chess_coach.db
```

**Output** (incremental):
```
Recording Summary
Recorded: 25
  New:       2  (new tools added)
  Modified:  3  (changed behavior)
  Unchanged: 20 (preserved from v0.7.0)
```

### 2. Merge Version Logs (Optional)

If you want to combine multiple versions:

```bash
mcptest merge-logs \
  --old tests/execution-logs/v0.7.0.json \
  --new tests/execution-logs/v0.8.0.json \
  --output tests/execution-logs/merged-v0.8.0.json
```

### 3. Import New Version

```bash
cd /path/to/mcp-mock

mcpmock import \
  --execution-log ../mcp-test/tests/execution-logs/v0.8.0.json \
  --output tests/mock-data/chess-coach-v0.8.0.jsonl
```

### 4. Update CI/CD Config

Update your CI pipeline to use the new mock data:

```yaml
# .github/workflows/test.yml
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    
    - name: Install dependencies
      run: |
        npm install -g @cisco_open/mcptoolkit-mock@latest
        npm install -g mcptest@latest
    
    - name: Run tests against mock
      run: |
        mcptest run \
          --scenarios tests/scenarios/ \
          --server stdio://mcpmock?args=run,--mcpdesc,mcpdesc/v0.8.0-dump.json,--replay,mock-data/chess-coach-v0.8.0.jsonl \
          --golden tests/golden \
          --golden-compare
```

## Advanced Use Cases

### Use Case 1: Error Scenario Testing

Record error responses:

```yaml
# tests/scenarios/error-invalid-tool.yaml
name: "Error handling - invalid tool name"
description: "Test error response for invalid tool"
tools:
  - name: "invalid_tool_name"
    arguments: {}
    assertions:
      - type: "error"
        expected: true
```

Record and import as usual - error responses are preserved in JSONL.

### Use Case 2: Multiple Server Versions

Maintain mock data for multiple versions:

```
tests/mock-data/
├── chess-coach-v0.7.0.jsonl  # Stable version
├── chess-coach-v0.8.0.jsonl  # Latest version
└── chess-coach-dev.jsonl     # Development branch
```

Switch between them:

```bash
# Test against stable
mcpmock run v0.7.0-dump.json --replay chess-coach-v0.7.0.jsonl

# Test against latest
mcpmock run v0.8.0-dump.json --replay chess-coach-v0.8.0.jsonl
```

### Use Case 3: Selective Replay

Import only specific tools:

```bash
# Filter execution log first
cat v0.7.0.json | jq '.executions |= map(select(.toolName | startswith("query_")))' > filtered.json

# Import filtered log
mcpmock import --execution-log filtered.json --output mock-data/query-tools-only.jsonl
```

## Performance Comparison

| Scenario | Live Server | Mock Server | Speedup |
|----------|-------------|-------------|---------|
| Single tool test | 2.5s | 0.2s | **12.5x** |
| 10 tool tests | 15s | 1s | **15x** |
| Full suite (24 tests) | 60s | 3s | **20x** |
| CI/CD pipeline | 5 min | 15s | **20x** |

## Troubleshooting

### Issue: Import Fails with "ENOENT"

**Symptom**:
```
Error: ENOENT: no such file or directory, open 'tests/mock-data/file.jsonl'
```

**Solution**: Create output directory first
```bash
mkdir -p tests/mock-data
```

### Issue: Mock Server Returns Wrong Responses

**Symptom**: Responses don't match expected values

**Possible Causes**:
1. **Stale execution log** - Re-record with latest server
2. **Version mismatch** - Ensure dump and execution log match
3. **Request order** - mcpmock replays in order, ensure test order matches

**Solution**:
```bash
# Re-record execution log
mcptest record --scenarios tests/scenarios/ --export execution-logs/latest.json ...

# Re-import
mcpmock import --execution-log execution-logs/latest.json --output mock-data/latest.jsonl
```

### Issue: Missing Responses in JSONL

**Symptom**: JSONL has fewer entries than expected

**Cause**: Execution log might have failed executions

**Solution**: Check execution log for errors:
```bash
cat execution-logs/v0.7.0.json | jq '.executions[] | select(.response.success == false)'
```

## Best Practices

### 1. Organize by Version

```
tests/
├── execution-logs/
│   ├── v0.7.0.json
│   ├── v0.8.0.json
│   └── v0.9.0.json
└── mock-data/
    ├── chess-coach-v0.7.0.jsonl
    ├── chess-coach-v0.8.0.jsonl
    └── chess-coach-v0.9.0.jsonl
```

### 2. Version Control Your Mock Data

Commit execution logs and JSONL files:
- Track changes over time
- Review diffs in PRs
- Reproducible tests across team

### 3. Use Incremental Recording

Always use `--incremental` when updating:
- Faster execution
- Preserves known-good responses
- Clear diff of changes

### 4. Automate the Pipeline

Create a script:

```bash
#!/bin/bash
# update-mocks.sh

set -e

VERSION=$1
SERVER_PATH=$2

echo "Updating mock data for version: $VERSION"

# Record execution log
cd mcp-test
mcptest record \
  --scenarios tests/scenarios/ \
  --server "stdio://$SERVER_PATH" \
  --golden tests/golden \
  --export "tests/execution-logs/v$VERSION.json" \
  --incremental

# Import to mock data
cd ../mcp-mock
mcpmock import \
  --execution-log "../mcp-test/tests/execution-logs/v$VERSION.json" \
  --output "tests/mock-data/chess-coach-v$VERSION.jsonl"

echo "✓ Mock data updated: tests/mock-data/chess-coach-v$VERSION.jsonl"
```

Usage:
```bash
./update-mocks.sh 0.8.0 /path/to/venv/bin/python
```

## Summary

The mcptest → mcpmock integration provides:

1. **Speed**: 20x faster tests (3s vs 60s)
2. **Reliability**: No server availability issues
3. **Consistency**: Deterministic responses
4. **Version Tracking**: Complete test history
5. **CI/CD Ready**: No external dependencies

### Complete Flow

```
1. mcpcontract convert    → Extract server capabilities
2. mcptest generate    → Create test scenarios
3. mcptest record      → Record real responses (with version tracking)
4. mcpmock import      → Convert to JSONL format
5. mcpmock run --replay → Fast mock testing
6. Repeat steps 3-5 for version updates
```

### Related Documentation

- [mcptest Execution Logs Tutorial](../../mcp-test/docs/tutorials/execution-logs-workflow.md)
- [mcptest CHANGELOG](../../mcp-test/CHANGELOG.md)
- [mcpmock CHANGELOG](../../CHANGELOG.md)
- [mcpcontract Documentation](../../mcp-contract/README.md)

## Feedback

Found an issue or have suggestions? Please report:
- GitHub Issues: mcpmock/issues or mcptest/issues
- Design Docs: `docs/build/`
