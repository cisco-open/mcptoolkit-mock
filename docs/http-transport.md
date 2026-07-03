# Tutorial: HTTP Transport

Learn how to use mcpmock with HTTP transport for web application integration.

## Overview

HTTP transport is the recommended approach for:
- Web applications
- REST API-style testing
- Cross-language clients (Python, JavaScript, etc.)
- Browser-based testing
- Microservices architecture

**stdio transport** is for CLI tools and Node.js native MCP clients.

## Quick Start

### Start HTTP Server

```bash
mcpmock run \
  --mcpdesc weather-server.mcpdesc.json \
  --data mocks/ \
  --transport streamable-http \
  --port 3000
```

**Endpoint**: `http://localhost:3000/v1/mcp`

### Send Request with curl

```bash
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
```

## Client Examples

### JavaScript (fetch)

```javascript
// Initialize session
const initResponse = await fetch('http://localhost:3000/v1/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'web-client', version: '1.0.0' }
    }
  })
});
const init = await initResponse.json();

// Call tool
const toolResponse = await fetch('http://localhost:3000/v1/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'get-current',
      arguments: { city: 'Paris' }
    }
  })
});
const result = await toolResponse.json();
console.log(result.result.content[0].text);
```

### Python (requests)

```python
import requests

# Initialize
init_response = requests.post(
    'http://localhost:3000/v1/mcp',
    json={
        'jsonrpc': '2.0',
        'id': 1,
        'method': 'initialize',
        'params': {
            'protocolVersion': '2025-06-18',
            'capabilities': {},
            'clientInfo': {'name': 'python-client', 'version': '1.0.0'}
        }
    }
)

# Call tool
tool_response = requests.post(
    'http://localhost:3000/v1/mcp',
    json={
        'jsonrpc': '2.0',
        'id': 2,
        'method': 'tools/call',
        'params': {
            'name': 'get-forecast',
            'arguments': {'city': 'Tokyo', 'days': 3}
        }
    }
)

result = tool_response.json()
print(result['result']['content'][0]['text'])
```

### TypeScript (axios)

```typescript
import axios from 'axios';

const client = axios.create({
  baseURL: 'http://localhost:3000/v1/mcp',
  headers: { 'Content-Type': 'application/json' }
});

// Initialize
const initResponse = await client.post('', {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'ts-client', version: '1.0.0' }
  }
});

// Call tool
const toolResponse = await client.post('', {
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: {
    name: 'get-current',
    arguments: { city: 'London' }
  }
});

console.log(toolResponse.data.result);
```

## CORS Configuration

HTTP transport includes CORS headers by default:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

**Works in browser**:
```html
<!DOCTYPE html>
<html>
<body>
  <button onclick="callTool()">Get Weather</button>
  <pre id="result"></pre>

  <script>
  async function callTool() {
    const response = await fetch('http://localhost:3000/v1/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'get-current',
          arguments: { city: 'London' }
        }
      })
    });
    const data = await response.json();
    document.getElementById('result').textContent = JSON.stringify(data, null, 2);
  }
  </script>
</body>
</html>
```

## Using with Recording

Record HTTP traffic:

```bash
# Start recording proxy
mcpmock record \
  --mcpdesc api.mcpdesc.json \
  --port 3000 \
  --target http://real-api:8080 \
  --output traffic.jsonl

# Your HTTP client connects to http://localhost:3000/v1/mcp
# Traffic is recorded

# Replay
mcpmock run \
  --mcpdesc api.mcpdesc.json \
  --replay traffic.jsonl \
  --transport streamable-http \
  --port 3000
```

## Testing Workflow

### Development Setup

```bash
# Terminal 1: Start mock server
mcpmock run \
  --mcpdesc api.mcpdesc.json \
  --data mocks/ \
  --transport streamable-http \
  --port 3000 \
  --verbose

# Terminal 2: Run your tests
npm test

# Your tests hit http://localhost:3000/v1/mcp
```

### Integration Tests

```javascript
// test/api.test.js
describe('Weather API', () => {
  const API_URL = process.env.API_URL || 'http://localhost:3000/v1/mcp';

  it('should get current weather', async () => {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'get-current',
          arguments: { city: 'London' }
        }
      })
    });

    const data = await response.json();
    expect(data.result).toBeDefined();
    expect(data.result.content).toBeInstanceOf(Array);
  });
});
```

## Docker Integration

```dockerfile
# Dockerfile
FROM node:20

WORKDIR /app
RUN npm install -g @cisco_open/mcptoolkit_mock

COPY api.mcpdesc.json .
COPY mocks/ ./mocks/

EXPOSE 3000

CMD ["mcpmock", "run", \
     "--mcpdesc", "api.mcpdesc.json", \
     "--data", "mocks/", \
     "--transport", "streamable-http", \
     "--port", "3000"]
```

**docker-compose.yml**:
```yaml
version: '3'
services:
  mock-api:
    build: .
    ports:
      - "3000:3000"
  
  app:
    build: ./app
    environment:
      - API_URL=http://mock-api:3000/v1/mcp
    depends_on:
      - mock-api
```

## Port Configuration

```bash
# Default port 3000
mcpmock run api.mcpdesc.json --transport streamable-http

# Custom port
mcpmock run api.mcpdesc.json --transport streamable-http --port 8080

# Use environment variable
export PORT=8080
mcpmock run api.mcpdesc.json --transport streamable-http --port $PORT
```

## Troubleshooting

### Connection refused

**Problem**: Cannot connect to mock server

**Solution**:
```bash
# Check server is running
curl http://localhost:3000/health

# Verify port is not in use
lsof -i :3000

# Check firewall settings
```

### CORS errors in browser

**Problem**: Browser blocks requests

**Solution**: mcpmock includes CORS headers by default. If still seeing errors:
```bash
# Try with explicit localhost
curl http://127.0.0.1:3000/v1/mcp ...

# Check browser console for actual error
```

### Large payload errors

**Problem**: Request body too large

**Solution**: HTTP transport has reasonable limits. For very large payloads:
```bash
# Use stdio transport instead
mcpmock run api.mcpdesc.json --data mocks/
```

## Next Steps

- 📖 Read [Building Mocks](building-mocks.md) to generate test data
- 📖 Read [CI/CD Testing](ci-cd-testing.md) for automation
- 📖 Read [Recording Traffic](recording-traffic.md) for real responses

## Summary

```bash
# Start HTTP server
mcpmock run api.mcpdesc.json --transport streamable-http --port 3000

# Send POST requests to http://localhost:3000/v1/mcp
# Works with any HTTP client (curl, fetch, requests, axios, etc.)
```

**Key takeaways**:
- HTTP transport at `/v1/mcp` endpoint
- CORS enabled by default
- Works with any language/framework
- Same JSON-RPC format as stdio
- Best for web apps and cross-language clients
