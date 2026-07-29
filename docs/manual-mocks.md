# Tutorial: Manual Mock Creation

Learn when and how to create mock data files manually.

## When to Use Manual Mocks

Manual mock creation is **rarely needed** but useful for:

- **Specific edge cases** not covered by AI/recording
- **Error scenarios** (timeouts, malformed data, etc.)
- **Boundary testing** (empty arrays, null values, max limits)
- **Custom test scenarios** requiring exact control
- **API design phase** (before real server exists)

**⚠️ For most cases, use**:
1. `mcpmock build` (AI-generated realistic data)
2. `mcpmock record` (capture real traffic)

## Mock Data Format

Each tool gets one JSON file: `<tool-name>.json`

### Basic Structure

```json
{
  "any": "data",
  "structure": "you want",
  "returned": true
}
```

That's it! No special wrapping needed.

## Examples

### Simple Response

**File**: `mocks/search.json`
```json
{
  "results": [
    {"id": 1, "name": "Item 1"},
    {"id": 2, "name": "Item 2"}
  ],
  "total": 2
}
```

### With Metadata

**File**: `mocks/get-user.json`
```json
{
  "user": {
    "id": "user-123",
    "name": "John Doe",
    "email": "john@example.com",
    "created": "2025-01-01T00:00:00Z"
  },
  "meta": {
    "requestId": "req-456",
    "timestamp": "2026-01-01T10:00:00Z"
  }
}
```

### Error Response

**File**: `mocks/failing-tool.json`
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "details": {
      "resourceId": "missing-123"
    }
  },
  "success": false
}
```

### Empty Response

**File**: `mocks/empty-results.json`
```json
{
  "results": [],
  "total": 0,
  "message": "No items found"
}
```

## Step-by-Step Guide

### 1. Identify Tools

List tools from your mcpdesc file:

```bash
cat my-server.mcpdesc.json | jq '.tools[].name'
```

Output:
```
"search"
"get-user"
"create-item"
```

### 2. Create Mock Directory

```bash
mkdir mocks
```

### 3. Create Mock Files

One file per tool:

```bash
# Search tool
cat > mocks/search.json << 'EOF'
{
  "results": [
    {
      "id": "api-001",
      "name": "Webex API",
      "version": "v1.2.0",
      "status": "active"
    },
    {
      "id": "api-002",
      "name": "Defense API",
      "version": "v2.0.0",
      "status": "active"
    }
  ],
  "total": 2,
  "page": 1
}
EOF

# Get user tool
cat > mocks/get-user.json << 'EOF'
{
  "id": "user-123",
  "name": "Test User",
  "role": "developer",
  "permissions": ["read", "write"]
}
EOF
```

### 4. Run Mock Server

```bash
mcpmock run \
  my-server.mcpdesc.json \
  --data mocks/ \
  --port 3000
```

### 5. Test

```bash
curl -X POST http://localhost:3000/v1/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "search",
      "arguments": {"query": "webex"}
    }
  }'
```

Returns your custom mock data!

## Advanced Patterns

### Parameterized Responses

Mock doesn't currently support dynamic responses based on arguments, but you can:

**Option 1: Use recording** for specific parameter combinations:
```bash
mcpmock record --mcpdesc my-server.mcpdesc.json --port 3000 --upstream http://real-server:8080 --output scenarios.jsonl
mcpmock run my-server.mcpdesc.json --replay scenarios.jsonl --port 3000
```

**Option 2: Create separate dumps** for different scenarios

### Complex Nested Data

```json
{
  "data": {
    "api": {
      "id": "api-catalog-v1",
      "metadata": {
        "name": "API Catalog",
        "version": "1.0.0",
        "endpoints": [
          {
            "path": "/search",
            "methods": ["GET", "POST"],
            "auth": "required"
          }
        ]
      }
    }
  }
}
```

### Array Responses

```json
[
  {"id": 1, "name": "First"},
  {"id": 2, "name": "Second"},
  {"id": 3, "name": "Third"}
]
```

## Testing Edge Cases

### Empty States

```json
{
  "items": [],
  "count": 0,
  "message": "No results found"
}
```

### Null Values

```json
{
  "user": {
    "id": "123",
    "name": "Test User",
    "avatar": null,
    "bio": null
  }
}
```

### Large Datasets

```bash
# Generate mock with many items
node -e '
const items = Array.from({length: 1000}, (_, i) => ({
  id: i + 1,
  name: `Item ${i + 1}`,
  value: Math.random()
}));
console.log(JSON.stringify({items, total: 1000}, null, 2));
' > mocks/large-dataset.json
```

### Timeouts/Delays

mcpmock doesn't support delay simulation, but you can:

```bash
# Use a real server with delays
# Or test timeout handling separately
```

## Comparison with AI Generation

| Aspect | Manual | AI Build |
|--------|--------|----------|
| **Effort** | High (write JSON) | Low (automatic) |
| **Realism** | Depends on you | High |
| **Consistency** | Manual effort | Automatic |
| **Edge cases** | Easy | Harder |
| **Maintenance** | Manual updates | Regenerate |

**Recommendation**: Use AI build by default, manual only for special cases.

## Real-World Example

Testing error handling:

```bash
mkdir error-scenarios

# Success case (use AI)
mcpmock build --mcpdesc api.mcpdesc.json --output error-scenarios/

# Override with error cases
cat > error-scenarios/get-user.json << 'EOF'
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User with ID user-999 not found"
  },
  "success": false
}
EOF

cat > error-scenarios/search.json << 'EOF'
{
  "error": {
    "code": "TIMEOUT",
    "message": "Search service timeout after 5000ms"
  },
  "success": false
}
EOF

# Test error handling
mcpmock run api.mcpdesc.json --data error-scenarios/ --port 3000
npm run test:error-handling
```

## Troubleshooting

### Mock not loading

**Problem**: mcpmock ignores your file

**Solution**:
```bash
# Check filename matches tool name EXACTLY
cat api.mcpdesc.json | jq '.tools[].name'  # Tool names
ls mocks/                                # Your files

# Check JSON is valid
jq . < mocks/my-tool.json
```

### Wrong data returned

**Problem**: Getting generated data instead of mock

**Solution**:
```bash
# Verify --data path is correct
mcpmock run api.mcpdesc.json --data mocks/ --verbose

# Check logs
# [MCPMOCK] Mock data: 3 overrides loaded  <- Should see this
```

## Next Steps

- 📖 Read [Building Mocks](building-mocks.md) for AI alternative
- 📖 Read [Recording Traffic](recording-traffic.md) for real responses
- 📖 Read [HTTP Transport](http-transport.md) for web integration

## Summary

```bash
# Create mock files
mkdir mocks
echo '{"data":"your mock"}' > mocks/tool-name.json

# Run with mocks
mcpmock run api.mcpdesc.json --data mocks/ --port 3000
```

**Key takeaways**:
- Manual mocks are rarely needed (use build/record instead)
- One JSON file per tool: `<tool-name>.json`
- Any JSON structure works
- Best for edge cases and error scenarios
- Use AI build for realistic data, manual for special cases
