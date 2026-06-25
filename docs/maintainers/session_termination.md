# MCP Server Best Practices

## Session Lifecycle, Timeouts, and Explicit Termination

This document defines two recommended best practices for MCP servers implementing **Streamable HTTP** (and legacy SSE):

1. **Servers SHOULD document their session timeout policy**
2. **Servers SHOULD support explicit session termination via HTTP DELETE**

These practices improve interoperability, reduce resource leaks, and make MCP behavior predictable for clients, tooling, and operators.

---

## Background: what an MCP “session” is

In MCP Streamable HTTP, a session is created when the client calls:

```
initialize
```

The server may return:

```
Mcp-Session-Id: <id>
```

Clients then include this header on subsequent requests to associate them with the session.

Important points:

* Sessions are **logical**, not tied to TCP connections
* Client disconnects do **not** automatically close sessions
* Clients may reconnect and continue using the same session id
* Servers may drop sessions at any time (timeouts, limits, restarts)

Because of this, clarity around lifecycle is critical.

---

## Best Practice #1

### Servers SHOULD document session timeout behavior

### Why this matters

Clients, tools, and proxy layers need to know:

* how long sessions survive inactivity
* whether they are evicted under load
* whether they survive server restarts
* what error to expect when the session disappears

Undocumented behavior leads to:

* confusing 404 or 400 responses
* wasted reconnect loops
* subtle bugs during long-running operations
* difficulty testing and mocking sessions

### Recommendation

MCP servers SHOULD clearly document:

#### 1. Idle timeout duration

Example:

> Sessions expire after **30 minutes of inactivity**.

#### 2. Absolute lifetime (if any)

Example:

> Sessions are terminated after **24 hours** regardless of activity.

#### 3. Cleanup trigger

Examples:

* background cleanup task
* eviction when memory limits reached
* restart or deployment reset

#### 4. Expected client behavior when expired

Per MCP rules, recommend:

* server responds with **404 Not Found**
* client should **start a new session** via `initialize`

### Suggested documentation template

Servers should include something like:

```
### Session Lifecycle

- Idle timeout: 30 minutes
- Maximum lifetime: 24 hours
- Session persistence across restarts: No (sessions are reset)
- On expired/unknown session:
  - Server returns: HTTP 404
  - Client should: Re-run initialize to obtain a new session
```

Clear expectations make tools (like inspectors, IDE plugins, mocks, and proxies) behave correctly.

---

## Best Practice #2

### Servers SHOULD support explicit session termination (HTTP DELETE)

### The intent

The protocol allows clients to politely signal:

> “I’m done with this session — you may release resources now.”

This avoids unnecessary:

* memory retention
* cached objects
* open handles
* retained execution state

### Recommended behavior

Servers SHOULD implement:

```
DELETE /<mcp-endpoint>
Mcp-Session-Id: <id>
```

When valid:

* terminate session state
* release all associated resources
* respond with:

```
204 No Content
```

(or `200 OK` with optional message)

### After deletion

Any subsequent request using that session id:

* SHOULD result in:

```
404 Not Found
```

* client SHOULD create a new session via `initialize`

### If DELETE is missing

Servers MUST still behave correctly:

* do not assume DELETE will always be sent
* rely on timeouts and cleanup policies as backup

DELETE is **optimization + clarity**, not a guarantee.

---

## Interactions with tools and proxies

### Dump / discovery tools

Tools SHOULD:

* initialize session
* optionally send DELETE at the end (graceful cleanup)
* never rely on DELETE being honored

### Mock or replay servers

Mocks SHOULD:

* record whether DELETE occurred
* replay same behavior when possible
* support DELETE explicitly to simulate production systems

### Browser tools (e.g., MCP Inspector)

DELETE may or may not be issued, depending on environment — so:

* session timeouts remain critical
* DELETE enhances cleanup, but cannot be trusted alone

---

## Summary

| Practice                             | Status     | Why                                      |
| ------------------------------------ | ---------- | ---------------------------------------- |
| Document session timeouts            | **SHOULD** | Predictable lifecycle & interoperability |
| Implement DELETE session termination | **SHOULD** | Proactive cleanup & resource safety      |
| Handle missing DELETE gracefully     | **MUST**   | Clients may disconnect without cleanup   |
| Return 404 for dead sessions         | **SHOULD** | Clear recovery path: re-initialize       |

These practices help ensure MCP servers behave consistently across:

* browsers
* proxies
* mock environments
* CLI tools
* long-lived integrations


