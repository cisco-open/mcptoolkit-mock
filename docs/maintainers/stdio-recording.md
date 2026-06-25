# Stdio Recording Support - Design Document

**Status**: Deferred  
**Created**: 2026-01-04  
**Decision**: Not implementing in current phase due to complexity vs value trade-off

---

## Table of Contents

- [Overview](#overview)
- [Current Status](#current-status)
- [Technical Challenges](#technical-challenges)
- [Implementation Design](#implementation-design)
- [Effort Estimation](#effort-estimation)
- [Decision Rationale](#decision-rationale)
- [Workarounds](#workarounds)
- [Future Implementation](#future-implementation)

---

## Overview

### Problem Statement

Users want to record MCP traffic from stdio-based servers for replay and testing. Currently, `mcpmock record` only supports HTTP transport, leaving a gap for stdio-only servers.

### User Story

> "As an MCP developer, I want to record traffic from my stdio-based server so I can replay it for testing and demo purposes without running the real server."

### Scope

**In Scope**:
- Recording JSON-RPC traffic over stdio transport
- Proxying between client (stdin/stdout) and upstream server (stdio)
- Saving traffic to JSONL format (same as HTTP recording)
- Compatibility with existing `mcpmock run --replay` functionality

**Out of Scope**:
- Recording non-JSON-RPC stdio protocols
- Real-time traffic analysis/modification
- Multi-session recording

---

## Current Status

### What Works Today

✅ **HTTP Recording** (v0.2.0+):
```bash
mcpmock record \
  --mcpdesc server.mcpdesc.json \
  --upstream http://localhost:8080 \
  --output traffic.jsonl \
  --port 3000
```

✅ **Stdio Transport** for `mcpmock run` (v0.1.0+):
```bash
mcpmock run server.mcpdesc.json
```

✅ **Traffic Replay** (v0.2.0+):
```bash
mcpmock run server.mcpdesc.json --replay traffic.jsonl
```

### What's Missing

❌ **Stdio Recording**:
```bash
# This does NOT exist
mcpmock record \
  --command "node upstream-server.js" \
  --output traffic.jsonl
```

---

## Technical Challenges

### Challenge 1: Bidirectional Stdio is Exclusive ⭐⭐⭐⭐

**Problem**: Stdio transport uses stdin/stdout for JSON-RPC communication. A process can only have ONE stdin and ONE stdout. When mcpmock tries to record stdio traffic, it needs to:

1. Read from client's stdin
2. Forward to upstream server's stdin
3. Read from upstream server's stdout
4. Forward to client's stdout
5. Record all traffic in both directions

**Why it's hard**:
- Can't directly pipe `client stdin → mcpmock → upstream stdin` while also reading for recording
- Need to spawn upstream server as child process (can't proxy to existing stdio process)
- Must intercept and parse JSON-RPC messages in both directions without blocking

**Contrast with HTTP**:
- HTTP: mcpmock is a server listening on a port (passive)
- Stdio: mcpmock must actively manage a child process and pipe stdio streams

### Challenge 2: Process Management Complexity ⭐⭐⭐⭐

**Problem**: Recording stdio requires full process lifecycle management:

```
┌─────────┐         ┌──────────┐         ┌──────────────┐
│ Client  │ ◄─────► │ mcpmock  │ ◄─────► │   Upstream   │
│ (stdio) │         │ (record) │         │ Server (cmd) │
└─────────┘         └──────────┘         └──────────────┘
                         │
                         ↓
                   traffic.jsonl
```

**Responsibilities**:
1. **Spawn**: Start upstream server as child process with `child_process.spawn()`
2. **Pipe**: Connect stdin/stdout between client and child
3. **Parse**: Extract JSON-RPC messages from streams (line-by-line)
4. **Record**: Write to JSONL without disrupting flow
5. **Error Handling**:
   - Upstream process crashes
   - Partial JSON messages split across chunks
   - Client disconnects unexpectedly
   - Stdout/stderr interleaving
6. **Cleanup**:
   - Kill child process on SIGINT/SIGTERM
   - Flush recording buffer
   - Prevent zombie processes

**Contrast with HTTP**:
- HTTP: Server lifecycle is independent (already running)
- Stdio: mcpmock owns and manages the server process

### Challenge 3: Stream Parsing Edge Cases ⭐⭐⭐

**Problem**: JSON-RPC messages are newline-delimited, but streams don't guarantee message boundaries.

**Edge cases**:
1. **Partial messages**: `{"jsonrpc":"2.0","id":1,"meth` ← incomplete
2. **Multiple messages**: `{...}\n{...}\n{...}\n` in one chunk
3. **Empty lines**: Some servers send `\n\n` or whitespace
4. **Stderr interleaving**: Server logs mixed with stdout

**Solution needed**:
- Use `readline` interface for line-by-line parsing
- Buffer incomplete lines until `\n` received
- Distinguish JSON-RPC from non-JSON-RPC output

### Challenge 4: CLI Design ⭐⭐

**Problem**: Current `record` command assumes HTTP proxy model:

```bash
mcpmock record --upstream http://... --port 3000
```

**Stdio needs different interface**:

```bash
# Option A: Command to spawn
mcpmock record --command "node server.js" --output traffic.jsonl

# Option B: Stdio flag (harder to implement)
mcpmock record --stdio --output traffic.jsonl
# (How does mcpmock talk to upstream if both use stdio?)
```

**Decision**: Option A is more practical (spawn command)

---

## Implementation Design

### Approach: Process Spawning (Recommended)

#### Architecture

```
┌───────────────────────────────────────────────────────────┐
│                      Client Process                        │
│  (MCP client using stdio - e.g., Claude Desktop)          │
└──────────────┬────────────────────────────────────────────┘
               │ stdin/stdout
               ↓
┌──────────────────────────────────────────────────────────┐
│                    mcpmock record                         │
│                                                           │
│  ┌─────────────┐    ┌──────────────┐   ┌─────────────┐ │
│  │   Stdin     │───→│   Recorder   │───→│   Child     │ │
│  │  Interface  │    │              │    │   Stdin     │ │
│  └─────────────┘    └──────────────┘   └─────────────┘ │
│                            │                             │
│                            ↓                             │
│                     traffic.jsonl                        │
│                            ↑                             │
│  ┌─────────────┐    ┌──────────────┐   ┌─────────────┐ │
│  │   Stdout    │←───│   Recorder   │←───│   Child     │ │
│  │  Interface  │    │              │    │  Stdout     │ │
│  └─────────────┘    └──────────────┘   └─────────────┘ │
└──────────────────────────────────────────────────────────┘
               ↑
               │ spawns and manages
               ↓
┌──────────────────────────────────────────────────────────┐
│              Upstream Server (Child Process)              │
│             (e.g., node upstream-server.js)               │
└──────────────────────────────────────────────────────────┘
```

#### Key Components

##### 1. StdioRecorder Class

```typescript
// src/lib/stdio-recorder.ts

import { spawn, ChildProcess } from 'node:child_process';
import { createInterface, Interface } from 'node:readline';
import { Transform } from 'node:stream';
import { TrafficRecorder } from './traffic-recorder.js';

export interface StdioRecorderOptions {
  command: string;        // Command to spawn (e.g., "node server.js")
  outputFile: string;     // JSONL output file
  verbose: boolean;       // Enable logging
}

export class StdioRecorder {
  private child: ChildProcess | null = null;
  private recorder: TrafficRecorder;
  private stdinReader: Interface | null = null;
  private stdoutReader: Interface | null = null;
  private verbose: boolean;

  constructor(options: StdioRecorderOptions) {
    this.recorder = new TrafficRecorder(options.outputFile);
    this.verbose = options.verbose;
  }

  /**
   * Start recording - spawn child process and set up pipes
   */
  async start(command: string): Promise<void> {
    // Parse command (handle "node server.js" or "python server.py")
    const parts = command.split(' ');
    const executable = parts[0];
    const args = parts.slice(1);

    // Spawn upstream server
    this.child = spawn(executable, args, {
      stdio: ['pipe', 'pipe', 'inherit'] // stdin=pipe, stdout=pipe, stderr=inherit
    });

    if (!this.child.stdin || !this.child.stdout) {
      throw new Error('Failed to create child process stdio pipes');
    }

    // Set up stdin forwarding (client → child)
    this.stdinReader = createInterface({
      input: process.stdin,
      terminal: false
    });

    this.stdinReader.on('line', (line: string) => {
      try {
        // Parse and record request
        const request = JSON.parse(line);
        this.recorder.recordRequest(request);
        
        if (this.verbose) {
          console.error(`[RECORD] → ${request.method || 'notification'}`);
        }

        // Forward to child
        this.child!.stdin!.write(line + '\n');
      } catch (error) {
        // Not valid JSON - forward anyway
        this.child!.stdin!.write(line + '\n');
      }
    });

    // Set up stdout forwarding (child → client)
    this.stdoutReader = createInterface({
      input: this.child.stdout,
      terminal: false
    });

    this.stdoutReader.on('line', (line: string) => {
      try {
        // Parse and record response
        const response = JSON.parse(line);
        this.recorder.recordResponse(response);
        
        if (this.verbose) {
          console.error(`[RECORD] ← ${response.error ? 'error' : 'success'}`);
        }

        // Forward to client
        console.log(line);
      } catch (error) {
        // Not valid JSON - forward anyway
        console.log(line);
      }
    });

    // Handle child process exit
    this.child.on('exit', (code, signal) => {
      if (this.verbose) {
        console.error(`[RECORD] Child process exited: code=${code}, signal=${signal}`);
      }
      this.cleanup();
    });

    // Handle child process errors
    this.child.on('error', (error) => {
      console.error(`[ERROR] Child process error: ${error.message}`);
      this.cleanup();
      process.exit(1);
    });
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    if (this.stdinReader) {
      this.stdinReader.close();
      this.stdinReader = null;
    }

    if (this.stdoutReader) {
      this.stdoutReader.close();
      this.stdoutReader = null;
    }

    await this.recorder.close();

    if (this.child && !this.child.killed) {
      this.child.kill();
      this.child = null;
    }
  }

  /**
   * Stop recording
   */
  async stop(): Promise<void> {
    if (this.verbose) {
      console.error('[RECORD] Stopping...');
    }
    await this.cleanup();
  }
}
```

##### 2. Update Record Command

```typescript
// src/commands/record.ts

import { StdioRecorder } from '../lib/stdio-recorder.js';

async function executeRecordStdio(options: RecordOptions): Promise<void> {
  const recorder = new StdioRecorder({
    command: options.command!,
    outputFile: options.output,
    verbose: options.verbose
  });

  log(`Starting stdio recording...`, options);
  log(`Command: ${options.command}`, options);
  log(`Output: ${options.output}`, options);

  await recorder.start(options.command!);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.error(`\n${YELLOW}[MCPMOCK]${RESET} Shutting down...`);
    await recorder.stop();
    console.error(`${GREEN}[MCPMOCK]${RESET} Recording saved to: ${options.output}`);
    process.exit(0);
  });
}

// Update command definition
export function recordCommand(): Command {
  const cmd = new Command('record');

  cmd
    .description('Record MCP traffic from real server')
    .requiredOption('--mcpdesc <file>', 'Path to dump.json or dump.yaml file (for metadata)')
    .requiredOption('--output <file>', 'Path to output JSONL file')
    .option('--upstream <url>', 'URL of real MCP server for HTTP recording')
    .option('--command <cmd>', 'Command to spawn for stdio recording (e.g., "node server.js")')
    .option('--port <number>', 'Port for HTTP proxy to listen on (HTTP mode only)', '3000')
    .option('--verbose', 'Enable detailed logging', false)
    .action(async (options: RecordOptions) => {
      try {
        // Validate mutually exclusive options
        if (options.upstream && options.command) {
          throw new Error('Cannot specify both --upstream and --command. Choose HTTP or stdio recording.');
        }

        if (!options.upstream && !options.command) {
          throw new Error('Must specify either --upstream (HTTP) or --command (stdio) for recording.');
        }

        // Route to appropriate handler
        if (options.command) {
          await executeRecordStdio(options);
        } else {
          await executeRecord(options); // Existing HTTP implementation
        }
      } catch (error) {
        handleError(error);
        process.exit(1);
      }
    });

  return cmd;
}
```

#### Usage Examples

```bash
# Record from Node.js server
mcpmock record \
  --mcpdesc server.mcpdesc.json \
  --command "node dist/server.js" \
  --output traffic.jsonl \
  --verbose

# Record from Python server
mcpmock record \
  --mcpdesc server.mcpdesc.json \
  --command "python server.py" \
  --output traffic.jsonl

# Record with arguments
mcpmock record \
  --mcpdesc server.mcpdesc.json \
  --command "node server.js --port 3000 --debug" \
  --output traffic.jsonl
```

### Alternative Approach: Transparent Proxy (Not Recommended)

This would require mcpmock to proxy between an existing stdin/stdout process, which is much more complex:

**Problems**:
1. Need separate control channel (can't use stdio)
2. Requires complex IPC or socket-based communication
3. Less user-friendly (harder to set up)
4. More error-prone

**Complexity**: 25-35 hours vs 15-21 hours for process spawning

**Decision**: Not worth the added complexity

---

## Effort Estimation

### Breakdown by Task

| Task | Complexity | Hours |
|------|-----------|-------|
| **Phase 1: Core Implementation** | | |
| StdioRecorder class | Medium | 4-6 |
| Bidirectional piping logic | Medium | 2-3 |
| Stream parsing (readline) | Low | 1-2 |
| Recording integration | Low | 1-2 |
| **Phase 2: Error Handling** | | |
| Process lifecycle management | Medium | 2-3 |
| Graceful shutdown (SIGINT) | Low | 1-2 |
| Child crash handling | Medium | 1-2 |
| Partial message buffering | Low | 1 |
| **Phase 3: CLI Integration** | | |
| Update record command | Low | 1-2 |
| Option validation | Low | 1 |
| Help text and examples | Low | 1 |
| **Phase 4: Testing** | | |
| Unit tests (stream handling) | Medium | 2-3 |
| Integration tests (real servers) | Medium | 2-3 |
| Edge case testing | Medium | 2-3 |
| **Phase 5: Documentation** | | |
| README updates | Low | 1-2 |
| Tutorial doc | Low | 1-2 |
| AGENTS.md updates | Low | 1 |

**Total Estimate**: **15-21 hours** (2-3 days of focused work)

### Risk Factors

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Stream buffering issues | Medium | High | Use readline for line-by-line parsing |
| Process zombie creation | Low | Medium | Comprehensive cleanup in signal handlers |
| Cross-platform compatibility | Medium | Medium | Test on Linux, macOS, Windows |
| Partial message handling | Low | Low | Buffer incomplete lines until newline |
| Stderr/stdout mixing | Medium | Low | Only parse stdout, inherit stderr |

---

## Decision Rationale

### Why Defer Implementation

#### 1. **Limited User Demand**

**Current situation**:
- No user requests for stdio recording (as of 2026-01-04)
- HTTP recording covers majority of use cases
- Modern MCP servers increasingly support HTTP transport

**Evidence**:
- Phase 2 (HTTP recording) completed without stdio requests
- mcptest integration provides alternative for stdio servers
- Build workflow eliminates need for recording in many cases

#### 2. **Complexity vs Value Trade-off**

**Complexity**: 15-21 hours (process management, stream handling, lifecycle)  
**Value**: Minority use case (HTTP recording + workarounds sufficient)

**Better ROI alternatives**:
- Polish existing features
- Improve error messages
- Add more tutorials/examples
- Build command extensions (prompts, resources)

#### 3. **Effective Workarounds Exist**

Users can achieve stdio recording goals through:

1. **HTTP recording** (recommended)
2. **mcptest integration** (test then import)
3. **Build workflow** (AI-generated mocks)

All three approaches work today with zero additional code.

#### 4. **MCP Ecosystem Trend**

**Observation**: More servers support HTTP for:
- Browser compatibility (MCP Inspector)
- CORS requirements
- Simpler client implementation
- Better debugging (curl, Postman, browser DevTools)

**Implication**: Stdio-only servers becoming less common

### When to Reconsider

Implement stdio recording if:

1. ✅ **User demand**: 3+ users request this feature
2. ✅ **Ecosystem shift**: Major stdio-only servers emerge
3. ✅ **Integration requirement**: Critical integration requires stdio recording
4. ✅ **Feature completeness**: All higher-priority features complete

---

## Workarounds

### 1. Use HTTP Recording (Recommended)

**Steps**:
```bash
# 1. Run upstream server with HTTP transport
node your-server.js --transport streamable-http --port 8080

# 2. Record via HTTP proxy
mcpmock record \
  --mcpdesc server.mcpdesc.json \
  --upstream http://localhost:8080 \
  --output traffic.jsonl \
  --port 3000 \
  --verbose

# 3. Use recording
mcpmock run \
  --mcpdesc server.mcpdesc.json \
  --replay traffic.jsonl \
  --port 3000
```

**Pros**:
- ✅ Works today (v0.2.0+)
- ✅ Battle-tested
- ✅ Full feature support (session management, streaming)

**Cons**:
- ❌ Requires server to support HTTP transport
- ❌ May need server code changes

### 2. Use mcptest Integration

**Steps**:
```bash
# 1. Write tests for your server
cat > tests.mcp.yaml << 'EOF'
tests:
  - name: "Get weather"
    tool: "get-current"
    arguments:
      city: "London"
    assertions:
      - type: "not-null"
        path: "temperature"
EOF

# 2. Run tests (generates execution log)
mcptest --file tests.mcp.yaml --mcpdesc server.mcpdesc.json

# 3. Import execution log to JSONL
mcpmock import execution.json traffic.jsonl

# 4. Replay
mcpmock run server.mcpdesc.json --replay traffic.jsonl
```

**Pros**:
- ✅ Works with stdio servers
- ✅ Generates test coverage
- ✅ Validates server behavior

**Cons**:
- ❌ Requires writing test files
- ❌ Only captures tested scenarios
- ❌ Extra dependency (mcptest)

### 3. Use Build Workflow

**Steps**:
```bash
# 1. Generate mock data with AI
mcpmock build \
  --mcpdesc server.mcpdesc.json \
  --output mock-data/

# 2. Run with generated mocks
mcpmock run \
  --mcpdesc server.mcpdesc.json \
  --data mock-data/
```

**Pros**:
- ✅ No real server needed
- ✅ AI generates realistic data
- ✅ Customizable (edit JSON files)

**Cons**:
- ❌ Not from real server
- ❌ May need manual refinement

---

## Future Implementation

### If/When We Implement

#### Prerequisites

1. **User validation**: Confirm demand (3+ users, real use cases)
2. **Design review**: Validate architecture with team
3. **Test infrastructure**: Set up cross-platform CI
4. **Documentation plan**: Tutorial, examples, troubleshooting

#### Implementation Phases

**Phase 1**: Core (8-10 hours)
- StdioRecorder class
- Basic piping and recording
- Process spawning

**Phase 2**: Robustness (5-7 hours)
- Error handling
- Signal handling
- Edge cases

**Phase 3**: Testing & Documentation (4-6 hours)
- Comprehensive tests
- Tutorial and examples
- README updates

#### Testing Strategy

1. **Unit tests**:
   - Stream parsing edge cases
   - Recording accuracy
   - Error handling

2. **Integration tests**:
   - Real stdio servers (Node.js, Python)
   - Process lifecycle (start, stop, crash)
   - Signal handling (SIGINT, SIGTERM)

3. **Cross-platform tests**:
   - Linux (primary)
   - macOS
   - Windows (may need different process handling)

#### Success Criteria

- ✅ Records complete JSON-RPC conversations
- ✅ Handles process crashes gracefully
- ✅ Works with Node.js and Python servers
- ✅ Compatible with existing replay mechanism
- ✅ Cross-platform (Linux, macOS, Windows)
- ✅ Zero data loss (all messages recorded)
- ✅ Clean shutdown (no zombies)

---

## References

### Related Documents

- [phase2-http-recording.md](phase2-http-recording.md) - HTTP recording implementation
- [mcpmock-design.md](mcpmock-design.md) - Overall architecture
- [mcpmock-implementation-plan.md](mcpmock-implementation-plan.md) - Project roadmap

### External Resources

- [Node.js child_process](https://nodejs.org/api/child_process.html) - Process spawning API
- [Node.js readline](https://nodejs.org/api/readline.html) - Line-by-line stream parsing
- [MCP Specification](https://spec.modelcontextprotocol.io/) - Protocol reference

### Related Issues

- Track feature requests in project issue tracker
- Update this document if user demand changes

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-01-04 | AI Agent | Initial design document (deferred implementation) |

