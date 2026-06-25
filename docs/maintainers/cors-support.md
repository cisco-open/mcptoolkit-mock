# MCP Servers, Browsers, and CORS

### Session Management, Discovery, and Best-Practice Recommendations

## Purpose

This document explains:

1. **When CORS is appropriate for MCP servers**
2. **What an mcpdesc tool should capture to determine browser usability**
3. **An internal recommendation: MCP servers that support Streamable HTTP or SSE should support CORS**
4. **Requirements for MCP proxies / mocks to support CORS (including session headers)**

This guidance is specifically about **Streamable HTTP** (and legacy SSE) transports, where browsers are first-class consumers (e.g., MCP Inspector, web tools, browser clients).

---

## 1. When CORS is appropriate for MCP servers

### MCP + Browsers = CORS is required

MCP is often used **outside the browser**:

* local desktop tools
* CLI utilities
* backend services

In these environments, **CORS does not matter**.

However, a growing class of tools run in the browser, for example:

* **MCP Inspector**
* web developer portals
* admin/debug dashboards
* custom integrations running via JavaScript

Browsers enforce the **Same-Origin Policy**.
When the browser calls an MCP server on a different origin, the call only succeeds if the MCP server supports **CORS**.

Without CORS:

* initialization may succeed
* but the browser cannot read **custom headers**, especially:

```
Mcp-Session-Id
```

And without the session ID, the client cannot continue the session.

### Transports where CORS matters

CORS is relevant when:

| Transport                | Browser-Callable         | Notes                    |
| ------------------------ | ------------------------ | ------------------------ |
| Streamable HTTP          | ✅ Yes                    | Primary modern transport |
| SSE (Server Sent Events) | ⚠️ Legacy but still used | Still subject to CORS    |
| WebSockets               | Depends                  | Not covered here         |
| Stdio / Unix sockets     | ❌ No                     | Not browser-accessible   |

So:

> If your MCP server supports **Streamable HTTP** or **SSE** and is expected to be used from a browser, it should support CORS.

---

## 2. What an mcpdesc tool should capture to identify browser usability

A **dump tool** connects to a live MCP server, initializes a session, and inspects capabilities.

To determine whether the server is **browser-usable**, the tool should capture:

### A. Session management detection

From the `initialize` response:

* whether a session header is returned
* normalized header name (case-insensitive)
* value of the session id

Example fields:

```json
{
  "session": {
    "hasSession": true,
    "header": "Mcp-Session-Id",
    "value": "abc123"
  }
}
```

### B. CORS exposure headers (response)

From the same response, capture:

* `Access-Control-Allow-Origin`
* `Access-Control-Expose-Headers`

Key check:

> Does `Access-Control-Expose-Headers` contain `Mcp-Session-Id`?

Because without that, browsers cannot read the session.

### C. Preflight support (OPTIONS)

A dump tool should optionally send an **OPTIONS** preflight with:

```
Origin
Access-Control-Request-Method
Access-Control-Request-Headers (including Mcp-Session-Id)
```

Record:

* status
* `Access-Control-Allow-Origin`
* `Access-Control-Allow-Methods`
* `Access-Control-Allow-Headers`

### D. Final heuristic: “browser usable?”

A simple rule of thumb:

Browser usable =

* server exposes `Mcp-Session-Id`
* preflight allows POST
* preflight allows `Mcp-Session-Id`

Represented as:

```json
{
  "cors": {
    "browserReady": true
  }
}
```

If any are missing, add warnings rather than failing — some servers can still partially function.

---

## 3. Internal recommendation: CORS should be supported on MCP HTTP/SSE servers

We adopt the following recommendation:

### ✔️ Recommendation

> **Any MCP server that supports Streamable HTTP or SSE SHOULD support CORS so it can be invoked from browsers, including MCP Inspector.**

Specifically, servers should set:

#### Always include

```
Access-Control-Allow-Origin: *
```

(or a specific origin if locked down)

#### Allow the session header to be sent

```
Access-Control-Allow-Headers: Mcp-Session-Id, Content-Type, Authorization
```

#### Expose the session header so browsers can read it

```
Access-Control-Expose-Headers: Mcp-Session-Id
```

#### Preflight (OPTIONS)

Return 200/204 and include:

```
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
```

### Why standardize this internally?

* avoids per-project CORS surprises
* ensures compatibility with MCP Inspector
* makes our tools, mocks, and proxies predictable
* avoids hidden “works on localhost but not remotely” failures

---

## 4. MCP proxies & mock servers MUST support CORS correctly

Mock and proxy layers behave like **servers to the browser**.

Therefore:

> Any MCP proxy or mock we build MUST fully support CORS and MCP session headers so it can be used from browser tools.

### Requirements for proxies / mocks

#### 4.1 Forward or synthesize session headers

* Capture the `Mcp-Session-Id` from the backend server
* Return the same header on `initialize`
* Require it on subsequent calls (if the recorded server did)

#### 4.2 Add required CORS headers

On all responses:

```
Access-Control-Allow-Origin: *
Access-Control-Expose-Headers: Mcp-Session-Id
```

Handle preflight:

```
OPTIONS …

Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, Mcp-Session-Id
```

For record/replay specifically:

* record the session ID from real traffic
* replay with the same session ID
* simulate missing-header behavior if the real server enforced it

This guarantees that:

* MCP Inspector works
* browser debugging tools work
* recorded sessions behave like real servers

---

## Summary

| Topic           | Guideline                                          |
| --------------- | -------------------------------------------------- |
| CORS usage      | Required when MCP servers are called from browsers |
| Where relevant  | Streamable HTTP and SSE transports                 |
| Dump tools      | Detect CORS + session header visibility            |
| Internal policy | Servers with HTTP/SSE SHOULD support CORS          |
| Mocks / proxies | MUST expose CORS + MCP session ID headers          |


