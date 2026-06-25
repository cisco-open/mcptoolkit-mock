// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Import command - Convert mcptest execution logs to mcpmock JSONL format
 */

import { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { TrafficEntry } from '../lib/types.js';

// ANSI color codes
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

/**
 * CLI options for import command
 */
interface ImportOptions {
  executionLog: string;
  output: string;
  verbose: boolean;
}

/**
 * mcptest execution log structure (subset)
 */
interface ExecutionLog {
  version: string;
  metadata: {
    dumpVersion: string;
    serverInfo: {
      name: string;
      version: string;
    };
  };
  executions: Array<{
    scenarioName: string;
    toolName: string;
    arguments: Record<string, unknown>;
    response: {
      success: boolean;
      duration?: number;
      result?: unknown;
      error?: {
        code: string;
        message: string;
      };
    };
    timestamp: string;
  }>;
}

/**
 * Log helper - respects verbose flag
 */
function log(message: string, verbose: boolean): void {
  if (verbose) {
    console.error(`${GREEN}[MCPMOCK]${RESET} ${message}`);
  }
}

/**
 * Error handler
 */
function handleError(error: unknown): void {
  if (error instanceof Error) {
    console.error(`\n${RED}❌ Error:${RESET}`);
    console.error(`   ${error.message}`);
    if (error.stack) {
      console.error(`\n   ${error.stack}`);
    }
  } else {
    console.error(`\n${RED}❌ Unknown Error:${RESET}`);
    console.error(`   ${String(error)}`);
  }
}

/**
 * Convert execution log entry to JSONL traffic entries
 * 
 * Creates request/response pairs for mcpmock replay
 */
function convertToTrafficEntries(execution: ExecutionLog['executions'][0], requestId: number): TrafficEntry[] {
  const entries: TrafficEntry[] = [];
  
  // Create request entry (tools/call)
  const requestEntry: TrafficEntry = {
    timestamp: execution.timestamp,
    direction: 'request',
    id: requestId,
    method: 'tools/call',
    params: {
      name: execution.toolName,
      arguments: execution.arguments
    }
  };
  entries.push(requestEntry);
  
  // Create response entry
  const responseEntry: TrafficEntry = {
    timestamp: execution.timestamp,
    direction: 'response',
    id: requestId,
    result: execution.response.success ? execution.response.result : undefined,
    error: execution.response.error ? {
      code: -32603, // Internal error
      message: execution.response.error.message,
      data: {
        code: execution.response.error.code
      }
    } : undefined
  };
  entries.push(responseEntry);
  
  return entries;
}

/**
 * Main execution
 */
async function runImport(options: ImportOptions): Promise<void> {
  log('Starting import...', options.verbose);
  
  // Resolve paths
  const executionLogPath = resolve(options.executionLog);
  const outputPath = resolve(options.output);
  
  log(`Reading execution log: ${executionLogPath}`, options.verbose);
  
  // Load execution log
  const content = await readFile(executionLogPath, 'utf-8');
  const executionLog: ExecutionLog = JSON.parse(content);
  
  log(`Loaded execution log v${executionLog.version}`, options.verbose);
  log(`Server: ${executionLog.metadata.serverInfo.name} v${executionLog.metadata.serverInfo.version}`, options.verbose);
  log(`Executions: ${executionLog.executions.length}`, options.verbose);
  
  // Convert executions to traffic entries
  log('Converting executions to JSONL format...', options.verbose);
  
  const allEntries: TrafficEntry[] = [];
  let requestId = 1;
  
  for (const execution of executionLog.executions) {
    const entries = convertToTrafficEntries(execution, requestId);
    allEntries.push(...entries);
    requestId++;
  }
  
  log(`Generated ${allEntries.length} traffic entries (${executionLog.executions.length} request/response pairs)`, options.verbose);
  
  // Write JSONL file
  log(`Writing JSONL to: ${outputPath}`, options.verbose);
  
  const jsonlContent = allEntries
    .map(entry => JSON.stringify(entry))
    .join('\n') + '\n';
  
  await writeFile(outputPath, jsonlContent, 'utf-8');
  
  // Success summary
  console.log(`\n${GREEN}✓${RESET} Import complete!`);
  console.log(`\nConversion Summary:`);
  console.log(`  Execution log:    ${options.executionLog}`);
  console.log(`  Server:           ${executionLog.metadata.serverInfo.name} v${executionLog.metadata.serverInfo.version}`);
  console.log(`  Executions:       ${executionLog.executions.length}`);
  console.log(`  Traffic entries:  ${allEntries.length} (${executionLog.executions.length} req/resp pairs)`);
  console.log(`  Output:           ${outputPath}`);
  console.log(`\nNext Steps:`);
  console.log(`  1. Run mock server with replay:`);
  console.log(`     mcpmock run <mcpdesc-file> --replay ${outputPath}`);
  console.log(`  2. Test with MCP client:`);
  console.log(`     mcp-inspector stdio://mcpmock --args run,<mcpdesc-file>,--replay,${outputPath}`);
}

/**
 * Create import command
 */
export function importCommand(): Command {
  const cmd = new Command('import');
  
  cmd
    .description('Import mcptest execution log and convert to mcpmock JSONL format')
    .requiredOption('--execution-log <path>', 'Path to mcptest execution log (JSON)')
    .requiredOption('--output <path>', 'Path to output JSONL file')
    .option('--verbose', 'Enable detailed logging', false)
    .action(async (options: ImportOptions) => {
      try {
        await runImport(options);
      } catch (error) {
        handleError(error);
        process.exit(1);
      }
    });
  
  cmd.addHelpText('after', `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAMPLES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  # Complete mcptest → mcpmock workflow
  
  # Step 1: Run tests with mcptest (generates execution log)
  $ mcptest \\
      --file weather-tests.mcp.yaml \\
      --dump weather-server.dump.json
  
  # Step 2: Import execution log to JSONL format
  $ mcpmock import \\
      --execution-log execution.json \\
      --output traffic.jsonl
  
  # Step 3: Replay with mcpmock
  $ mcpmock run weather-server.mcpdesc.json --replay traffic.jsonl
  
  # With verbose logging
  $ mcpmock import \\
      --execution-log execution.json \\
      --output traffic.jsonl \\
      --verbose
`);

  return cmd;
}
