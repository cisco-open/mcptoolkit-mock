# Tutorial: Building Mocks with AI

Learn how to generate realistic mock data using `mcpmock build` with AI assistance.

## Overview

This is the **primary workflow** for mcpmock. You generate realistic, contextually-appropriate mock data files, then run a mock server that serves this data consistently.

**Use this workflow when**:
- Starting a new project
- Don't have access to a real MCP server
- Need realistic test data without manual creation
- Want consistent, reproducible responses

## Prerequisites

- Node.js 20+
- mcpmock installed (`npm install -g @cisco_open/mcptoolkit_mock`)
- A mcpdesc file from mcpcontract

## Step-by-Step Guide

### Step 1: Get a McpDesc File

You need a mcpdesc file that describes your MCP server's capabilities:

```bash
# Option A: Use mcpcontract to capture from real server
mcpcontract convert --config server.json --output my-server.mcpdesc.json

# Option B: Use an example from mcpmock
cp tests/fixtures/mcpdesc/weather-server.mcpdesc.json ./
```

### Step 2: Generate Mock Data

Run `mcpmock build` to generate mock files:

```bash
mcpmock build \
  --mcpdesc weather-server.mcpdesc.json \
  --output mocks/ \
  --verbose
```

**Output**:
```
[MCPMOCK] Starting mcpmock build command...
[MCPMOCK] Loading mcpdesc file: weather-server.mcpdesc.json
[MCPMOCK] Dump loaded: weather-server v1.0.0
[MCPMOCK] Tools: 2
[MCPMOCK] Analyzing parameter relationships...
[MCPMOCK] Detected 1 shared parameter(s)
Found 1 shared parameter(s):

- **city** (string): Used in 2 tools
  Tools: get-forecast, get-current
  Suggested values: London, Paris, Tokyo

[MCPMOCK] Found Copilot CLI: /path/to/copilot
[MCPMOCK] ✓ Generated with AI assistance (Copilot CLI)

✓ Generated 2 tool mock(s) with ai mode
ℹ Detected relationships: city
✓ Created: mocks/get-forecast.json
✓ Created: mocks/get-current.json

Next: Test with: mcpmock run weather-server.mcpdesc.json --data mocks/
```

### Step 3: Review Generated Files

Check what was created:

```bash
ls -la mocks/
# get-forecast.json
# get-current.json

cat mocks/get-current.json
```

**Example AI-generated mock** (Tokyo weather):
```json
{
  "content": [
    {
      "type": "text",
      "text": "Current weather in Tokyo:\n\nTemperature: 8°C\nConditions: Clear sky\nHumidity: 45%\nWind: 8 km/h E"
    }
  ],
  "meta": {
    "city": "Tokyo",
    "units": "celsius",
    "coordinates": {
      "lat": 35.6762,
      "lon": 139.6503
    }
  }
}
```

**Notice**:
- ✅ Realistic data (Tokyo coordinates, winter temperature)
- ✅ Consistent city across both files ("Tokyo")
- ✅ Proper JSON structure
- ✅ Ready to use immediately

### Step 4: Run Mock Server

Use the generated mocks with your mock server:

```bash
# Stdio transport (CLI tools)
mcpmock run \
  --mcpdesc weather-server.mcpdesc.json \
  --data mocks/ \
  --verbose

# HTTP transport (web apps) - recommended
mcpmock run \
  --mcpdesc weather-server.mcpdesc.json \
  --data mocks/ \
  --transport streamable-http \
  --port 3000 \
  --verbose
```

### Step 5: Test the Mock Server

**With HTTP**:
```bash
curl -X POST http://localhost:3000/v1/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get-current",
      "arguments": {"city": "Tokyo"}
    }
  }'
```

**With stdio**:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get-current","arguments":{"city":"Tokyo"}}}' | \
  mcpmock run weather-server.mcpdesc.json --data mocks/
```

**Response**: You'll get the realistic Tokyo weather data every time!

## AI Generation Options

### Option 1: Copilot CLI (Automatic)

If you have VS Code with GitHub Copilot installed, mcpmock automatically detects and uses Copilot CLI:

```bash
mcpmock build --mcpdesc server.mcpdesc.json --output mocks/
# Uses Copilot CLI if available
```

### Option 2: Skip AI (Use Faker)

Generate basic type-appropriate data without AI:

```bash
mcpmock build --mcpdesc server.mcpdesc.json --output mocks/ --no-ai
```

**Faker generates**:
- Strings: random values
- Numbers: random numbers
- Booleans: random true/false
- Arrays/objects: empty or simple structures

**Still respects**:
- Relationship analysis (shared parameters stay consistent)
- JSON schema types

## Understanding Relationship Analysis

The relationship analyzer detects parameters used in multiple tools:

```
Found 2 shared parameter(s):

- **city** (string): Used in 3 tools
  Tools: get-current, get-forecast, get-alerts
  Suggested values: London, Paris, Tokyo, New York

- **units** (string): Used in 2 tools
  Tools: get-current, get-forecast
  Suggested values: celsius, fahrenheit
```

**Benefits**:
- AI generates **consistent** values (same city in all tools)
- More realistic test scenarios
- Easier to reason about test data

## Customizing Generated Mocks

After generation, you can edit the JSON files:

```bash
# Edit a generated file
code mocks/get-current.json

# Change city to your preferred location
# Adjust temperatures, conditions, etc.
```

**Tip**: Keep edits minimal. Regenerate with `--no-ai` if you want different random data.

## Real-World Example

Let's build mocks for a complex API:

```bash
# 1. Get dump from real server
mcpcontract convert --config api-inventory.json --output api-inventory.mcpdesc.json

# 2. Generate mocks
mcpmock build \
  --mcpdesc api-inventory.mcpdesc.json \
  --output api-mocks/ \
  --verbose

# Output shows relationships:
# Found 3 shared parameter(s):
# - organization (string): Used in 5 tools
# - limit (number): Used in 4 tools
# - offset (number): Used in 4 tools

# 3. Run server on specific port
mcpmock run \
  --mcpdesc api-inventory.mcpdesc.json \
  --data api-mocks/ \
  --transport streamable-http \
  --port 8080

# 4. Test from your application
# Your app connects to http://localhost:8080/v1/mcp
```

## Troubleshooting

### "No AI generation method available"

**Problem**: Copilot CLI not found

**Solution**:
1. Install GitHub Copilot in VS Code
2. Or use `--no-ai` flag for faker generation

```bash
mcpmock build --mcpdesc server.mcpdesc.json --output mocks/ --no-ai
```

### Generated data doesn't match expectations

**Problem**: AI generated unrealistic data

**Solution**:
1. Edit the JSON files manually
2. Regenerate with `--no-ai` for different random data
3. Provide better descriptions in your mcpdesc file's tool schemas

### Shared parameters not consistent

**Problem**: Same parameter has different values in different tools

**Solution**: This is a bug. Check that:
1. Parameter names are exactly the same (case-sensitive)
2. You're using AI generation (not `--no-ai`)
3. Report issue if problem persists

## Next Steps

- ✅ Use generated mocks in your tests
- 📖 Read [HTTP Transport Tutorial](http-transport.md) for web integration
- 📖 Read [CI/CD Testing Tutorial](ci-cd-testing.md) for automation
- 🔄 Try [Recording Traffic Tutorial](recording-traffic.md) for alternative workflow

## Summary

```bash
# Complete workflow
mcpmock build --mcpdesc server.mcpdesc.json --output mocks/     # Generate
mcpmock run server.mcpdesc.json --data mocks/ --port 3000  # Run
curl -X POST http://localhost:3000/v1/mcp -d '{...}'     # Test
```

**Key takeaways**:
- `mcpmock build` generates realistic, consistent mock data
- AI creates contextually-appropriate responses
- Relationship analyzer ensures consistency
- Generated files work immediately with `mcpmock run`
- Edit files manually if needed
