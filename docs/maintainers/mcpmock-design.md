# MCP Mock Server Tool: Design Specification  

**Status**: 
**Created**: 2025-12-09  
**Related**: AGENTS.md, mcpdesc-schema.json v0.3.1

---

## Overview

**mcpmock** is a standalone CLI tool for running mock MCP servers from mcpdesc files. It enables testing MCP clients, building demos, and developing integrations without requiring access to live MCP servers.

### Purpose

- **Client Testing**: Test MCP client implementations without live servers
- **Demo/POC**: Demonstrate MCP capabilities with controlled data
- **Development**: Build against stable mock while real server is in development
- **Recording**: Capture real traffic for replay in tests

### Relationship to mcpcontract

```
mcpcontract (contract management)
    ↓ generates
  dump.json (v0.3.1 schema)
    ↓ consumed by
  mcpmock (mock server runtime)
```

**Design Principle**: `mcpmock` is a **separate repository** and tool, keeping `mcpcontract` focused on contract validation/documentation.

---

## Command Structure

### 1. `mcpmock run` - Run Mock Server

**Purpose**: Start a live MCP mock server that responds to client requests.

#### Basic Usage

```bash
# Start mock server (stdio, auto-generated data)
mcpmock run api-inventory.mcpdesc.json

# With custom mock data overrides
mcpmock run api-inventory.mcpdesc.json --data mock-data/

# Verbose logging
mcpmock run api-inventory.mcpdesc.json --verbose

# Future: Different transport
mcpmock run api-inventory.mcpdesc.json --transport streamable-http --port 3000
```

#### Options

- `--mcpdesc <file>` (required) - Path to dump.json file
- `--data <dir>` (optional) - Directory containing mock data overrides
- `--verbose` (optional) - Enable detailed logging
- `--transport <type>` (future) - Transport type: stdio, streamable-http, sse
- `--port <number>` (future) - Port for HTTP transports

#### Output Example

```
[MCPMOCK] Starting MCP mock server
[MCPMOCK] Loaded mcpdesc: api-inventory.mcpdesc.json (v0.3.1)
[MCPMOCK] McpDesc schema: https://developer.cisco.com/mcp-description/schema/0.3.1
[MCPMOCK] Transport: stdio
[MCPMOCK] Capabilities: 6 tools | 3 resources | 2 prompts
[MCPMOCK] Mock data: mock-data/ (6 overrides loaded)
[MCPMOCK] Ready. Waiting for client connection...

[MCPMOCK] ← initialize (client capabilities)
[MCPMOCK] → serverInfo: cisco-api-inventory-server v2.1.1
[MCPMOCK] ← tools/list
[MCPMOCK] → 6 tools
[MCPMOCK] ← tools/call: search-inventory {"organization": "SBG"}
[MCPMOCK] → Mock response (from mock-data/search-inventory.json)
[MCPMOCK] ← tools/call: search-inventory {"organization": "CN"}
[MCPMOCK] → Mock response (generated, cached)
```

---

### 2. `mcpmock record` - Capture Real Traffic

**Purpose**: Record requests/responses from a real MCP server for replay.

#### Basic Usage

```bash
# Record traffic from real server
mcpmock record --mcpdesc api-inventory.mcpdesc.json --output traffic.jsonl

# Replay recorded traffic
mcpmock run api-inventory.mcpdesc.json --replay traffic.jsonl
```

#### Options

- `--mcpdesc <file>` (required) - Path to dump.json (for server metadata)
- `--output <file>` (required) - Output JSONL file for recorded traffic
- `--replay <file>` (optional, for run command) - Replay recorded traffic

#### Recording Format

```jsonl
{"timestamp":"2025-12-09T10:00:00.123Z","direction":"request","id":1,"method":"initialize","params":{...}}
{"timestamp":"2025-12-09T10:00:00.456Z","direction":"response","id":1,"result":{...}}
{"timestamp":"2025-12-09T10:00:01.123Z","direction":"request","id":2,"method":"tools/call","params":{"name":"search-inventory","arguments":{...}}}
{"timestamp":"2025-12-09T10:00:01.789Z","direction":"response","id":2,"result":{"content":[...]}}
```

#### Workflow

1. **Record session**: `mcpmock record` acts as proxy between client and real server
2. **All traffic logged**: Every request/response saved to JSONL
3. **Replay**: `mcpmock run --replay` uses recorded responses instead of generating mocks
4. **Use case**: Integration tests, regression testing, demos with real data

---

### 3. `mcpmock build` - AI-Assisted Mock Builder

**Purpose**: Generate a pre-configured workspace with GitHub Copilot integration for building realistic mock data.

#### Basic Usage

```bash
# Generate interactive mock builder workspace
mcpmock build --mcpdesc api-inventory.mcpdesc.json

# Output:
# Generated workspace: mock-api-inventory/
# Next steps:
# 1. cd mock-api-inventory
# 2. code .
# 3. Use GitHub Copilot to build mock data
# 4. npm run export
# 5. mcpmock run dump.json --data mock-data/
```

#### Options

- `--mcpdesc <file>` (required) - Path to dump.json
- `--output <dir>` (optional) - Output directory (default: `mock-{server-name}`)

#### Generated Workspace Structure

```
mock-api-inventory/
├── .vscode/
│   └── settings.json           # Copilot enabled, custom prompts
├── mock-data/                  # Mock data files (edit these)
│   ├── search-inventory.json
│   ├── refresh-inventory.json
│   └── ...
├── prompts/                    # Copilot prompt templates
│   ├── tool-response.md
│   ├── resource-data.md
│   └── relationships.md
├── dump.json                   # Copy of input dump
├── package.json                # Scripts for exporting
├── README.md                   # Instructions
└── export.js                   # Export script

```

#### Copilot Integration

**`.vscode/settings.json`**:
```json
{
  "github.copilot.enable": true,
  "github.copilot.chat.codeGeneration.instructions": [
    {
      "file": "prompts/tool-response.md"
    }
  ]
}
```

**`prompts/tool-response.md`** (example):
```markdown
You are generating mock data for an MCP server tool.

# Server: cisco-api-inventory-server
# Tool: search-inventory

## Description
Search and filter Cisco's API/SDK inventory. Supports filtering by kind (API/SDK/GROUP), 
organization (CN, SBG, CTG, CX, etc.), and name with partial matching.

## Input Schema
{
  "kind": "API|SDK|GROUP",
  "organization": "CN|SBG|CTG|CX|Operations|CSDI|Splunk|Sales",
  "name": "string",
  "partial": "boolean",
  "pageSize": "number (1-100)"
}

## Guidelines
- Return realistic Cisco API names (Webex, Meraki, Defense, ThousandEyes, etc.)
- Use valid organizations from schema
- Generate consistent IDs (52, 73, 91, 123, etc.)
- Link IDs to card resources for consistency
- Return 3-5 results by default
- Include pagination metadata (hasMore, cursor)

## Example Output
{
  "results": [
    {"id": 52, "name": "Webex API", "kind": "API", "organization": "SBG"},
    {"id": 73, "name": "Defense API", "kind": "API", "organization": "SBG"}
  ],
  "hasMore": false,
  "cursor": null
}

Generate a realistic response for the search query.
```

#### Workflow

1. **Generate workspace**: `mcpmock build --mcpdesc api-inventory.mcpdesc.json`
2. **Open in VS Code**: `cd mock-api-inventory && code .`
3. **Use Copilot**: Ask Copilot to generate realistic mock data for each tool
4. **Edit JSON files**: Manually refine `mock-data/*.json` files
5. **Export**: Run `npm run export` to validate and package
6. **Run mock**: `mcpmock run dump.json --data mock-data/`

---

## McpDesc Schema Versioning

### Schema Dependency

`mcpmock` **copies** the mcpdesc schema from `mcpcontract` rather than depending on it as a package. This ensures:

- ✅ **Independent releases**: `mcpmock` versions are decoupled from `mcpcontract`
- ✅ **Explicit support**: Each `mcpmock` version declares which mcpdesc schema versions it supports
- ✅ **Forward compatibility**: Newer mcpdesc schemas require explicit `mcpmock` updates

### Version Matrix

| mcpmock Version | Supported McpDesc Schema | Notes |
|-----------------|----------------------|-------|
| v0.1.x | v0.3.1 | Initial release, tools-only |
| v0.2.x | v0.3.1 | Add recording |
| v0.3.x | v0.3.1 | Add AI-assisted builder |
| v0.4.x | v0.3.1, v0.4.0 | Add resources/prompts support |

### Schema Copy Process

**When creating mcpmock repository**:

1. Copy latest `mcpdesc-schema.json` from `mcpcontract/schemas/`
2. Place in `mcpmock/schemas/mcpdesc-schema.json`
3. Document version in README.md and package.json

**When mcpdesc schema updates**:

1. Evaluate compatibility with `mcpmock` features
2. If breaking changes, increment `mcpmock` major version
3. Update `schemas/mcpdesc-schema.json` with new version
4. Update validation logic if needed
5. Update version matrix in README.md

### Version Detection

```typescript
// src/lib/mcpdesc-loader.ts
export class McpDescLoader {
  private SUPPORTED_VERSIONS = [
    'https://developer.cisco.com/mcp-description/schema/0.3.1'
  ];

  load(mcpdescPath: string): McpDescFile {
    const dump = JSON.parse(fs.readFileSync(mcpdescPath, 'utf-8'));
    
    if (!this.SUPPORTED_VERSIONS.includes(dump.version)) {
      throw new Error(
        `Unsupported mcpdesc schema version: ${dump.version}\n` +
        `Supported versions: ${this.SUPPORTED_VERSIONS.join(', ')}\n` +
        `Please upgrade mcpmock or regenerate dump with compatible mcpcontract version.`
      );
    }
    
    return dump;
  }
}
```

---

## Implementation Phases

### Phase 1: `mcpmock run` (v0.1.0) - MVP

**Timeline**: 1-2 weeks (5-8 hours development)

**Scope**:
- ✅ Full MCP protocol (initialize, tools/list, tools/call)
- ✅ Tools only (resources/prompts deferred)
- ✅ Stdio transport only
- ✅ Faker-based mock data generation
- ✅ File-based overrides (`--data` directory)
- ✅ In-memory caching for consistency
- ✅ Verbose logging

**Deliverables**:
- `mcpmock run` command
- Core mock server (`src/lib/mock-server.ts`)
- Faker data generator (`src/lib/faker-generator.ts`)
- McpDesc schema v0.3.1 support
- Basic tests
- README with usage examples

**Mock Data Generation**:

```typescript
// src/lib/faker-generator.ts
import Ajv from 'ajv';
import jsf from 'json-schema-faker';

export class FakerGenerator {
  private cache = new Map<string, any>();
  
  generate(toolName: string, inputSchema: any, arguments: any): any {
    // Check cache first
    const cacheKey = this.getCacheKey(toolName, arguments);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    // Generate from schema
    const mockData = jsf.generate(inputSchema);
    
    // Cache for consistency
    this.cache.set(cacheKey, mockData);
    
    return mockData;
  }
  
  private getCacheKey(toolName: string, args: any): string {
    return `${toolName}:${JSON.stringify(args)}`;
  }
}
```

**Override System**:

```typescript
// src/lib/override-loader.ts
export class OverrideLoader {
  constructor(private dataDir: string) {}
  
  load(toolName: string): any | null {
    const overridePath = path.join(this.dataDir, `${toolName}.json`);
    if (!fs.existsSync(overridePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(overridePath, 'utf-8'));
  }
}
```

**Mock Data Directory Structure**:

```
mock-data/
├── search-inventory.json       # Override for search-inventory tool
├── refresh-inventory.json      # Override for refresh-inventory tool
├── get-organizations.json
├── get-statistics.json
└── ...
```

**File Format**:

```json
// mock-data/search-inventory.json
{
  "results": [
    {
      "id": 52,
      "name": "Webex API",
      "kind": "API",
      "organization": "SBG",
      "description": "Webex platform APIs for messaging, meetings, and calling",
      "status": "ACTIVE"
    },
    {
      "id": 73,
      "name": "Defense API",
      "kind": "API",
      "organization": "SBG",
      "description": "AI-powered security threat detection and response",
      "status": "ACTIVE"
    },
    {
      "id": 91,
      "name": "Meraki Dashboard API",
      "kind": "API",
      "organization": "SBG",
      "description": "Cloud-managed networking platform APIs",
      "status": "ACTIVE"
    }
  ],
  "hasMore": false,
  "cursor": null
}
```

**MCP Protocol Implementation**:

```typescript
// src/lib/mock-server.ts
export class MockServer {
  constructor(
    private dump: McpDescFile,
    private generator: FakerGenerator,
    private overrides: OverrideLoader,
    private verbose: boolean
  ) {}
  
  async start(transport: 'stdio') {
    if (transport === 'stdio') {
      await this.startStdio();
    }
  }
  
  private async startStdio() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });
    
    rl.on('line', async (line) => {
      try {
        const request = JSON.parse(line);
        this.log('←', request.method, request.params);
        
        const response = await this.handleRequest(request);
        
        this.log('→', 'response', response.result || response.error);
        console.log(JSON.stringify(response));
      } catch (error) {
        console.error('Error processing request:', error);
      }
    });
  }
  
  private async handleRequest(req: JSONRPCRequest): Promise<JSONRPCResponse> {
    switch (req.method) {
      case 'initialize':
        return this.handleInitialize(req);
      case 'tools/list':
        return this.handleToolsList(req);
      case 'tools/call':
        return this.handleToolCall(req);
      case 'notifications/initialized':
        return null; // No response for notifications
      default:
        return this.errorMethodNotFound(req);
    }
  }
  
  private handleInitialize(req: JSONRPCRequest): JSONRPCResponse {
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        protocolVersion: this.desc.serverInfo.protocolVersion,
        serverInfo: {
          name: this.desc.serverInfo.name,
          version: this.desc.serverInfo.version
        },
        capabilities: this.desc.serverInfo.capabilities
      }
    };
  }
  
  private handleToolsList(req: JSONRPCRequest): JSONRPCResponse {
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        tools: this.desc.tools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema
        }))
      }
    };
  }
  
  private handleToolCall(req: JSONRPCRequest): JSONRPCResponse {
    const { name, arguments: args } = req.params;
    const tool = this.desc.tools.find(t => t.name === name);
    
    if (!tool) {
      return this.errorToolNotFound(req, name);
    }
    
    // Check for override first
    const override = this.overrides.load(name);
    const mockData = override || this.generator.generate(name, tool.inputSchema, args);
    
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockData, null, 2)
          }
        ]
      }
    };
  }
  
  private log(direction: '←' | '→', method: string, data?: any) {
    if (!this.verbose) return;
    
    const timestamp = new Date().toISOString();
    console.error(`[MCPMOCK] ${direction} ${method}`, data ? JSON.stringify(data) : '');
  }
  
  private errorMethodNotFound(req: JSONRPCRequest): JSONRPCResponse {
    return {
      jsonrpc: '2.0',
      id: req.id,
      error: {
        code: -32601,
        message: `Method not found: ${req.method}`
      }
    };
  }
  
  private errorToolNotFound(req: JSONRPCRequest, toolName: string): JSONRPCResponse {
    return {
      jsonrpc: '2.0',
      id: req.id,
      error: {
        code: -32602,
        message: `Tool not found: ${toolName}`
      }
    };
  }
}
```

---

### Phase 2: `mcpmock record` (v0.2.0)

**Timeline**: 2-3 weeks (8-12 hours development)

**Scope**:
- ✅ Proxy mode (sits between client and real server)
- ✅ Record all JSON-RPC traffic to JSONL
- ✅ Replay mode for `mcpmock run --replay`
- ✅ Support stdio and streamable-http transports

**Deliverables**:
- `mcpmock record` command
- Traffic recorder (`src/lib/traffic-recorder.ts`)
- Replay logic in `MockServer`
- JSONL format documentation

**Architecture**:

```
Client ←→ mcpmock record ←→ Real MCP Server
              ↓
          traffic.jsonl
              ↓
     mcpmock run --replay
              ↓
          Client (testing)
```

**Implementation**:

```typescript
// src/lib/traffic-recorder.ts
export class TrafficRecorder {
  private output: fs.WriteStream;
  
  constructor(outputPath: string) {
    this.output = fs.createWriteStream(outputPath, { flags: 'a' });
  }
  
  recordRequest(request: JSONRPCRequest) {
    this.write({
      timestamp: new Date().toISOString(),
      direction: 'request',
      id: request.id,
      method: request.method,
      params: request.params
    });
  }
  
  recordResponse(response: JSONRPCResponse) {
    this.write({
      timestamp: new Date().toISOString(),
      direction: 'response',
      id: response.id,
      result: response.result,
      error: response.error
    });
  }
  
  private write(entry: any) {
    this.output.write(JSON.stringify(entry) + '\n');
  }
  
  close() {
    this.output.end();
  }
}
```

---

### Phase 3: `mcpmock build` (v0.3.0)

**Timeline**: 3-4 weeks (15-20 hours development)

**Scope**:
- ✅ Generate pre-configured repository
- ✅ GitHub Copilot workspace integration
- ✅ Prompt templates for tool/resource/prompt mocking
- ✅ Export script to package mock data
- ✅ Relationship detection hints

**Deliverables**:
- `mcpmock build` command
- Repository template generator (`src/lib/repo-generator.ts`)
- Copilot prompt templates (`templates/copilot-workspace/prompts/`)
- Export/validation script
- User documentation

**Template Structure**:

```
templates/copilot-workspace/
├── .vscode/
│   └── settings.json
├── mock-data/
│   └── .gitkeep
├── prompts/
│   ├── tool-response.md.hbs
│   ├── resource-data.md.hbs
│   ├── prompt-template.md.hbs
│   └── relationships.md.hbs
├── package.json.hbs
├── README.md.hbs
├── export.js
└── dump.json (copied)
```

**Handlebars Variables**:

```typescript
interface TemplateContext {
  serverName: string;
  serverVersion: string;
  tools: Array<{
    name: string;
    description: string;
    inputSchema: any;
  }>;
  resources: Array<{
    name: string;
    uri: string;
    description: string;
  }>;
  prompts: Array<{
    name: string;
    description: string;
  }>;
}
```

---

### Phase 4: Enhancements (v0.4.0+)

**Scope** (future):
- ✅ Resources support (`resources/list`, `resources/read`)
- ✅ Prompts support (`prompts/list`, `prompts/get`)
- ✅ Streamable HTTP transport
- ✅ SSE transport
- ✅ Stateful mocking (request chaining)
- ✅ Configuration file (`mcpmock.config.yaml`)
- ✅ Mock data validation against schemas
- ✅ Multiple mcpdesc schema version support

---

## Repository Structure

```
mcp-mock/
├── package.json
├── tsconfig.json
├── README.md
├── CHANGELOG.md
├── LICENSE
├── src/
│   ├── index.ts                    # CLI entry (Commander)
│   ├── commands/
│   │   ├── run.ts                  # mcpmock run
│   │   ├── record.ts               # mcpmock record
│   │   └── build.ts                # mcpmock build
│   └── lib/
│       ├── mock-server.ts          # Core mock server (JSON-RPC)
│       ├── faker-generator.ts      # Faker-based data generation
│       ├── override-loader.ts      # Load mock data overrides
│       ├── mcpdesc-loader.ts          # Load/validate mcpdesc files
│       ├── traffic-recorder.ts     # Record traffic to JSONL
│       ├── traffic-replayer.ts     # Replay recorded traffic
│       ├── repo-generator.ts       # Generate Copilot workspace
│       └── types.ts                # Type definitions
├── schemas/
│   └── mcpdesc-schema.json            # Copied from mcpcontract v0.3.1
├── templates/
│   └── copilot-workspace/          # Template for mcpmock build
│       ├── .vscode/
│       ├── prompts/
│       ├── package.json.hbs
│       ├── README.md.hbs
│       └── export.js
├── tests/
│   ├── fixtures/
│   │   ├── mcpdesc/
│   │   ├── mock-data/
│   │   └── traffic/
│   ├── unit/
│   └── integration/
└── docs/
    ├── README.md
    ├── DESIGN.md                   # This document
    └── examples/
        ├── basic-usage.md
        ├── custom-mock-data.md
        └── recording-replay.md
```

---

## Dependencies

### Core Dependencies

```json
{
  "dependencies": {
    "commander": "^11.0.0",
    "ajv": "^8.12.0",
    "json-schema-faker": "^0.5.5",
    "handlebars": "^4.7.8"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.10.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1"
  }
}
```

### No Direct Dependency on mcpcontract

`mcpmock` **does not** depend on `@devnet/mcpcontract` package. Instead:

- Copies `mcpdesc-schema.json` from mcpcontract (versioned)
- Documents supported schema versions in README
- Validates dumps against copied schema
- Updates schema manually when needed

**Rationale**:
- ✅ Independent release cycles
- ✅ Explicit schema version support
- ✅ No coupling between tools
- ✅ Simpler dependency tree

---

## Testing Strategy

### Unit Tests

```typescript
// tests/unit/faker-generator.test.ts
describe('FakerGenerator', () => {
  it('should generate data from JSON Schema', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        count: { type: 'number', minimum: 1, maximum: 10 }
      }
    };
    
    const generator = new FakerGenerator();
    const data = generator.generate('test-tool', schema, {});
    
    expect(data).toHaveProperty('name');
    expect(data.count).toBeGreaterThanOrEqual(1);
    expect(data.count).toBeLessThanOrEqual(10);
  });
  
  it('should cache consistent data for same inputs', () => {
    const generator = new FakerGenerator();
    const data1 = generator.generate('test-tool', schema, { id: 1 });
    const data2 = generator.generate('test-tool', schema, { id: 1 });
    
    expect(data1).toEqual(data2);
  });
});
```

### Integration Tests

```typescript
// tests/integration/mock-server.test.ts
describe('MockServer E2E', () => {
  it('should handle full MCP protocol flow', async () => {
    const dump = loadFixture('api-inventory.mcpdesc.json');
    const server = new MockServer(dump, generator, overrides, false);
    
    // Simulate client requests
    const initResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { capabilities: {} }
    });
    
    expect(initResponse.result.protocolVersion).toBe('2025-06-18');
    
    const toolsResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list'
    });
    
    expect(toolsResponse.result.tools).toHaveLength(6);
    
    const callResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'search-inventory', arguments: {} }
    });
    
    expect(callResponse.result.content[0].type).toBe('text');
  });
});
```

---

## CLI Examples

### Example 1: Quick Mock Server

```bash
# Generate dump from real server
cd ~/projects/mcp-contract
mcpcontract convert --config server-config.json --output api-inventory.mcpdesc.json

# Run mock server
cd ~/projects/mcp-mock
mcpmock run ../mcp-contract/api-inventory.mcpdesc.json --verbose

# Connect with MCP client
# (in another terminal)
mcp-client connect stdio "mcpmock run api-inventory.mcpdesc.json"
```

### Example 2: Custom Mock Data

```bash
# Generate dump
mcpcontract convert --config server-config.json --output api-inventory.mcpdesc.json

# Create custom mock data
mkdir mock-data
cat > mock-data/search-inventory.json << 'EOF'
{
  "results": [
    {"id": 52, "name": "Webex API", "kind": "API", "organization": "SBG"},
    {"id": 73, "name": "Defense API", "kind": "API", "organization": "SBG"}
  ],
  "hasMore": false
}
EOF

# Run with custom data
mcpmock run api-inventory.mcpdesc.json --data mock-data/ --verbose
```

### Example 3: Record and Replay

```bash
# Record real server traffic
mcpmock record --mcpdesc api-inventory.mcpdesc.json --output session-1.jsonl

# (Interact with real server via client...)

# Replay recorded session
mcpmock run api-inventory.mcpdesc.json --replay session-1.jsonl
```

### Example 4: AI-Assisted Builder

```bash
# Generate Copilot workspace
mcpmock build --mcpdesc api-inventory.mcpdesc.json

# Open in VS Code
cd mock-cisco-api-inventory-server
code .

# Use Copilot to generate realistic mock data
# Edit mock-data/*.json files with Copilot assistance

# Export and validate
npm run export

# Run mock server
mcpmock run dump.json --data mock-data/
```

---

## Future Enhancements

### v0.5.0: Configuration File

```yaml
# mcpmock.config.yaml
server:
  transport: stdio
  verbose: true

mock:
  dataDir: ./mock-data
  caching: true

tools:
  search-inventory:
    latency: 100ms  # Simulate network delay
    errorRate: 0.05 # 5% random errors
  
resources:
  card/{id}:
    template: |
      {
        "id": "{id}",
        "name": "Mock API {id}",
        "organization": "SBG"
      }
```

### v0.6.0: Stateful Mocking

```yaml
# mock-data/chains.yaml
chains:
  - name: search-then-details
    steps:
      - tool: search-inventory
        arguments: {organization: "SBG"}
        capture:
          - path: results[0].id
            saveAs: firstApiId
      - resource: card/{firstApiId}
        inject:
          id: "{firstApiId}"
```

### v0.7.0: Performance Testing

```bash
# Load testing mode
mcpmock run api-inventory.mcpdesc.json --load-test --requests 1000 --concurrency 10
```

---

## Success Criteria

### v0.1.0 (MVP)
- ✅ Can run mock server from mcpdesc
- ✅ Responds to `initialize`, `tools/list`, `tools/call`
- ✅ Generates realistic-looking data from schemas
- ✅ Supports custom mock data overrides
- ✅ Works with real MCP clients (tested with mcp-client)

### v0.2.0 (Recording)
- ✅ Can record real server traffic
- ✅ Can replay recorded traffic
- ✅ JSONL format is human-readable
- ✅ Replay is byte-perfect

### v0.3.0 (AI Builder)
- ✅ Generates working Copilot workspace
- ✅ Copilot prompts are effective
- ✅ User can build realistic mock data in <30 minutes
- ✅ Export validates data against schemas

---

## Migration Path

**For existing mcpcontract users**:

```bash
# Old workflow (manual testing)
mcpcontract convert --config server-config.json --output api-inventory.mcpdesc.json
# (manually test against real server)

# New workflow (with mock)
mcpcontract convert --config server-config.json --output api-inventory.mcpdesc.json
mcpmock run api-inventory.mcpdesc.json
# (test against mock, faster, no dependencies)
```

**No breaking changes** to mcpcontract - `mcpmock` is purely additive.

---

## Open Questions

1. **Package naming**: `@devnet/mcp-mock` or `@devnet/mcpmock`?
2. **NPM publishing**: DevNet registry or public npm?
3. **Copilot workspace**: Require GitHub Copilot license, or optional?
4. **Schema updates**: Manual copy or automated sync from mcpcontract releases?

---

## Next Steps

1. **Create repository**: Initialize `mcp-mock` repo
2. **Phase 1 implementation**: Build `mcpmock run` (v0.1.0)
3. **Integration testing**: Test with real MCP clients
4. **Documentation**: Write README, usage examples
5. **Phase 2 planning**: Refine recording/replay requirements

---

**Status**: Ready for implementation (Phase 1)  
**Blockers**: None  
**Dependencies**: mcpcontract mcpdesc schema v0.3.1 (available)
