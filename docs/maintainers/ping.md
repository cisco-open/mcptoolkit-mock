# Ping Support Detection

**Status**: ✅ Implemented (v0.18.1)  
**Date**: 2026-01-08  
**Schema Version**: dump 0.3.4 → 0.3.5

> **Historical note (2026-07)**: This document captures the original decision to
> record ping support in the (then dump-format) description, using mcpcontract's
> dumper. File paths such as `schemas/mcpdesc-schema.json`, `schemas/dump/0.3.5.json`,
> and `schemas/latest.json` refer to that era and no longer exist in this repo —
> mcpmock now vendors a single `schemas/mcpdesc-schema-v0.7.0.json`. Ping handling
> in the mock server lives in [`src/lib/mock-server.ts`](../../src/lib/mock-server.ts)
> (`handlePing`).

## Overview

This document describes the decision to capture ping support in MCP server mcpdescs. Ping is an optional utility in the Model Context Protocol that allows either client or server to verify connection health through a simple request/response pattern.

## Background

### MCP Ping Utility

Ping has been part of the MCP specification since the very first drafts in 2024. The utility provides:

- **Simple request/response pattern**: Client sends `{"method": "ping"}`, server responds with `{}`
- **Bidirectional**: Either client or server can initiate
- **Connection health monitoring**: Detects stale connections
- **Timeout-based**: No response within reasonable timeout indicates connection issues

**Specification Reference**: https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/ping

### Initial Assessment

When initially evaluating whether to capture ping support, the assessment was:

**Arguments Against**:
- Ping is a utility, not a capability like tools/prompts
- Response time varies by network/server load (temporal nature)
- Optional in spec (servers may not implement it)
- Potential scope creep beyond capability documentation

**Initial Recommendation**: Low priority, possibly out of scope

## Decision Rationale

After further discussion, compelling use cases emerged that justified including ping detection:

### 1. Session Keepalive for Coding Agents

**Use Case**: Coding agents like GitHub Copilot use ping to keep sessions alive during long interactions.

**Impact**: Without ping support information, developers don't know if their MCP server can support long-lived agent sessions. This is critical for:
- IDE integrations that maintain connections for hours
- Agent workflows that involve multiple sequential operations
- Development tools that need persistent MCP connections

### 2. Proxy/Mock Implementation Requirements

**Use Case**: When implementing MCP proxies, gateways, or mock servers, developers need to know if they should forward/implement ping.

**Impact**: Missing ping information means:
- Proxy implementations may not forward ping requests properly
- Mock servers may not know they need to implement ping
- Gateway configurations may break agent keepalive mechanisms
- Testing frameworks may not accurately simulate production behavior

### 3. Baseline Connection Performance

**Use Case**: Ping latency represents minimal connection overhead without business logic.

**Impact**: This metric helps developers:
- Set appropriate timeout values for actual operations
- Diagnose slow connections vs. slow server processing
- Establish performance baselines for monitoring
- Debug network issues separate from application issues

### 4. Documentation Completeness

**Use Case**: Complete picture of server behavior for both human developers and AI agents.

**Impact**: 
- Developers know what utilities are available
- Documentation shows full server behavior, not just capabilities
- AI coding assistants have complete context for code generation
- Integration guides are more accurate and comprehensive

## Implementation Decision

**Decision**: Include ping support detection in dumps

**Justification**:
1. Real-world usage by coding agents (session keepalive)
2. Critical for proxy/mock implementations
3. Useful baseline performance metric
4. Minimal implementation cost
5. Ping has been in spec since 2024 (not a new/experimental feature)

## Implementation Approach

### Schema Changes (0.3.4 → 0.3.5)

Add two optional fields to `info`:

```json
{
  "pingSupported": {
    "type": "boolean",
    "description": "Whether the server responded to a ping request..."
  },
  "pingLatencyMs": {
    "type": "number",
    "description": "Round-trip latency in milliseconds for the ping request...",
    "minimum": 0
  }
}
```

**Design Choices**:
- **Optional fields**: Backward compatible, won't break existing dumps
- **Boolean + latency**: Clear signal (supported/not) plus useful metric
- **Undefined when not tested**: Distinguishes "not tested" from "tested and failed"

### Detection Logic

1. **After initialization and CORS detection**: Ping test runs after protocol handshake
2. **5-second timeout**: Reasonable for most networks, prevents hanging
3. **Graceful failure**: Servers that don't respond marked as `pingSupported: false`
4. **Timing measurement**: Capture round-trip time for baseline performance

```typescript
async testPing(timeoutMs: number = 5000): Promise<{ 
  supported: boolean; 
  latencyMs?: number 
}> {
  const startTime = Date.now();
  await Promise.race([this.client.ping(), timeoutPromise]);
  const latencyMs = Date.now() - startTime;
  return { supported: true, latencyMs };
}
```

### Documentation Display

**Overview Section** (brief):
```
- Ping Support: ✓ Yes (42ms)
```

**Detailed Section** (comprehensive):
```
## Session Information
- Ping Support: ✓ Server responds to ping (latency: 42ms)
```

## Use Case Examples

### Example 1: Proxy Implementation

```typescript
// Developer reads dump to implement MCP proxy
if (info.pingSupported) {
  // Forward ping requests to upstream server
  proxy.on('ping', () => upstream.ping());
} else {
  // Server doesn't support ping, respond locally
  proxy.on('ping', () => ({}));
}
```

### Example 2: Agent Configuration

```yaml
# GitHub Copilot agent configuration
mcp:
  server: https://api.example.com/mcp
  keepalive:
    enabled: true  # Safe because pingSupported: true in dump
    interval: 30s
    timeout: 5s
```

### Example 3: Performance Monitoring

```typescript
// Set operation timeouts based on baseline latency
const baselineMs = info.pingLatencyMs; // 42ms
const toolTimeout = baselineMs * 100; // 4200ms for complex operations
const promptTimeout = baselineMs * 50; // 2100ms for prompt generation
```

## Alternative Approaches Considered

### 1. Don't Capture Ping (Rejected)

**Rationale**: Insufficient information for real-world use cases

**Problems**:
- Proxy developers forced to test manually
- Agents can't make informed keepalive decisions
- Performance baselines unavailable

### 2. Capture Only Boolean Support (Rejected)

**Rationale**: Missing valuable latency information

**Problems**:
- No baseline for timeout configuration
- Can't diagnose slow connections
- Half the utility for minimal savings

### 3. Capture Full Ping Metrics (Rejected)

**Rationale**: Overly complex for diminishing returns

**Examples**: min/max/avg over multiple pings, jitter, packet loss

**Problems**:
- Significantly longer dump time
- More complex implementation
- Temporal metrics less useful in static dump
- Single ping sufficient for baseline

## Impact Assessment

### Positive Impacts

1. ✅ **Coding agents** can use ping for session keepalive
2. ✅ **Proxy developers** know if forwarding is needed
3. ✅ **Performance monitoring** has baseline latency
4. ✅ **Documentation completeness** improves
5. ✅ **Mock implementations** know what to implement

### Minimal Costs

1. ⚠️ **Dump time**: +5ms to 5s (timeout-dependent)
2. ⚠️ **Schema complexity**: +2 optional fields
3. ⚠️ **Implementation**: ~100 lines of code

### No Breaking Changes

- Optional fields maintain backward compatibility
- Existing dumps remain valid
- No migration required
- Graceful degradation if server doesn't support ping

## Success Metrics

### Implementation Success (v0.18.1)

- ✅ Schema updated (0.3.4 → 0.3.5)
- ✅ Client ping test method implemented
- ✅ Dumper integration complete
- ✅ Documentation templates updated
- ✅ Graceful failure handling
- ✅ Verbose logging support

### Future Success Indicators

1. **Proxy implementations** use pingSupported to configure forwarding
2. **Coding agents** reference dumps for keepalive decisions
3. **Performance guides** reference pingLatencyMs for timeout recommendations
4. **Mock servers** implement ping based on dump documentation
5. **Community feedback** validates utility of ping information

## Related Specifications

- [MCP Ping Utility (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/ping)
- [MCP Protocol Specification](https://modelcontextprotocol.io/specification)
- Original MCP drafts from 2024 (ping included from beginning)

## Implementation Files

### Core Implementation
- `schemas/mcpdesc-schema.json` - Schema version 0.3.5 with ping fields
- `schemas/dump/0.3.5.json` - Versioned schema copy
- `src/lib/client.ts` - `testPing()` method implementation
- `src/lib/dumper.ts` - Integration into dump workflow
- `src/lib/types.ts` - `RuntimeFindings` interface with ping fields

### Documentation
- `templates/default-dump.md.hbs` - Overview and detailed display
- `CHANGELOG.md` - Release notes for v0.18.1

### Versioning
- `schemas/latest.json` - Updated to 0.3.5
- `schemas/cli-schema-compatibility.json` - v0.18.1 entry
- `package.json` - Bumped to 0.18.1

## Conclusion

The decision to capture ping support information is justified by real-world use cases in session keepalive, proxy implementations, and performance monitoring. While ping is a utility rather than a capability, its documentation value for integration developers and coding agents outweighs the minimal implementation cost.

The implementation maintains backward compatibility, fails gracefully, and provides both boolean support detection and quantitative latency measurement. This aligns with the tool's mission to provide comprehensive, actionable documentation for MCP server integrations.

**Note**: Ping has been part of the MCP specification since the very first 2024 drafts, making it a well-established utility rather than an experimental feature. This long-standing presence in the protocol further supports the decision to document its availability.
