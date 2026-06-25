// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Agents Command - AI coding assistant reference guide
 * 
 * Provides markdown-formatted documentation optimized for AI coding assistants
 * like GitHub Copilot, Claude, ChatGPT, etc.
 */

import { Command } from 'commander';

// ============================================================================
// OVERVIEW - Main agent guide with all workflows
// ============================================================================

const OVERVIEW = `# mcpmock - AI Coding Assistants Reference

MCP mock server toolkit for testing, development, and demos.

## Purpose
Helps developers create mock MCP servers from mcpdesc files, record real traffic for replay, and build realistic mock datasets with AI assistance.

## When to Use This Command
- AI coding assistant (Copilot, Claude, ChatGPT, etc.) needs help with mcpmock CLI
- User asks how to use specific commands
- Need to understand workflows for MCP mock server development

## Basic Usage

### Get Command-Specific Help
\`\`\`bash
# Get help for a specific command (~300-700 tokens each)
mcpmock agents --command run
mcpmock agents --command record
\`\`\`

### Get All Workflows
\`\`\`bash
# Show all end-to-end workflows
mcpmock agents --workflows
\`\`\`

### Get Complete Reference
\`\`\`bash
# Get all commands in one document
mcpmock agents --all
\`\`\`

## Common Patterns

### Pattern 1: User Asks "How Do I...?"
\`\`\`bash
# User: "How do I run a mock server?"
# AI runs:
mcpmock agents --command run

# Gets: ~500 tokens of focused help with examples
# AI responds with exact commands from the guide
\`\`\`

### Pattern 2: User Wants Complete Workflow
\`\`\`bash
# User: "Show me how to test my MCP client"
# AI runs:
mcpmock agents --workflows

# Gets: All workflows with step-by-step examples
# AI walks user through Testing Workflow
\`\`\`

### Pattern 3: User Needs Parameter Details
\`\`\`bash
# User: "What parameters does run take?"
# AI runs:
mcpmock agents --command run

# Gets: Command-specific help with all parameters
# AI explains: <dump> positional arg, --data, --port, --verbose, etc.
\`\`\`

## Key Parameters

- \`--command <name>\` - Get help for specific command
  - Available: run, record, completion
- \`--workflows\` - Show all end-to-end workflows
- \`--all\` - Output complete reference in single document

## Available Commands

**run** - Start mock MCP server from mcpdesc file
→ Use when: You have an mcpdesc file and want to run a mock server for testing

**record** - Record traffic from live MCP server
→ Use when: You want to capture real interactions for replay testing

**completion** - Generate shell completion scripts (bash, zsh, fish)
→ Use when: Setting up autocompletion for the CLI

## What You Get

- **Markdown format** - Optimized for LLM consumption
- **Token-efficient** - Modular help saves 80-90% tokens vs full docs
- **Example-rich** - Real command sequences you can use directly
- **Context-aware** - Includes when/why/how for each command

## Next Steps

1. **For specific commands**: Use \`mcpmock agents --command <name>\`
2. **For workflows**: Use \`mcpmock agents --workflows\`
3. **For complete reference**: Use \`mcpmock agents --all\`
4. **For shell completion**: Run \`mcpmock completion bash|zsh|fish\`

## Tips for AI Agents

1. **Start narrow**: Get command-specific help first, not \`--all\`
2. **Use workflows**: Common scenarios are already documented
3. **Pipe context**: Include command output in follow-up questions
4. **Test iteratively**: Start mock server and test with real clients
5. **Check logs**: Use \`--verbose\` flag to debug issues
`;

// ============================================================================
// WORKFLOWS - Common end-to-end workflows
// ============================================================================

const WORKFLOWS = `# Common Workflows

## Workflow 1: Testing MCP Client with Mock Server

**Goal**: Test an MCP client against a mock server without needing a real backend.

\`\`\`bash
# 1. Get or create an mcpdesc file (from mcpcontract or example)
# Assume you have: weather-api.mcpdesc.json

# 2. Create custom mock data (optional)
mkdir -p mock-data/weather
cat > mock-data/weather/get-current.json << 'EOF'
{
  "temperature": 72,
  "conditions": "sunny",
  "location": "San Francisco"
}
EOF

# 3. Start mock server with custom data
mcpmock run weather-api.mcpdesc.json --data mock-data --verbose

# 4. In another terminal, test your MCP client
# The mock server will respond with your custom data
\`\`\`

## Workflow 2: Recording Real Server for Replay

**Goal**: Capture real server interactions to create a realistic mock with smart replay matching.

\`\`\`bash
# 1. Record traffic from live server
mcpmock record \\
  --config mcp-server-config.json \\
  --output traffic.jsonl \\
  --verbose

# 2. Interact with the server through the proxy
# All requests/responses are captured to traffic.jsonl

# 3. Use recording for replay testing with smart matching
mcpmock run \\
  mcpdesc.json \\
  --replay traffic.jsonl \\
  --port 3000

# 4. Exact matches return recorded responses (100% similarity)
# 5. Similar matches return recorded responses (≥70% similarity)
# 6. No match or low similarity falls back to Faker

# Tune threshold for stricter/looser matching
mcpmock run mcpdesc.json --replay traffic.jsonl --similarity-threshold 90  # Strict
mcpmock run mcpdesc.json --replay traffic.jsonl --similarity-threshold 50  # Permissive

# Debug matching decisions
mcpmock run mcpdesc.json --replay traffic.jsonl --debug
\`\`\`

## Workflow 3: HTTP Mock Server for Integration Tests

**Goal**: Run mock server on HTTP for easier integration testing.

\`\`\`bash
# 1. Start HTTP mock server
mcpmock run \\
  api.mcpdesc.json \\
  --data mock-responses \\
  --port 3000 \\
  --verbose

# 2. Configure your client to connect to http://localhost:3000
# 3. Run integration tests against the mock server
\`\`\`

## Workflow 4: Custom Mock Data by Tool Name

**Goal**: Override specific tool responses with realistic data.

\`\`\`bash
# Directory structure:
# mock-data/
#   search-users.json       # For "search-users" tool
#   get-profile.json        # For "get-profile" tool
#   create-ticket.json      # For "create-ticket" tool

# 1. Create override files (tool name = filename)
echo '{"users": [{"id": 1, "name": "Alice"}]}' > mock-data/search-users.json
echo '{"id": 1, "name": "Alice", "email": "alice@example.com"}' > mock-data/get-profile.json

# 2. Run with overrides
mcpmock run app.mcpdesc.json --data mock-data

# Now "search-users" and "get-profile" return your custom data
# Other tools use faker-generated data
\`\`\`

## Decision Tree

**I need to...**
- Test my MCP client → Use \`run\` with an mcpdesc file
- Use custom mock responses → Use \`run --data <directory>\`
- Record real interactions → Use \`record\`
- Debug server behavior → Use \`run --verbose\`
- Run on HTTP for testing → Use \`run --port <port>\`
- Set up shell autocompletion → Use \`completion\`
`;

// ============================================================================
// COMMAND-SPECIFIC GUIDES
// ============================================================================

const RUN_GUIDE = `# run - Start Mock MCP Server

## Purpose
Starts a mock MCP server from an mcpdesc file, serving fake or custom data for testing and development.

## When to Use
- Testing MCP clients without a real server
- Developing against MCP APIs before backend is ready
- Creating demos with consistent mock data
- Integration testing with controlled responses

## Basic Usage
\`\`\`bash
mcpmock run server.mcpdesc.json
\`\`\`

## Common Patterns

### Stdio Transport (Default)
\`\`\`bash
# Start on stdio (for MCP clients that launch servers)
mcpmock run api.mcpdesc.json --verbose
\`\`\`

### HTTP Transport
\`\`\`bash
# Start HTTP server on port 3000
mcpmock run api.mcpdesc.json --port 3000 --verbose
\`\`\`

### With Custom Mock Data
\`\`\`bash
# Override specific tool responses
mcpmock run \\
  api.mcpdesc.json \\
  --data ./mock-data \\
  --verbose
\`\`\`

### With Traffic Replay
\`\`\`bash
# Replay recorded traffic (smart matching)
mcpmock run \\
  api.mcpdesc.json \\
  --replay traffic.jsonl \\
  --port 3000 \\
  --verbose

# Tune similarity threshold (default: 70%)
mcpmock run \\
  api.mcpdesc.json \\
  --replay traffic.jsonl \\
  --similarity-threshold 90 \\
  --port 3000

# Debug matching logic
mcpmock run \\
  api.mcpdesc.json \\
  --replay traffic.jsonl \\
  --debug \\
  --port 3000
\`\`\`

### Quiet Mode (Production-Like)
\`\`\`bash
# No verbose logging, just serve requests
mcpmock run api.mcpdesc.json --port 3000
\`\`\`

## Key Parameters

### Required
- \`<dump>\` - Path to mcpdesc file (from mcpcontract) - positional argument

### Optional
- \`--data <directory>\` - Directory with mock data overrides (JSON files)
- \`--port <number>\` or \`-p <number>\` - Enable HTTP transport on specified port
- \`--replay <file>\` - Replay recorded traffic from JSONL file
- \`--similarity-threshold <percent>\` - Minimum similarity for replay matches (1-100, default: 70)
- \`--debug\` - Enable debug mode with detailed matching analysis
- \`--verbose\` or \`-v\` - Enable detailed logging
- \`--help\` or \`-h\` - Show help

## Mock Data Overrides

Create a directory with JSON files named after tool names:

\`\`\`bash
mock-data/
  search-products.json    # Response for "search-products" tool
  get-user.json          # Response for "get-user" tool
  calculate.json         # Response for "calculate" tool
\`\`\`

Each file contains the mock response:

\`\`\`json
{
  "products": [
    {"id": 1, "name": "Widget", "price": 29.99},
    {"id": 2, "name": "Gadget", "price": 49.99}
  ]
}
\`\`\`

## What You Get

- **MCP Protocol**: Full JSON-RPC 2.0 over stdio or HTTP
- **Auto-generated data**: Faker.js generates realistic data based on schemas
- **Custom overrides**: Your JSON files replace auto-generated responses
- **Consistency**: Same inputs return same outputs (cached)
- **Protocol compliance**: Proper initialize, tools/list, tools/call handling

## Transport Modes

### Stdio (Default)
- Used by MCP clients that launch servers as child processes
- Communication via stdin/stdout
- Logs go to stderr (won't interfere with protocol)

### HTTP (--port)
- Used for web-based clients or testing from curl/Postman
- JSON-RPC over HTTP POST
- Easier for debugging and integration tests

## Verbose Logging

With \`--verbose\`, you'll see:
- Server startup info
- Tool definitions loaded
- Incoming requests (method, params)
- Outgoing responses
- Override file usage
- Faker data generation

## Next Steps After Starting Server

1. **Test with MCP client**: Configure client to connect to mock server
2. **Customize responses**: Add override files in \`--data\` directory
3. **Debug issues**: Use \`--verbose\` to see request/response flow
4. **Integration tests**: Use HTTP mode (\`--port\`) for automated testing

## Troubleshooting

### Server won't start
- Check mcpdesc file exists and is valid JSON
- Verify dump has required fields (serverInfo, tools, etc.)
- Use \`--verbose\` to see error details

### Tools not responding correctly
- Check tool name in dump matches override filename
- Verify override JSON is valid
- Use \`--verbose\` to see which data source is used

### HTTP mode not working
- Ensure port is not already in use
- Check firewall settings
- Try different port with \`--port <number>\`

### Mock data doesn't match schema
- Faker generates data based on JSON Schema in dump
- Provide custom overrides for specific responses
- Check inputSchema in mcpdesc file matches your expectations
`;

const RECORD_GUIDE = `# record - Record MCP Server Traffic

## Purpose
Captures requests and responses from a live MCP server to JSONL format for replay and analysis.

## When to Use
- Creating realistic mock data from production server
- Debugging protocol issues by inspecting traffic
- Building test fixtures from real interactions
- Documenting actual server behavior

## Basic Usage
\`\`\`bash
mcpmock record --config mcp.json --output traffic.jsonl
\`\`\`

## Common Patterns

### From MCP Config File (Recommended)
\`\`\`bash
# Using standard MCP configuration file
mcpmock record --config mcp.json --output recordings/session1.jsonl --verbose
\`\`\`

### Direct Server Connection (stdio)
\`\`\`bash
mcpmock record \\
  --server-name "my-server" \\
  --transport stdio \\
  --command "node" \\
  --args "server.js" \\
  --output traffic.jsonl \\
  --verbose
\`\`\`

### HTTP Transport
\`\`\`bash
mcpmock record \\
  --server-name "api-server" \\
  --transport streamable-http \\
  --url https://api.example.com/mcp \\
  --output traffic.jsonl \\
  --verbose
\`\`\`

### With Custom Headers
\`\`\`bash
mcpmock record \\
  --config mcp.json \\
  --headers "Authorization: Bearer TOKEN" \\
  --headers "X-API-Key: abc123" \\
  --output traffic.jsonl
\`\`\`

## Key Parameters

### Required (choose one approach)
- \`--config <file>\` or \`-c <file>\` - MCP server configuration file (recommended)
- \`--server-name <name>\` + \`--transport\` - Direct connection

### Optional
- \`--output <file>\` or \`-o <file>\` - Output JSONL file (default: stdout)
- \`--format <type>\` or \`-f <type>\` - Output format: jsonl (default: jsonl)
- \`--verbose\` or \`-v\` - Enable verbose logging
- \`--command <cmd>\` - Server command (for stdio transport)
- \`--args <args>\` - Server arguments (for stdio transport)
- \`--url <url>\` or \`-u <url>\` - Server URL (for HTTP transports)
- \`--headers <key:value>\` or \`-H <key:value>\` - HTTP headers (can use multiple times)

## What You Get

A JSONL file where each line is a JSON object representing one request/response pair:

\`\`\`jsonl
{"timestamp":"2024-12-10T10:30:00.000Z","request":{"jsonrpc":"2.0","method":"initialize",...},"response":{...}}
{"timestamp":"2024-12-10T10:30:01.000Z","request":{"jsonrpc":"2.0","method":"tools/list",...},"response":{...}}
{"timestamp":"2024-12-10T10:30:02.000Z","request":{"jsonrpc":"2.0","method":"tools/call",...},"response":{...}}
\`\`\`

## Recording Format

Each line contains:
- **timestamp**: ISO 8601 timestamp of when request was received
- **request**: Complete JSON-RPC request object
- **response**: Complete JSON-RPC response object
- **duration**: Time taken to process (milliseconds)

## How It Works

1. mcpmock acts as a transparent proxy
2. Forwards all requests to the real server
3. Captures both request and response
4. Writes to JSONL file
5. Returns response to client (passthrough)

## Next Steps After Recording

1. **Analyze traffic**: Inspect JSONL to understand server behavior
2. **Extract test data**: Use recordings to create mock data overrides
3. **Replay traffic**: Use \`mcpmock run --replay\` (Phase 2)
4. **Debug issues**: Review protocol violations or errors

## Troubleshooting

### Server connection fails
- Verify server is running and accessible
- Check transport type matches server (stdio/HTTP)
- Use \`--verbose\` to see connection attempts

### No data recorded
- Ensure client is actually making requests
- Check output file permissions
- Verify server is responding (use \`--verbose\`)

### Recording incomplete
- Server may have crashed during recording
- Check server logs for errors
- JSONL format allows partial recordings to be useful

### Large file size
- JSONL can grow quickly with many requests
- Consider separate files per session
- Compress with gzip for storage
`;

const COMPLETION_GUIDE = `# completion - Shell Completion Scripts

## Purpose
Generates shell completion scripts for bash, zsh, or fish to enable tab-completion of mcpmock commands and options.

## When to Use
- Setting up development environment
- Improving CLI productivity
- Enabling tab-completion for team members

## Basic Usage
\`\`\`bash
# Auto-detect shell and show script + instructions
mcpmock completion

# Generate for specific shell
mcpmock completion bash
mcpmock completion zsh
mcpmock completion fish
\`\`\`

## Installation

### Bash
\`\`\`bash
# Add to ~/.bashrc
echo 'eval "$(mcpmock completion bash)"' >> ~/.bashrc
source ~/.bashrc
\`\`\`

### Zsh
\`\`\`bash
# Add to ~/.zshrc
echo 'eval "$(mcpmock completion zsh)"' >> ~/.zshrc
source ~/.zshrc
\`\`\`

### Fish
\`\`\`bash
# Save to fish completions directory
mcpmock completion fish > ~/.config/fish/completions/mcpmock.fish
# Fish auto-loads on next session
\`\`\`

## What You Get

- **Command completion**: Tab to see available commands (run, record, etc.)
- **Option completion**: Tab to see available options (--data, --port, --replay, etc.)
- **File completion**: Automatic file/directory completion for path arguments
- **Context-aware**: Only shows relevant options for current command

## Supported Shells

- **bash** - Bourne Again SHell (most common on Linux)
- **zsh** - Z Shell (default on macOS since Catalina)
- **fish** - Friendly Interactive SHell

## Troubleshooting

### Completion not working
- Restart shell or source config file again
- Check completion script was added to correct file
- Verify bash-completion package installed (bash only)

### Wrong shell detected
- Explicitly specify shell: \`mcpmock completion bash\`
- Check SHELL environment variable: \`echo $SHELL\`
`;

// ============================================================================
// COMMAND INTERFACE
// ============================================================================

interface AgentsOptions {
  command?: string;
  workflows?: boolean;
  all?: boolean;
}

export function agentsCommand(): Command {
  const cmd = new Command('agents');

  cmd
    .description('AI coding assistant reference (optimized for Copilot, Claude, ChatGPT, etc.)')
    .option('--command <name>', 'Get help for specific command: run, record, completion')
    .option('--workflows', 'Show all end-to-end workflows')
    .option('--all', 'Output complete reference in single document')
    .action((options: AgentsOptions) => {
      // Default: show overview
      if (!options.command && !options.workflows && !options.all) {
        console.log(OVERVIEW);
        return;
      }

      // Show all
      if (options.all) {
        console.log(OVERVIEW);
        console.log('\n---\n');
        console.log(WORKFLOWS);
        console.log('\n---\n');
        console.log(RUN_GUIDE);
        console.log('\n---\n');
        console.log(RECORD_GUIDE);
        console.log('\n---\n');
        console.log(COMPLETION_GUIDE);
        return;
      }

      // Show workflows
      if (options.workflows) {
        console.log(WORKFLOWS);
        return;
      }

      // Command-specific guides
      if (options.command) {
        const guides: Record<string, string> = {
          run: RUN_GUIDE,
          record: RECORD_GUIDE,
          completion: COMPLETION_GUIDE
        };

        const guide = guides[options.command];
        if (guide) {
          console.log(guide);
        } else {
          console.error(`Unknown command: ${options.command}`);
          console.error('');
          console.error('Available commands:');
          console.error('  run, record, completion');
          console.error('');
          console.error('Usage: mcpmock agents --command <name>');
          console.error('       mcpmock agents --workflows');
          console.error('       mcpmock agents --all');
          process.exit(1);
        }
      }
    });

  return cmd;
}
