# Getting Started with mcpmock

Quick guide to get up and running with mcpmock in 5 minutes.


## What You'll Learn

- Install and run your first mock MCP server with HTTP transport
- Generate realistic mock data with `mcpmock build`
- Record real traffic with `mcpmock record`
- Test MCP servers using curl or MCP Inspector


## Prerequisites

- Node.js 20 or later
- Basic understanding of JSON-RPC protocol
- mcpmock 0.8+


## Installation

```bash
# Clone repository
git clone https://github.com/cisco-open/mcptoolkit-mock.git
cd mcptoolkit-mock

# Install dependencies and build
npm install
npm run build

# Create global symlink
npm link

# Verify installation
mcpmock --help
```

**Staying updated**:
```bash
cd mcptoolkit-mock
git pull
npm run build
# Command automatically uses latest version (thanks to npm link)
```


## Quick Start (60 seconds)

HTTP transport is recommended for testing, web applications, and development:

### 1. Start HTTP Mock Server

```bash
mcpmock run \
  --mcpdesc tests/fixtures/mcpdesc/weather-server.mcpdesc.json \
  --data examples/weather \
  --transport streamable-http \
  --port 3000 \
  --verbose
```

You should see:

```
[MCPMOCK] Starting MCP mock server
[MCPMOCK] Loaded mcpdesc: weather-server v1.0.0
[MCPMOCK] Transport: streamable-http
[MCPMOCK] Port: 3000
[MCPMOCK] Server listening on http://localhost:3000
```

### 2. Send HTTP Requests

Choose your preferred tool:

#### Option A: Using curl (HTTP/JSON-RPC)

Direct HTTP requests with full JSON-RPC protocol:

```bash
# Initialize
curl -X POST http://localhost:3000/v1/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl-client","version":"1.0.0"}}}'

# List tools
curl -X POST http://localhost:3000/v1/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# Call a tool
curl -X POST http://localhost:3000/v1/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get-forecast","arguments":{"city":"San Francisco","days":3}}}'
```

#### Option B: Using MCP Inspector CLI (Recommended)

[MCP Inspector CLI](https://github.com/modelcontextprotocol/inspector#cli-mode) provides cleaner syntax with automatic initialization:

```bash
# List tools
npx @modelcontextprotocol/inspector --cli http://localhost:3000 \
  --transport http \
  --method tools/list

# Call a tool (simple arguments)
npx @modelcontextprotocol/inspector --cli http://localhost:3000 \
  --transport http \
  --method tools/call \
  --tool-name get-forecast \
  --tool-arg city="San Francisco" \
  --tool-arg days=3

# Call a tool (with JSON arguments)
npx @modelcontextprotocol/inspector --cli http://localhost:3000 \
  --transport http \
  --method tools/call \
  --tool-name get-forecast \
  --tool-arg 'options={"format": "detailed", "includeHourly": true}'

# List resources
npx @modelcontextprotocol/inspector --cli http://localhost:3000 \
  --transport http \
  --method resources/list

# List prompts
npx @modelcontextprotocol/inspector --cli http://localhost:3000 \
  --transport http \
  --method prompts/list
```

**Benefits**: MCP-native tool, handles initialization automatically, cleaner syntax, ideal for scripting and automation.

👉 **See**: [Tutorial: HTTP Transport](docs/http-transport.md) for more examples

## Understanding the Components

### McpDesc Files

McpDesc files (`.mcpdesc.json`) contain the complete capability snapshot of an MCP server:

```json
{
  "mcpdesc": "0.6.0",
  "serverInfo": {
    "name": "weather-server",
    "version": "1.0.0",
    "protocolVersion": "2025-06-18"
  },
  "tools": [
    {
      "name": "get-forecast",
      "description": "Get weather forecast for a location",
      "inputSchema": { /* JSON schema */ }
    }
  ]
}
```

**Where to get mcpdesc files:**
- Generate from real servers using [mcpcontract](https://github.com/cisco-open/mcptoolkit-contract)
- Use the examples in `tests/fixtures/mcpdesc/`
- Write one by hand: follow the [MCP Description spec](https://github.com/cisco-open/mcptoolkit-contract/tree/main/spec) — the canonical source for the format

### Mock Data Overrides

Override files let you customize responses for specific tools. Simply create a JSON file named `<tool-name>.json`:

**File**: `examples/weather/get-forecast.json`
```json
{
  "forecast": [
    {
      "date": "2025-12-10",
      "temperature": {"high": 68, "low": 52, "unit": "F"},
      "conditions": "Partly cloudy"
    }
  ]
}
```

**Without overrides**, mcpmock generates realistic mock data based on the tool's input schema.

**With overrides**, your custom data is returned instead.

## Two Main Workflows

Mcpmock supports two primary ways to create mock data:

### Workflow 1: Build (Recommended)

Generate realistic mock data with AI assistance:

```bash
# Step 1: Generate mocks
mcpmock build \
  --mcpdesc weather-server.mcpdesc.json \
  --output my-mocks/ \
  --verbose

# Step 2: Run server with generated mocks
mcpmock run \
  --mcpdesc weather-server.mcpdesc.json \
  --data my-mocks/ \
  --port 3000
```

**When to use**: Starting new projects, need realistic test data, no access to real server.

👉 **Full guide**: [Tutorial: Building Mocks](docs/building-mocks.md)

### Workflow 2: Record

Capture real traffic from a live server and replay with smart matching:

```bash
# Step 1: Record (mcpmock acts as proxy)
mcpmock record \
  --mcpdesc weather-server.mcpdesc.json \
  --port 3000 \
  --target http://real-server:8080 \
  --output traffic.jsonl

# Step 2: Replay recorded traffic (smart matching)
mcpmock run \
  --mcpdesc weather-server.mcpdesc.json \
  --replay traffic.jsonl \
  --port 3000

# Exact matches return recorded responses (100% similarity)
# Similar matches return recorded responses (≥70% similarity by default)
# No match or low similarity falls back to Faker

# Optional: Tune similarity threshold (default: 70%)
mcpmock run \
  --mcpdesc weather-server.mcpdesc.json \
  --replay traffic.jsonl \
  --similarity-threshold 90 \
  --port 3000  # Stricter matching

# Optional: Debug matching logic
mcpmock run \
  --mcpdesc weather-server.mcpdesc.json \
  --replay traffic.jsonl \
  --debug \
  --port 3000
```

**When to use**: Have access to real server, need exact responses, regression testing, smart handling of argument variations.

👉 **Full guide**: [Tutorial: Recording Traffic](docs/recording-traffic.md)

### Manual Mock Creation (Advanced)

Rarely needed, but you can create mock files manually:

```bash
mkdir manual-mocks
cat > manual-mocks/get-forecast.json << 'EOF'
{
  "forecast": [
    {"date": "2026-01-02", "temp": 72, "conditions": "Sunny"}
  ]
}
EOF

mcpmock run server.mcpdesc.json --data manual-mocks/
```

👉 **Full guide**: [Tutorial: Manual Mocks](docs/manual-mocks.md)

## Common Usage Patterns

### Testing an MCP Client

```bash
# Start HTTP mock server
mcpmock run my-server.mcpdesc.json --port 3000 --verbose

# Connect your client to http://localhost:3000
```

### Development Workflow

1. **Get an mcpdesc** from your real MCP server:
   ```bash
   mcpcontract convert --config server.json --output my-server.mcpdesc.json
   ```

2. **Create custom responses** for key scenarios:
   ```bash
   mkdir mock-data
   # Create mock-data/<tool-name>.json files
   ```

3. **Test your integration**:
   ```bash
   mcpmock run my-server.mcpdesc.json --data mock-data --port 3000 --verbose
   ```

### Demo/POC Scenarios

Use mock data to showcase capabilities without live infrastructure:

```bash
# Prepare demo data
mkdir demo-responses
cat > demo-responses/search.json << 'EOF'
{
  "results": [
    {"id": 1, "name": "Webex API", "status": "active"},
    {"id": 2, "name": "Defense API", "status": "active"}
  ]
}
EOF

# Run demo
mcpmock run api-catalog.mcpdesc.json --data demo-responses --port 3000
```

## Protocol Deep Dive

### MCP Request/Response Format

MCP uses JSON-RPC 2.0 over HTTP. All tools return content in a specific format:

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get-forecast",
    "arguments": {"city": "San Francisco"}
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"forecast\": [...], \"location\": {...}}"
      }
    ]
  }
}
```

### Supported Methods

| Method | Description | Parameters |
|--------|-------------|------------|
| `initialize` | Start session | `protocolVersion`, `capabilities`, `clientInfo` |
| `tools/list` | Get available tools | None |
| `tools/call` | Execute a tool | `name`, `arguments` |
| `notifications/initialized` | Confirm initialization | None (notification) |

## Examples in This Repository

### 1. Weather Server (Simple)
**Location**: `tests/fixtures/mcpdesc/weather-server.mcpdesc.json`

Basic server with 2 tools demonstrating common patterns.

```bash
mcpmock run \
  --mcpdesc tests/fixtures/mcpdesc/weather-server.mcpdesc.json \
  --data examples/weather \
  --port 3000 \
  --verbose
```

**Test with curl**:
```bash
curl -X POST http://localhost:3000/v1/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get-current","arguments":{"city":"London"}}}'
```

**Test with MCP Inspector CLI**:
```bash
# List available tools
npx @modelcontextprotocol/inspector --cli http://localhost:3000 \
  --transport http \
  --method tools/list

# Call get-current tool
npx @modelcontextprotocol/inspector --cli http://localhost:3000 \
  --transport http \
  --method tools/call \
  --tool-name get-current \
  --tool-arg city=London

# Call get-forecast tool
npx @modelcontextprotocol/inspector --cli http://localhost:3000 \
  --transport http \
  --method tools/call \
  --tool-name get-forecast \
  --tool-arg city=London \
  --tool-arg days=5
```

### 2. API Inventory (Real-world)
**Location**: `tests/fixtures/mcpdesc/api-inventory.mcpdesc.json`

Production-like server from Cisco's API inventory with 5 tools demonstrating complex schemas.

```bash
mcpmock run \
  --mcpdesc tests/fixtures/mcpdesc/api-inventory.mcpdesc.json \
  --port 3000 \
  --verbose
```

**Test with curl**:
```bash
curl -X POST http://localhost:3000/v1/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search","arguments":{"q":"webex"}}}'
```

**Test with MCP Inspector CLI**:
```bash
# List organizations
npx @modelcontextprotocol/inspector --cli http://localhost:3000 \
  --transport http \
  --method tools/call \
  --tool-name list-organizations

# Search for APIs
npx @modelcontextprotocol/inspector --cli http://localhost:3000 \
  --transport http \
  --method tools/call \
  --tool-name search \
  --tool-arg q=webex

# Get statistics
npx @modelcontextprotocol/inspector --cli http://localhost:3000 \
  --transport http \
  --method tools/call \
  --tool-name stats \
  --tool-arg groupBy=organization
```

## Troubleshooting

### Connection Refused

Make sure the server is running on the expected port:

```bash
# Check if server is running
curl http://localhost:3000/health

# Or check the logs
mcpmock run my-server.mcpdesc.json --port 3000 --verbose
```

### Schema Validation Errors

Ensure your mcpdesc file matches schema v0.3.1:

```bash
# Check mcpdesc version
cat my-server.mcpdesc.json | jq '.version'
# Should output: "0.6.0"
```

### Tool Not Found

Check the tool name matches exactly:

```bash
# List available tools
cat my-server.mcpdesc.json | jq '.tools[].name'
```

# Next Steps (temporary - until npm deployment)
git clone https://github.com/cisco-open/mcptoolkit-mock.git
cd mcptoolkit-mock && npm install && npm run build && npm link

# Basic usage (HTTP transport)
mcpmock run <file.mcpdesc.json> --port 3000

# With custom mock data
mcpmock run <file> --data <directory> --port 3000

# Verbose logging
mcpmock run <file> --port 3000 --verbose

# Test with curl
curl -X POST http://localhost:3000/v1/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Test with MCP Inspector
npx @modelcontextprotocol/inspector http://localhost:3000
**Resources**:
- **Shell Completion**: Run `mcpmock completion bash` for tab-completion
- **AI Assistant**: Use `mcpmock agents` for AI-friendly command reference

## Additional Resources

- [MCP Specification](https://spec.modelcontextprotocol.io/) - Official protocol documentation
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) - Build real MCP servers
- [README.md](README.md) - Complete feature overview and usage guide
- [AGENTS.md](AGENTS.md) - Developer guide for extending mcpmock
- [CHANGELOG.md](CHANGELOG.md) - Version history and planned features

## Quick Reference

```bash
# Install
npm install -g @cisco_open/mcptoolkit_mock

# Basic usage
mcpmock run <file.mcpdesc.json>

# With custom mock data
mcpmock run <file> --data <directory>

# Verbose logging
mcpmock run <file> --verbose

# Get help
mcpmock --help
mcpmock run --help
```

---

**Ready to go?** Start with the weather example and experiment with the requests above! 🚀
