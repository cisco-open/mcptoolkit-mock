# Pagination Support in mcpmock

**Status**: Implemented  
**Version**: 0.8.0  
**Date**: January 9, 2026

## Overview

This document describes pagination support in `mcpmock run` to comply with the MCP specification while accommodating the static nature of mcpdesc files.

## MCP Specification Requirements

According to the [MCP Pagination Specification (2024-11-05)](https://modelcontextprotocol.info/specification/2024-11-05/server/utilities/pagination/), the following operations MUST support pagination:

- `tools/list`
- `prompts/list`
- `resources/list`
- `resources/templates/list`

### Pagination Model

**Request Format:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "params": {
    "cursor": "eyJvZmZzZXQiOjEwfQ=="  // Optional, base64-encoded
  }
}
```

**Response Format:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [...],
    "nextCursor": "eyJvZmZzZXQiOjIwfQ=="  // Present if more results exist
  }
}
```

**Key Requirements:**
1. Cursor is an opaque string (clients MUST NOT parse it)
2. Page size is determined by the server (not client)
3. Invalid cursors SHOULD return error code -32602
4. Missing `nextCursor` indicates end of results

## The Challenge: Static Dumps

McpDesc files contain **complete snapshots** of server data, not pagination state:

```yaml
tools:
  - name: search
  - name: get-card
  - name: stats
  # ... all tools in one array
```

There's no pagination metadata because dumps capture what a real server returned (which could be any page).

## Solution: Synthetic Pagination

### Design Principles

1. **Backward Compatible**: Default behavior returns all items (no pagination)
2. **Opt-in**: Use `--page-size` flag to enable pagination
3. **Replay Priority**: In replay mode, use recorded responses (ignore synthetic pagination)
4. **Spec Compliant**: Implement proper cursor handling and error codes

### Implementation Approach

#### Option 1: Synthetic Pagination (Implemented)

**CLI Flag:**
```bash
mcpmock run file.yaml --page-size 10
```

**Behavior:**
- `--page-size` unset (default): Return all items, no pagination
- `--page-size N`: Return N items per page with `nextCursor`
- Cursor format: Base64-encoded JSON `{"offset": 10}`
- Invalid cursor: Return error -32602

**Algorithm:**
```typescript
1. Extract cursor parameter from request
2. If cursor present:
   - Decode base64 → JSON → extract offset
   - Validate cursor (return error -32602 if invalid)
3. Slice array: items.slice(offset, offset + pageSize)
4. If more items exist:
   - Generate nextCursor with new offset
5. Return result with optional nextCursor
```

#### Cursor Format

Cursors are base64-encoded JSON:

```typescript
// Encode
const cursor = Buffer.from(JSON.stringify({ offset: 10 })).toString('base64');
// Result: "eyJvZmZzZXQiOjEwfQ=="

// Decode
const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
// Result: { offset: 10 }
```

This format is:
- **Opaque**: Clients can't rely on internal structure
- **Simple**: Easy to implement and debug
- **Extensible**: Can add more fields later (e.g., `{"offset": 10, "version": 1}`)

### Mode-Specific Behavior

#### 1. Replay Mode (`--replay traffic.jsonl`)

**Priority: Use recorded responses**

```typescript
if (replayMode && recordedResponse) {
  return recordedResponse; // Exact response from recording
}
```

**Rationale**: Replay mode captures real pagination behavior, including:
- Actual page sizes used by real server
- Real cursor formats
- Timing of requests

**Example**: If recording shows tools/list with cursor "abc123" returning 5 items, replay returns those exact 5 items.

#### 2. Mock-Data Mode (`--data ./mock-data`)

**Priority: Apply synthetic pagination**

Mock-data overrides affect `tools/call` responses, NOT list operations. List operations return data from the mcpdesc file, so:

```typescript
if (pageSize > 0) {
  // Apply synthetic pagination to dump.tools/prompts/resources
  return paginatedResult(dump.tools, cursor, pageSize);
}
```

**Rationale**: Mock-data files are for tool execution results, not list metadata.

#### 3. Faker Mode (no --data, no --replay)

**Priority: Apply synthetic pagination**

```typescript
if (pageSize > 0) {
  return paginatedResult(dump.tools, cursor, pageSize);
} else {
  return { tools: dump.tools }; // All items
}
```

**Rationale**: Pure mock mode uses dump data, paginated if requested.

### Pagination Summary Table

| Mode | List Operations | Pagination Source |
|------|----------------|-------------------|
| Replay | Use recording | Recorded responses |
| Mock-data + --page-size | Use dump + paginate | Synthetic from mcpdesc |
| Mock-data (no --page-size) | Use dump | All items (no pagination) |
| Faker + --page-size | Use dump + paginate | Synthetic from mcpdesc |
| Faker (no --page-size) | Use dump | All items (no pagination) |

## Implementation Details

### New CLI Option

```typescript
interface RunOptions {
  // ... existing options
  pageSize?: number; // Page size for list operations (default: undefined = no pagination)
}
```

### Updated Mock Server Constructor

```typescript
constructor(
  dump: McpDescFile,
  overrides: OverrideLoader,
  verbose: boolean,
  debug: boolean,
  replayer?: TrafficReplayer,
  exampleSimilarity: number,
  pageSize?: number  // NEW: optional page size
) {
  // ...
  this.pageSize = pageSize;
}
```

### Pagination Helper Method

```typescript
private paginateList<T>(
  items: T[],
  cursor: string | undefined,
  pageSize: number | undefined,
  listName: string
): { items: T[]; nextCursor?: string } | JSONRPCError {
  
  // No pagination if pageSize not set
  if (!pageSize) {
    return { items };
  }

  // Decode cursor to get offset
  let offset = 0;
  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
      if (typeof decoded.offset !== 'number' || decoded.offset < 0) {
        return {
          code: -32602,
          message: 'Invalid cursor: offset must be a non-negative number'
        };
      }
      offset = decoded.offset;
    } catch (error) {
      return {
        code: -32602,
        message: 'Invalid cursor: unable to decode'
      };
    }
  }

  // Check if offset is out of bounds
  if (offset >= items.length && items.length > 0) {
    return {
      code: -32602,
      message: 'Invalid cursor: offset out of bounds'
    };
  }

  // Slice items for current page
  const pageItems = items.slice(offset, offset + pageSize);

  // Generate nextCursor if more items exist
  const result: { items: T[]; nextCursor?: string } = { items: pageItems };
  if (offset + pageSize < items.length) {
    const nextOffset = offset + pageSize;
    result.nextCursor = Buffer.from(JSON.stringify({ offset: nextOffset })).toString('base64');
  }

  return result;
}
```

### Updated List Handlers

```typescript
private handleToolsList(request: JSONRPCRequest): JSONRPCResponse {
  this.log(`← tools/list`, CYAN);

  const params = request.params as { cursor?: string } | undefined;
  const cursor = params?.cursor;

  // Apply pagination
  const paginationResult = this.paginateList(this.desc.tools, cursor, this.pageSize, 'tools');
  
  // Handle pagination error
  if ('code' in paginationResult) {
    this.log(`→ Error: ${paginationResult.message}`, YELLOW);
    return {
      jsonrpc: '2.0',
      id: request.id!,
      error: paginationResult
    };
  }

  // Build response
  const response: JSONRPCResponse = {
    jsonrpc: '2.0',
    id: request.id!,
    result: {
      tools: paginationResult.items,
      ...(paginationResult.nextCursor && { nextCursor: paginationResult.nextCursor })
    }
  };

  const pageInfo = paginationResult.nextCursor 
    ? `page of ${paginationResult.items.length}, more available`
    : `${paginationResult.items.length} total`;
  this.log(`→ tools/list (${pageInfo})`, GREEN);
  
  return response;
}
```

## Testing Strategy

### Unit Tests

1. **No pagination** (default):
   ```typescript
   it('should return all tools when pageSize not set', () => {
     const server = new MockServer(dump, overrides, false, false, undefined, 0.7);
     const response = server.handleRequest({ method: 'tools/list', id: 1 });
     expect(response.result.tools).toHaveLength(dump.tools.length);
     expect(response.result.nextCursor).toBeUndefined();
   });
   ```

2. **First page**:
   ```typescript
   it('should return first page with nextCursor', () => {
     const server = new MockServer(dump, overrides, false, false, undefined, 0.7, 5);
     const response = server.handleRequest({ method: 'tools/list', id: 1 });
     expect(response.result.tools).toHaveLength(5);
     expect(response.result.nextCursor).toBeDefined();
   });
   ```

3. **Subsequent pages**:
   ```typescript
   it('should return second page using cursor', () => {
     const server = new MockServer(dump, overrides, false, false, undefined, 0.7, 5);
     const cursor = Buffer.from(JSON.stringify({ offset: 5 })).toString('base64');
     const response = server.handleRequest({ 
       method: 'tools/list', 
       id: 1,
       params: { cursor }
     });
     expect(response.result.tools[0].name).toBe(dump.tools[5].name);
   });
   ```

4. **Invalid cursor**:
   ```typescript
   it('should return error for invalid cursor', () => {
     const server = new MockServer(dump, overrides, false, false, undefined, 0.7, 5);
     const response = server.handleRequest({ 
       method: 'tools/list', 
       id: 1,
       params: { cursor: 'invalid-base64!' }
     });
     expect(response.error?.code).toBe(-32602);
   });
   ```

### Integration Tests

1. Test pagination across all list operations
2. Test replay mode ignores --page-size
3. Test pagination with mock-data mode
4. Test HTTP transport with pagination

## Usage Examples

### Default (No Pagination)

```bash
mcpmock run weather.yaml
```

Returns all items in single response.

### With Pagination

```bash
mcpmock run inventory.yaml --page-size 10
```

Returns 10 items per page with `nextCursor`.

### Replay Mode (Ignores --page-size)

```bash
mcpmock run inventory.yaml --replay traffic.jsonl --page-size 10
```

Uses recorded responses, ignores synthetic pagination.

### Mock-Data Mode

```bash
mcpmock run inventory.yaml --data ./mock-data --page-size 10
```

List operations paginated, tool calls use mock-data.

## Limitations & Trade-offs

### Limitations

1. **Synthetic cursors**: Not real server cursors, purely positional
2. **Fixed page size**: Client can't request specific page size
3. **In-memory only**: No cursor persistence across server restarts

### Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| No pagination | Simple, fast, backward compatible | Spec violation |
| Synthetic | Spec compliant, testable | Cursors are artificial |
| Replay-only | Accurate for recordings | Inconsistent behavior across modes |

## Future Enhancements

1. **Smart defaults**: Auto-enable pagination for large dumps (e.g., >50 items)
2. **Per-operation page sizes**: Different sizes for tools vs resources
3. **Cursor versioning**: Support evolving cursor formats
4. **Stateful cursors**: Persist cursor state for long-running tests

## References

- [MCP Pagination Specification](https://modelcontextprotocol.info/specification/2024-11-05/server/utilities/pagination/)
- [mcpmock Design Document](./mcpmock-design.md)
- [Replay Mode Design](./phase2-http-recording.md)
