// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Run command - Start mock MCP server
 */

import { Command } from 'commander';
import { McpDescLoader } from '../lib/mcpdesc-loader.js';
import { OverrideLoader } from '../lib/override-loader.js';
import { MockServer } from '../lib/mock-server.js';
import { TrafficReplayer } from '../lib/traffic-replayer.js';
import {
  McpDescLoadError,
  UnsupportedSchemaVersionError,
  SchemaValidationError,
  ConfigurationError,
  type RunOptions
} from '../lib/types.js';

// ANSI color codes
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

/**
 * Log helper - respects verbose flag
 */
function log(message: string, options: RunOptions): void {
  if (options.verbose) {
    console.error(`${GREEN}[MCPMOCK]${RESET} ${message}`);
  }
}

/**
 * Error handler
 */
function handleError(error: unknown): void {
  if (error instanceof McpDescLoadError) {
    console.error(`\n${RED}✗ McpDesc Load Error:${RESET}`);
    console.error(`  ${error.message}`);
    if (error.filePath) {
      console.error(`  File: ${error.filePath}`);
    }
  } else if (error instanceof UnsupportedSchemaVersionError) {
    console.error(`\n${RED}✗ Unsupported Schema Version:${RESET}`);
    console.error(`  Received: ${error.receivedVersion}`);
    console.error(`  Supported: ${error.supportedVersions.join(', ')}`);
  } else if (error instanceof SchemaValidationError) {
    console.error(`\n${RED}✗ Schema Validation Error:${RESET}`);
    console.error(`  ${error.message}`);
  } else if (error instanceof ConfigurationError) {
    console.error(`\n${RED}✗ Configuration Error:${RESET}`);
    console.error(`  ${error.message}`);
  } else if (error instanceof Error) {
    console.error(`\n${RED}✗ Unexpected Error:${RESET}`);
    console.error(`  ${error.message}`);
    if (error.stack) {
      console.error(`\n  Stack: ${error.stack}`);
    }
  } else {
    console.error(`\n${RED}✗ Unknown Error:${RESET}`);
    console.error(`  ${String(error)}`);
  }
}

/**
 * Main execution
 */
async function executeRun(mcpdescPath: string, options: RunOptions): Promise<void> {
  log('Starting mcpmock run command...', options);
  
  if (options.debug) {
    console.error(`\x1b[34m[DEBUG]\x1b[0m Debug mode enabled - showing detailed matching logic`);
  }

  // Load mcpdesc file
  log(`Loading mcpdesc file: ${mcpdescPath}`, options);
  const loader = new McpDescLoader();
  const desc = await loader.load(mcpdescPath);

  log(`Loaded: ${desc.info.name} v${desc.info.version}`, options);
  log(`Schema version: ${desc.mcpdesc}`, options);

  // Load overrides if specified
  const overrideLoader = new OverrideLoader();
  if (options.data) {
    log(`Loading mock data overrides from: ${options.data}`, options);
    const count = await overrideLoader.load(options.data);
    log(`Loaded ${count} mock data overrides`, options);
  }

  // Load replay traffic if specified
  let replayer: TrafficReplayer | undefined;
  if (options.replay) {
    log(`Loading replay traffic from: ${options.replay}`, options);
    const threshold = options.similarityThreshold ?? 70;
    replayer = new TrafficReplayer(options.debug, threshold);
    await replayer.load(options.replay);
    const stats = replayer.getStats();
    log(`Loaded ${stats.totalResponses} responses for ${stats.methods.length} methods`, options);
    if (threshold !== 70) {
      log(`Using similarity threshold: ${threshold}%`, options);
    }
  }

  // Configure example selection
  const exampleSimilarity = (options.exampleSimilarity ?? 70) / 100; // Convert percentage to 0-1 range
  if (options.exampleSimilarity && options.exampleSimilarity !== 70) {
    log(`Using example similarity threshold: ${options.exampleSimilarity}%`, options);
  }

  // Configure pagination
  if (options.pageSize) {
    log(`Pagination enabled: ${options.pageSize} items per page`, options);
    if (options.replay) {
      log(`Note: Replay mode will use recorded pagination, ignoring --page-size`, options);
    }
  }

  // Start mock server
  const server = new MockServer(
    desc, 
    overrideLoader, 
    options.verbose, 
    options.debug, 
    replayer, 
    exampleSimilarity,
    options.pageSize
  );
  
  if (options.transport === 'streamable-http') {
    log(`Starting HTTP server on port ${options.port}`, options);
    await server.startHttp(options.port);
  } else {
    log('Starting stdio server', options);
    await server.start();
  }
}

/**
 * Create run command
 */
export function runCommand(): Command {
  const cmd = new Command('run');

  cmd
    .description('Start a mock MCP server from an mcpdesc file')
    .argument('<mcpdesc>', 'Path to mcpdesc file (from mcpcontract)')
    .option('--data <dir>', 'Directory containing mock data override files (JSON)')
    .option('--replay <file>', 'Replay recorded traffic from JSONL file')
    .option(
      '--similarity-threshold <percent>',
      'Minimum similarity percentage for replay matches (1-100, default: 70)',
      (value) => {
        const num = parseInt(value, 10);
        if (isNaN(num) || num < 1 || num > 100) {
          throw new ConfigurationError('Similarity threshold must be between 1 and 100');
        }
        return num;
      }
    )
    .option(
      '--example-similarity <percent>',
      'Minimum similarity percentage for example matches (1-100, default: 70)',
      (value) => {
        const num = parseInt(value, 10);
        if (isNaN(num) || num < 1 || num > 100) {
          throw new ConfigurationError('Example similarity threshold must be between 1 and 100');
        }
        return num;
      }
    )
    .option(
      '--page-size <number>',
      'Enable pagination for list operations (tools/list, prompts/list, resources/list, resources/templates/list)',
      (value) => {
        const num = parseInt(value, 10);
        if (isNaN(num) || num < 1) {
          throw new ConfigurationError('Page size must be a positive number');
        }
        return num;
      }
    )
    .option('--transport <type>', 'Transport type: stdio, streamable-http')
    .option('--port <number>', 'Port for HTTP transport', '3000')
    .option('--verbose', 'Enable detailed logging', false)
    .option('--debug', 'Enable debug mode (shows matching logic and full request/response details)', false)
    .action(async (mcpdescPath: string, options: RunOptions) => {
      try {
        // Check if port was explicitly specified before parsing
        const portValue = String(options.port);
        const portSpecified = portValue !== '3000';
        
        // Parse port as number
        options.port = parseInt(portValue, 10);
        
        // Validate: if user explicitly set --transport stdio with custom port, that's an error
        if (options.transport === 'stdio' && portSpecified) {
          throw new ConfigurationError(
            `Cannot use --port with --transport stdio. ` +
            `Either omit --transport to auto-detect streamable-http, or use --transport streamable-http explicitly.`
          );
        }
        
        // Apply defaults and auto-detect
        if (!options.transport) {
          // No transport specified
          if (portSpecified) {
            // Custom port specified → auto-detect streamable-http
            options.transport = 'streamable-http';
            if (options.verbose) {
              console.error(`${GREEN}[MCPMOCK]${RESET} Auto-detected transport: streamable-http (--port specified)`);
            }
          } else {
            // No custom port → default to stdio
            options.transport = 'stdio';
          }
        }
        
        await executeRun(mcpdescPath, options);
      } catch (error) {
        handleError(error);
        process.exit(1);
      }
    });

  cmd.addHelpText('after', `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAMPLES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  # 1. Basic usage - Run mock with auto-generated data (stdio)
  $ mcpmock run weather-server.mcpdesc.json

  # 2. Run with custom mock data overrides
  $ mcpmock run weather-server.mcpdesc.json --data mock-data/

  # 3. Run with HTTP transport
  $ mcpmock run api-server.mcpdesc.json --transport streamable-http --port 3000

  # Record & Replay workflow
  # Step 1: Record real traffic from live server
  $ mcpmock record \\
      --mcpdesc weather-server.mcpdesc.json \\
      --upstream http://real-server:8080 \\
      --output traffic.jsonl \\
      --port 3000

  # Step 2: Replay recorded traffic
  $ mcpmock run weather-server.mcpdesc.json \\
      --replay traffic.jsonl \\
      --port 3000

  # Build & Run workflow (recommended)
  # Step 1: Generate realistic mock data with AI
  $ mcpmock build \\
      --mcpdesc weather-server.mcpdesc.json \\
      --output mock-data/

  # Step 2: Run with generated mocks
  $ mcpmock run weather-server.mcpdesc.json \\
      --data mock-data/ \\
      --transport streamable-http \\
      --port 3000

  # Advanced: Import mcptest execution logs, then replay
  $ mcpmock import --input execution.json --output traffic.jsonl
  $ mcpmock run weather-server.mcpdesc.json --replay traffic.jsonl

  # Debug mode - see detailed matching logic
  $ mcpmock run weather-server.mcpdesc.json --debug --verbose
`);

  return cmd;
}
