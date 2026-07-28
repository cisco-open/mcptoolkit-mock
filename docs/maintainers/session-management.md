# MCP Session Management Design

**Status**: Implemented (v0.5.1)  
**Created**: 2026-01-02  
**Last Updated**: 2026-01-02

---

## Executive Summary

The Model Context Protocol (MCP) **explicitly standardizes** session management for Streamable HTTP transport via the `Mcp-Session-Id` header (June 2025 spec: 2025-06-18) or `MCP-Session-Id` (November 2025 spec: 2025-11-25). This document covers:

- What the MCP specification defines
- How official SDKs implement it (with current bugs/limitations)
- How mcpmock should handle session management in recording/replay
- Future enhancements for mcpdesc schema integration

---

## 1. MCP Specification: Session Management

### 1.1 June 2025 Specification (2025-06-18)

**Source**: [Model Context Protocol - Transports](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)

**Key Points**:

- **Session Definition**: MCP session = all interactions starting from initialization
- **Session ID Assignment**: Server **MAY** assign session ID during initialization by returning `Mcp-Session-Id` response header on `InitializeResult`
- **Client Requirements**: If server returns session ID:
  - Clients **MUST** send same ID in `Mcp-Session-Id` request header on **all subsequent HTTP requests**
  - Clients that get 404 for a request with `Mcp-Session-Id` **MUST** start new session
  - Clients that are done **SHOULD** send HTTP DELETE with `Mcp-Session-Id` to terminate session
- **Server Requirements**: If server requires session ID:
  - Server **SHOULD** respond with **400 Bad Request** when header missing (except first initialization)
  - Server **MUST** respond with **404 Not Found** for terminated/unknown session IDs
  - Server MAY terminate session at any time

### 1.2 November 2025 Specification (2025-11-25)

**Source**: [Model Context Protocol - Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

**Changes from June 2025**:
- Header name capitalization changed from `Mcp-Session-Id` to `MCP-Session-Id` in spec text
- Semantics remain identical
- Added `MCP-Protocol-Version` header for protocol versioning (separate from session management)

**Important Note**: HTTP headers are **case-insensitive** (RFC 7230), so `Mcp-Session-Id`, `MCP-Session-Id`, and `mcp-session-id` are all equivalent on the wire.

### 1.3 What the Spec Does NOT Standardize

The MCP spec **does not** standardize:
- Cookie-based session management
- URL query/path parameter session IDs
- Bearer token authentication as session identifiers
- Alternative header names (e.g., `X-Session-ID`, `Session-Id`)

Authentication is handled separately under the **Authorization** section, not via session headers.

---

## 2. SDK Implementations & Real-World Behavior

### 2.1 Python SDK (`modelcontextprotocol/python-sdk`)

**Implementation**:
- `FastMCP` supports both **stateful** and **stateless** modes
- Stateful mode uses `Mcp-Session-Id` header (lowercase 'cp')
- CORS configuration explicitly exposes `Mcp-Session-Id` header
- Stateless mode: `stateless_http=True` disables session management

**Example**:
```python
mcp = FastMCP("My App")
mcp.run(transport="streamable-http")  # Stateful with Mcp-Session-Id
```

**Known Issues**:
- Issue #808: Some servers incorrectly expect `X-Session-ID` instead of spec-compliant `Mcp-Session-Id`
- Maintainers confirmed: **correct header is `Mcp-Session-Id`**

### 2.2 TypeScript SDK (`modelcontextprotocol/typescript-sdk`)

**Implementation**:
- `StreamableHTTPServerTransport` has `sessionIdGenerator` option
- Node.js client: works via cookies (legacy behavior)
- Browser client: **broken** - receives `mcp-session-id` but doesn't send it back (Issue #852)

**Known Issues**:
- Issue #340: Stateless mode broken due to `validateSession` logic
- Issue #852: Browser clients don't reuse session IDs from headers
- Community examples show `mcp-session-id` (all lowercase) inconsistently

**Current State**: TypeScript SDK is transitioning from cookie-based (Node.js) to spec-compliant header-based session management.

### 2.3 Ecosystem Observations

**Consistent Patterns**:
- Most servers use lowercase `mcp-session-id` in practice (HTTP/2 convention)
- Python SDK docs and examples use `Mcp-Session-Id` (mixed case)
- November 2025 spec uses `MCP-Session-Id` (all uppercase prefix)

**Common Issues**:
- MCP Inspector (Issue #905): Not forwarding session headers in proxy mode
- Third-party servers: Mix of casing conventions (`mcp-session-id`, `Mcp-Session-Id`, `MCP-Session-Id`)
- Spec Issue #282: Documenting inconsistencies between spec and SDK implementations

---

## 3. mcpmock Implementation Strategy

### 3.1 Current Implementation (v0.5.1)

**Record Command (`mcpmock record`)**:

1. **Session Detection** (first `initialize` request):
   - Forward `initialize` request to upstream server
   - Check response headers for session ID (case-insensitive lookup)
   - Accept any of: `Mcp-Session-Id`, `MCP-Session-Id`, `mcp-session-id`
   - Store detected header name and value

2. **Session Forwarding** (subsequent requests):
   - Include stored session ID in requests to upstream server
   - Use **exact same header name** as server returned (preserve casing)

3. **Session Recording**:
   - Record all requests/responses with session context
   - JSONL format preserves full request/response pairs

**Replay Mode (`mcpmock run --replay`)**:
- Currently replays exact recorded responses
- Does not yet validate session consistency

**Mock Mode (`mcpmock run`)**:
- Currently does not implement session management
- Treats each request independently

### 3.2 Design Principles

**Be Liberal in What You Accept**:
- Accept session headers in any casing (`Mcp-Session-Id`, `MCP-Session-Id`, `mcp-session-id`)
- Support both stateful (with session ID) and stateless (no session ID) servers
- Gracefully handle servers that deviate from spec

**Be Strict in What You Send**:
- Use **exact header name** as returned by server (preserve casing)
- Only send session headers if server requires them
- Follow spec error handling (400 for missing, 404 for invalid)

**Observability**:
- Verbose logging shows session detection and forwarding
- Warn on mismatches between expected and actual behavior
- Track protocol version and server version differences

### 3.3 Real-World Interoperability

**The Challenge**: Clients and servers often use different MCP SDK implementations with varying header casing conventions.

**Why This Happens**:
- **Python SDK (FastMCP)**: Documentation uses `Mcp-Session-Id` (mixed case per June 2025 spec)
- **TypeScript SDK**: Often returns `mcp-session-id` (lowercase, HTTP/2 convention)
- **VS Code MCP Client**: May use `mcp-session-id` (lowercase)
- **Custom Implementations**: Mix of `MCP-Session-Id` (November 2025 spec), `Mcp-Session-Id`, or `mcp-session-id`

**Real-World Scenario**:
```
VS Code Client (TypeScript SDK, uses "mcp-session-id")
    ↓
mcpmock Proxy (transparent, adaptive)
    ↓
Python FastMCP Server (returns "Mcp-Session-Id")
```

**Why Our Approach Works**:

1. **HTTP Headers Are Case-Insensitive** (RFC 7230)
   - Client sends `mcp-session-id: abc123`
   - Server reads as `Mcp-Session-Id: abc123`
   - Server responds with `Mcp-Session-Id: abc123`
   - Client reads as `mcp-session-id: abc123`

2. **Proxy is Transparent**
   - Detects session header case-insensitively
   - Preserves server's preferred casing
   - Forwards to server using detected casing
   - HTTP stack handles case-insensitive matching

3. **Override Available for Edge Cases**
   - `--session-header "Mcp-Session-Id"` forces specific casing
   - Useful for debugging, testing, or non-standard servers
   - Typically not needed due to HTTP case-insensitivity

**Key Insight**: Mixed SDK implementations are not a problem because HTTP's case-insensitive header semantics make all variants functionally equivalent. Our symmetric approach (read and write using same casing) preserves server preferences while remaining compatible with any client.

**Testing Recommendations**:
- Test with Python server + TypeScript client
- Test with TypeScript server + Python client
- Verify case-insensitive header matching
- Use `--verbose` to observe detected casing

---

## 4. Future Enhancements

### 4.1 McpDesc Schema Integration (Phase 4)

**Goal**: Capture session management details in mcpdesc files for reproducible mocking

**Schema Additions** (proposal for mcpcontract v0.4.0+):

```json
{
  "mcpdesc": "0.7.0",
  "info": {
    "name": "mcp-inventory",
    "version": "2.7.0",
    "protocolVersion": "2025-11-25",
    "sessionManagement": {
      "enabled": true,
      "headerName": "mcp-session-id",
      "headerNameCanonical": "Mcp-Session-Id",
      "mechanism": "header",
      "stateless": false,
      "notes": "Server requires session ID on all requests after initialization"
    }
  }
}
```

**Fields**:
- `enabled`: Whether server uses session management
- `headerName`: Exact header name as returned by server (with actual casing)
- `headerNameCanonical`: Spec-recommended casing (for documentation)
- `mechanism`: `"header"` (spec-compliant), `"cookie"` (legacy), or `"hybrid"`
- `stateless`: If true, server never assigns session IDs
- `notes`: Human-readable description of session behavior

### 4.2 Mock Mode Session Validation (Phase 4.1)

**Scenario 1: Dump with Session Info**

When running `mcpmock run contract.yaml`:

1. **Load session configuration** from mcpdesc schema
2. **Generate session IDs** for mock clients using same format
3. **Validate session headers**:
   - If client sends session ID, verify it's valid (previously initialized)
   - Return 400 if required session header missing
   - Return 404 if session ID unknown/terminated
4. **Use exact header name** from mcpdesc schema

**Scenario 2: Dump without Session Info** (legacy dumps)

1. **First initialization**: Generate session ID, return in header
2. **Detect header name**: Use `Mcp-Session-Id` as default (spec-compliant)
3. **Warn in verbose mode**: "Dump does not specify session management, using default"

### 4.3 Record Mode Validation (Phase 4.2)

**Enhanced Session Detection**:

When running `mcpmock record --mcpdesc contract.yaml --upstream http://server:3000/mcp`:

1. **Load expected session config** from mcpdesc (if present)
2. **Proxy first initialization**:
   - Capture actual session header name from server response
   - **Compare with dump expectations**:
     - ✅ Match: Silent success
     - ⚠️ Header name differs: `WARN: Server returned 'mcp-session-id' but dump specifies 'Mcp-Session-Id'`
     - ⚠️ Protocol version differs: `WARN: Server protocol 2025-11-25 differs from mcpdesc 2025-06-18`
     - ℹ️ Server version differs: `INFO: Server version 2.7.1 (dump: 2.7.0)`
3. **Use detected header** for all subsequent requests (actual server wins)
4. **Record both** dump expectations and actual behavior in JSONL metadata

**JSONL Metadata Enhancement**:

```jsonl
{"type":"metadata","timestamp":"2026-01-02T14:27:26Z","dump":{"sessionHeader":"Mcp-Session-Id","protocolVersion":"2025-06-18","serverVersion":"2.7.0"},"detected":{"sessionHeader":"mcp-session-id","protocolVersion":"2025-11-25","serverVersion":"2.7.1"}}
{"type":"request","timestamp":"2026-01-02T14:27:26Z","sessionId":"a2ae3ebb-5019-46b9-9563-644e47219de1","request":{...}}
{"type":"response","timestamp":"2026-01-02T14:27:26Z","sessionId":"a2ae3ebb-5019-46b9-9563-644e47219de1","response":{...}}
```

### 4.4 Multi-Session Support (Phase 4.3)

**Goal**: Handle multiple concurrent sessions in proxy mode

**Use Case**: Multiple clients connecting through same proxy instance

**Implementation**:

```typescript
// Session tracking map
const sessions = new Map<string, {
  clientSessionId: string;
  upstreamSessionId: string;
  cookies: string[];
  lastActivity: Date;
}>();

// On client initialize
if (!request.params.sessionId) {
  // New session
  const clientSessionId = generateSessionId();
  const { response, sessionId: upstreamSessionId } = 
    await forwardToUpstream(request);
  sessions.set(clientSessionId, {
    clientSessionId,
    upstreamSessionId,
    cookies: [],
    lastActivity: new Date()
  });
  return { ...response, sessionId: clientSessionId };
}

// On subsequent requests
const session = sessions.get(request.params.sessionId);
if (!session) {
  return { error: { code: 404, message: "Session not found" } };
}
return await forwardWithSession(request, session.upstreamSessionId);
```

---

## 5. Testing Strategy

### 5.1 Integration Tests

**Test Cases**:

1. **Stateful Server**:
   - Server returns session header on initialization
   - Subsequent requests require session header
   - 400 on missing header, 404 on invalid header

2. **Stateless Server**:
   - Server never returns session header
   - Server accepts requests without session header
   - Proxy doesn't inject session headers

3. **Header Casing**:
   - Server returns `mcp-session-id` (lowercase)
   - Server returns `Mcp-Session-Id` (mixed)
   - Server returns `MCP-Session-Id` (uppercase prefix)
   - Verify proxy preserves exact casing

4. **Session Lifecycle**:
   - Initialize → tools/list → tools/call (with session)
   - DELETE to terminate session
   - 404 on requests after termination

5. **Multi-Client**:
   - Two clients through same proxy
   - Separate session tracking
   - No session ID leakage

### 5.2 Manual Testing

**Test with Python SDK Server**:
```bash
# Start Python MCP server (stateful)
python -m fastmcp run my_server.py

# Record traffic through proxy
mcpmock record --mcpdesc server.mcpdesc.yaml \
  --upstream http://localhost:8000/mcp \
  --output traffic.jsonl --verbose
```

**Test with TypeScript SDK Server**:
```bash
# Start TypeScript MCP server (check casing)
node server.js

# Verify session header detection
mcpmock record --upstream http://localhost:3000/mcp \
  --output ts-traffic.jsonl --verbose
```

---

## 6. Open Questions & Spec Issues

### 6.1 To Raise with MCP Maintainers

1. **Canonical Header Casing**:
   - June 2025 spec: `Mcp-Session-Id`
   - November 2025 spec: `MCP-Session-Id`
   - Python SDK: `Mcp-Session-Id`
   - Real servers: often `mcp-session-id`
   - **Proposal**: Explicitly state "case-insensitive, recommended form: `Mcp-Session-Id`"

2. **Stateless Mode Discovery**:
   - How should clients detect if server is stateless?
   - **Proposal**: Add `capabilities.sessionManagement` to initialization:
     ```json
     {
       "capabilities": {
         "sessionManagement": {
           "enabled": true,
           "mechanism": "header"
         }
       }
     }
     ```

3. **SDK Alignment**:
   - TypeScript SDK browser client doesn't follow spec (Issue #852)
   - Python SDK examples inconsistent with header casing
   - **Proposal**: Create SDK conformance test suite

4. **Proxy Transparency**:
   - How should proxies (like mcpmock) handle session IDs?
   - Should proxy rewrite session IDs or pass-through?
   - **Current approach**: Pass-through (transparent proxy)

### 6.2 Compatibility Considerations

**Cookie-Based Sessions NOT Supported**:
- MCP specification (June/November 2025) defines **header-based session management only**
- Cookie-based sessions are not part of the MCP specification
- mcpmock implements **spec-compliant header-based sessions only**
- Servers using cookies for session management are non-compliant and should be updated to use `Mcp-Session-Id` / `MCP-Session-Id` header

**Version Negotiation**:
- Protocol version (`MCP-Protocol-Version` header) separate from session management
- Server version (in `serverInfo`) separate from protocol version
- Track all three independently

---

## 7. Implementation Roadmap

### Phase 4.0: Enhanced Session Management (v0.6.0)

- [ ] Case-insensitive session header detection
- [ ] Preserve exact header casing from server
- [ ] Support both stateful and stateless servers
- [ ] Warn on header name mismatches (verbose mode)
- [ ] Track protocol version differences
- [ ] Track server version differences (info vs warn)

### Phase 4.1: McpDesc Schema Integration (v0.7.0)

*Blocked on mcpcontract v0.4.0 schema update*

- [ ] Read session config from mcpdesc schema
- [ ] Validate dump expectations against live server
- [ ] Enhanced JSONL metadata with session details
- [ ] Mock mode session validation (400/404 responses)

### Phase 4.2: Multi-Session Support (v0.8.0)

- [ ] Session mapping for multiple concurrent clients
- [ ] Session lifecycle management (creation, expiry, deletion)
- [ ] Session activity tracking
- [ ] Automatic session cleanup

### Phase 4.3: Session Testing Tools (v0.9.0)

- [ ] Integration tests for all session scenarios
- [ ] SDK conformance test suite
- [ ] Session fuzzing (invalid IDs, missing headers, expired sessions)

---

## 8. References

### MCP Specification

- [June 2025 Spec (2025-06-18)](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [November 2025 Spec (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Authorization Guide](https://modelcontextprotocol.io/docs/tutorials/security/authorization)

### Official SDKs

- [Python SDK](https://github.com/modelcontextprotocol/python-sdk)
  - Issue #808: X-Session-ID vs Mcp-Session-Id
- [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
  - Issue #340: Stateless mode broken
  - Issue #852: Browser client session reuse

### Community Issues

- [Spec Issue #282: Streamable HTTP session inconsistency](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/282)
- [Discussion #611: MCP session id is required](https://github.com/orgs/modelcontextprotocol/discussions/611)
- [Inspector Issue #905: Mcp-Session-Id not forwarded](https://github.com/modelcontextprotocol/inspector/issues/905)

### HTTP Standards

- [RFC 7230: HTTP/1.1 Message Syntax and Routing](https://tools.ietf.org/html/rfc7230) - Header field names are case-insensitive
- [RFC 7540: HTTP/2](https://tools.ietf.org/html/rfc7540) - Header field names MUST be lowercase

---

**Document Status**: Living document - update as spec evolves and implementation progresses.
