// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Record command - Run proxy server to record MCP traffic
 */

import { Command } from 'commander';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { McpDescLoader } from '../lib/mcpdesc-loader.js';
import { TrafficRecorder } from '../lib/traffic-recorder.js';
import type { RecordOptions, JSONRPCRequest, JSONRPCResponse, ConfigurationError } from '../lib/types.js';

// ANSI color codes
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

/**
 * Log helper - respects verbose flag
 */
function log(message: string, options: RecordOptions, color: string = GREEN): void {
  if (options.verbose) {
    console.error(`${color}[MCPMOCK]${RESET} ${message}`);
  }
}

/**
 * Error handler
 */
function handleError(error: unknown): void {
  if ((error as { name?: string }).name === 'ConfigurationError') {
    const configError = error as ConfigurationError;
    console.error(`\n${RED}❌ Configuration Error:${RESET}`);
    console.error(`   ${configError.message}`);
  } else if (error instanceof Error) {
    console.error(`\n${RED}❌ Unexpected Error:${RESET}`);
    console.error(`   ${error.message}`);
    if (error.stack) {
      console.error(`\n   Stack: ${error.stack}`);
    }
  } else {
    console.error(`\n${RED}❌ Unknown Error:${RESET}`);
    console.error(`   ${String(error)}`);
  }
}

/**
 * Parse Server-Sent Events (SSE) response into JSON
 */
function parseSSE(sseText: string): JSONRPCResponse {
  // SSE format: "event: message\ndata: {...}\n\n"
  const lines = sseText.split('\n');
  let jsonData = '';
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      jsonData += line.substring(6); // Remove "data: " prefix
    }
  }
  
  if (!jsonData) {
    throw new Error('No JSON data found in SSE response');
  }
  
  return JSON.parse(jsonData) as JSONRPCResponse;
}

/**
 * Forward request to upstream server
 */
async function forwardRequest(
  upstreamUrl: string, 
  request: JSONRPCRequest, 
  sessionId: string | null = null,
  forcedSessionHeader: string | null = null,
  verbose: boolean = false
): Promise<{ response: JSONRPCResponse; sessionId: string | null; sessionHeader: string | null }> {
  if (verbose) {
    console.error(`${CYAN}[MCPMOCK]${RESET} Forwarding to: ${upstreamUrl}`);
    console.error(`${CYAN}[MCPMOCK]${RESET} Request: ${JSON.stringify(request, null, 2)}`);
    if (sessionId) {
      console.error(`${CYAN}[MCPMOCK]${RESET} Session ID: ${sessionId}`);
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream'
  };

  // Add session ID header if available
  if (sessionId) {
    const headerName = forcedSessionHeader || 'MCP-Session-Id'; // Use override or default
    headers[headerName] = sessionId;
    if (verbose && forcedSessionHeader) {
      console.error(`${CYAN}[MCPMOCK]${RESET} Using forced session header: ${headerName}`);
    }
  }

  const response = await fetch(upstreamUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(request)
  });

  if (verbose) {
    console.error(`${CYAN}[MCPMOCK]${RESET} Response status: ${response.status} ${response.statusText}`);
    console.error(`${CYAN}[MCPMOCK]${RESET} Response Content-Type: ${response.headers.get('content-type')}`);
    
    // Log all response headers for debugging
    console.error(`${CYAN}[MCPMOCK]${RESET} Response headers:`);
    response.headers.forEach((value, key) => {
      console.error(`${CYAN}[MCPMOCK]${RESET}   ${key}: ${value}`);
    });
  }

  // Capture session ID from response headers (case-insensitive search)
  let newSessionId: string | null = null;
  let sessionHeader: string | null = forcedSessionHeader; // Use forced header if specified
  
  if (forcedSessionHeader) {
    // Use forced header name directly
    const headerValue = response.headers.get(forcedSessionHeader);
    if (headerValue) {
      newSessionId = headerValue;
    }
  } else {
    // Auto-detect session header with different casings
    const sessionHeaderVariants = ['mcp-session-id', 'Mcp-Session-Id', 'MCP-Session-Id'];
    for (const headerName of sessionHeaderVariants) {
      const headerValue = response.headers.get(headerName);
      if (headerValue) {
        newSessionId = headerValue;
        sessionHeader = headerName; // Preserve exact casing from server
        break;
      }
    }
  }
  
  // Fallback to existing session ID if no new one found
  if (!newSessionId) {
    newSessionId = sessionId;
  }

  if (verbose && newSessionId && newSessionId !== sessionId) {
    console.error(`${CYAN}[MCPMOCK]${RESET} New Session ID received: ${newSessionId}`);
    if (sessionHeader) {
      console.error(`${CYAN}[MCPMOCK]${RESET} Session header name: ${sessionHeader}`);
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    if (verbose) {
      console.error(`${RED}[MCPMOCK]${RESET} Error response: ${errorText}`);
    }
    throw new Error(`Upstream server returned ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  let jsonResponse: JSONRPCResponse;

  if (contentType.includes('text/event-stream')) {
    // Handle SSE response (streamable-http)
    const sseText = await response.text();
    if (verbose) {
      console.error(`${CYAN}[MCPMOCK]${RESET} SSE Response: ${sseText.substring(0, 200)}...`);
    }
    jsonResponse = parseSSE(sseText);
  } else {
    // Handle regular JSON response
    jsonResponse = await response.json() as JSONRPCResponse;
  }

  if (verbose) {
    console.error(`${CYAN}[MCPMOCK]${RESET} Parsed Response: ${JSON.stringify(jsonResponse, null, 2)}`);
  }

  return { response: jsonResponse, sessionId: newSessionId, sessionHeader };
}

/**
 * Main execution
 */
async function executeRecord(options: RecordOptions): Promise<void> {
  log('Starting mcpmock record command...', options);

  // Load mcpdesc file for metadata
  log(`Loading mcpdesc file: ${options.mcpdesc}`, options);
  const loader = new McpDescLoader();
  const desc = await loader.load(options.mcpdesc);
  
  log(`Loaded: ${desc.info.name} v${desc.info.version}`, options);
  log(`Schema version: ${desc.mcpdesc}`, options);

  // Initialize traffic recorder
  log(`Recording traffic to: ${options.output}`, options);
  const recorder = new TrafficRecorder(options.output);

  // Parse upstream URL and extract path
  let upstreamUrl: string;
  let proxyPath: string;
  try {
    const url = new URL(options.upstream);
    // Use the URL exactly as provided by user
    upstreamUrl = url.toString();
    
    // Extract path from upstream URL (default for proxy)
    proxyPath = options.path || url.pathname || '/';
  } catch (error) {
    throw new Error(`Invalid upstream URL: ${options.upstream}`);
  }

  log(`Upstream server: ${upstreamUrl}`, options);
  log(`Starting proxy on port ${options.port}`, options);

  // Extract server info
  const expectedServerVersion = desc.info.version;
  const expectedProtocolVersion = desc.info.protocolVersion;

  if (options.sessionHeader) {
    log(`Session header override: ${options.sessionHeader}`, options);
  }

  // Track session ID across requests
  let sessionId: string | null = null;
  let sessionValidated = false; // Track if we've validated session behavior
  let forcedSessionHeader = options.sessionHeader || null; // User override

  // Create HTTP proxy server
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Check if request is for the correct path
    if (req.url !== proxyPath) {
      res.writeHead(404, {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(`Not Found - Proxy only handles requests to ${proxyPath}`);
      return;
    }

    // Handle OPTIONS preflight for CORS (browser compatibility)
    if (req.method === 'OPTIONS') {
      log(`← OPTIONS (CORS preflight)`, options, CYAN);
      
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Session-Id, Mcp-Session-Id',
        'Access-Control-Expose-Headers': 'Content-Type, MCP-Session-Id, Mcp-Session-Id',
        'Access-Control-Max-Age': '86400' // 24 hours
      };

      // Add custom session header if specified
      if (forcedSessionHeader) {
        corsHeaders['Access-Control-Allow-Headers'] += `, ${forcedSessionHeader}`;
        corsHeaders['Access-Control-Expose-Headers'] += `, ${forcedSessionHeader}`;
      }

      res.writeHead(204, corsHeaders);
      res.end();
      
      log(`→ 204 No Content (CORS preflight successful)`, options, GREEN);
      return;
    }

    // Handle DELETE for explicit session termination
    // Forward to upstream and clear local session tracking
    if (req.method === 'DELETE') {
      log(`← DELETE (session termination)`, options, CYAN);

      try {
        // Forward DELETE to upstream server
        const headers: Record<string, string> = {};
        
        // Include session ID header if we have one
        if (sessionId) {
          const headerName = forcedSessionHeader || 'MCP-Session-Id';
          headers[headerName] = sessionId;
          log(`Forwarding DELETE with session: ${sessionId}`, options, CYAN);
        }

        const response = await fetch(upstreamUrl, {
          method: 'DELETE',
          headers
        });

        log(`Upstream DELETE response: ${response.status} ${response.statusText}`, options, CYAN);

        // Clear local session tracking
        if (sessionId) {
          log(`Clearing session: ${sessionId}`, options, CYAN);
          sessionId = null;
        }

        // Forward response to client
        res.writeHead(response.status, {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(await response.text());

        log(`→ DELETE (${response.status})`, options, CYAN);
      } catch (error) {
        log(`Failed to forward DELETE: ${error instanceof Error ? error.message : String(error)}`, options, YELLOW);
        
        // Return error to client
        res.writeHead(500, {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        });
        res.end('Failed to forward DELETE request');
      }
      return;
    }

    // Only accept POST requests for JSON-RPC calls
    if (req.method !== 'POST') {
      res.writeHead(405, {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      });
      res.end('Method Not Allowed');
      return;
    }

    // Read request body
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        // Parse JSON-RPC request
        const request = JSON.parse(body) as JSONRPCRequest;

        log(`← ${request.method}`, options, CYAN);

        // Record the request
        recorder.recordRequest(request);

        // Detect client restart/new session
        if (request.method === 'initialize' && sessionId !== null) {
          log(
            `⚠️  WARNING: New initialize detected while session ${sessionId} is active`,
            options,
            YELLOW
          );
          log(
            `   This proxy supports single-session recording. Previous session will be replaced.`,
            options,
            YELLOW
          );
          log(
            `   If you need multi-client support, run separate proxy instances.`,
            options,
            YELLOW
          );
        }

        // Clear session ID on new initialize (client restart)
        // Initialize should always create a new session, not reuse old one
        const requestSessionId = request.method === 'initialize' ? null : sessionId;

        // Forward to upstream server with session ID (unless initializing)
        const { response: upstreamResponse, sessionId: newSessionId, sessionHeader } = 
          await forwardRequest(upstreamUrl, request, requestSessionId, forcedSessionHeader, options.verbose);

        // Validate session behavior on first initialize
        if (request.method === 'initialize' && !sessionValidated) {
          sessionValidated = true;

          // Check protocol version
          const initResult = upstreamResponse.result as { protocolVersion?: string; serverInfo?: { version?: string } } | undefined;
          if (expectedProtocolVersion && initResult?.protocolVersion) {
            const actualProtocolVersion = initResult.protocolVersion;
            if (actualProtocolVersion !== expectedProtocolVersion) {
              log(
                `⚠️  WARNING: Protocol version mismatch - mcpdesc expects ${expectedProtocolVersion}, server returned ${actualProtocolVersion}`,
                options,
                YELLOW
              );
            }
          }

          // Check server version (info only, not warning)
          if (initResult?.serverInfo?.version) {
            const actualServerVersion = initResult.serverInfo.version;
            if (actualServerVersion !== expectedServerVersion) {
              log(
                `ℹ️  INFO: Server version difference - mcpdesc: ${expectedServerVersion}, server: ${actualServerVersion}`,
                options,
                CYAN
              );
            }
          }
        }

        // Update session tracking
        if (newSessionId) {
          sessionId = newSessionId;
        }

        // Record the response
        recorder.recordResponse(upstreamResponse);

        // Prepare CORS headers with session ID exposure
        const responseHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'Content-Type'
        };

        // Add session ID header if present
        if (newSessionId && sessionHeader) {
          responseHeaders[sessionHeader] = newSessionId;
          responseHeaders['Access-Control-Expose-Headers'] += `, ${sessionHeader}`;
        }

        // Send response to client
        res.writeHead(200, responseHeaders);
        res.end(JSON.stringify(upstreamResponse));

        log(`→ ${request.method} (${upstreamResponse.error ? 'error' : 'success'})`, options, CYAN);
      } catch (error) {
        log(`Failed to proxy request: ${error instanceof Error ? error.message : String(error)}`, options, YELLOW);

        // Send error response
        const errorResponse: JSONRPCResponse = {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32603,
            message: 'Proxy error',
            data: error instanceof Error ? error.message : String(error)
          }
        };

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(errorResponse));
      }
    });

    // Handle request errors
    req.on('error', (error) => {
      log(`Request error: ${error.message}`, options, YELLOW);
      res.writeHead(500, {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      });
      res.end('Internal Server Error');
    });
  });

  // Start listening
  server.listen(options.port, () => {
    const proxyUrl = `http://localhost:${options.port}${proxyPath}`;
    log(`Proxy server listening on ${proxyUrl}`, options, GREEN);
    console.error(`${GREEN}[MCPMOCK]${RESET} Recording traffic (press Ctrl+C to stop)`);
    console.error(`${GREEN}[MCPMOCK]${RESET} Output file: ${options.output}`);
  });

  // Handle server errors
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`${YELLOW}[MCPMOCK]${RESET} Port ${options.port} is already in use`);
      process.exit(1);
    } else {
      console.error(`${YELLOW}[MCPMOCK]${RESET} Server error: ${error.message}`);
      process.exit(1);
    }
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.error(`\n${YELLOW}[MCPMOCK]${RESET} Shutting down...`);
    server.close();
    await recorder.close();
    console.error(`${GREEN}[MCPMOCK]${RESET} Recording saved to: ${options.output}`);
    process.exit(0);
  });
}

/**
 * Create record command
 */
export function recordCommand(): Command {
  const cmd = new Command('record');

  cmd
    .description('Record MCP traffic from real server (HTTP proxy mode)')
    .requiredOption('--mcpdesc <file>', 'Path to mcpdesc file (for metadata)')
    .requiredOption('--output <file>', 'Path to output JSONL file')
    .requiredOption('--upstream <url>', 'URL of real MCP server (e.g., http://localhost:3001/mcp)')
    .option('--port <number>', 'Port for proxy to listen on', '3000')
    .option('--path <path>', 'Path for proxy endpoint (default: extracted from upstream URL)')
    .option('--session-header <name>', 'Override session header name (e.g., Mcp-Session-Id, mcp-session-id)')
    .option('--verbose', 'Enable detailed logging', false)
    .action(async (options: RecordOptions) => {
      try {
        // Parse port as number
        options.port = parseInt(options.port as unknown as string, 10);
        if (isNaN(options.port) || options.port < 1 || options.port > 65535) {
          throw new Error('Port must be a number between 1 and 65535');
        }

        await executeRecord(options);
      } catch (error) {
        handleError(error);
        process.exit(1);
      }
    });

  cmd.addHelpText('after', `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAMPLES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  # 1. Basic recording - Proxy between client and real server
  $ mcpmock record \\
      --mcpdesc weather-server.mcpdesc.json \\
      --upstream http://localhost:8080/mcp \\
      --output traffic.jsonl \\
      --port 3000

  # 2. Then replay the recorded traffic
  $ mcpmock run weather-server.mcpdesc.json --replay traffic.jsonl --port 3000

  # 3. Recording with custom session header name
  $ mcpmock record \\
      --mcpdesc api-server.mcpdesc.json \\
      --upstream http://real-server:8080 \\
      --output traffic.jsonl \\
      --port 3000 \\
      --session-header "Mcp-Session-Id"

  # 4. Recording with verbose logging (see all requests/responses)
  $ mcpmock record \\
      --mcpdesc weather-server.mcpdesc.json \\
      --upstream http://localhost:8080 \\
      --output traffic.jsonl \\
      --port 3000 \\
      --verbose
`);

  return cmd;
}
