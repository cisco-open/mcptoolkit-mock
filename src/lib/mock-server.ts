// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Mock MCP server - Implements JSON-RPC protocol over stdio and HTTP
 */

import { createInterface } from 'node:readline';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type {
  McpDescFile,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
  JSONRPCError,
  Tool
} from './types.js';
import { FakerGenerator } from './faker-generator.js';
import { OverrideLoader } from './override-loader.js';
import { ExampleSelector } from './example-selector.js';
import type { TrafficReplayer } from './traffic-replayer.js';

// ANSI color codes for logging
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

/**
 * Features extracted from mcpdesc file
 */
interface ServerFeatures {
  corsEnabled: boolean; // Always true for HTTP/SSE transports
}

/**
 * Core mock server implementing MCP protocol
 */
export class MockServer {
  private desc: McpDescFile;
  private faker: FakerGenerator;
  private overrides: OverrideLoader;
  private exampleSelector: ExampleSelector;
  private replayer?: TrafficReplayer;
  private verbose: boolean;
  private debug: boolean;
  private features: ServerFeatures;
  private pageSize?: number;

  constructor(
    desc: McpDescFile, 
    overrides: OverrideLoader, 
    verbose: boolean = false,
    debug: boolean = false,
    replayer?: TrafficReplayer,
    exampleSimilarity: number = 0.7,
    pageSize?: number
  ) {
    this.desc = desc;
    this.faker = new FakerGenerator();
    this.overrides = overrides;
    this.exampleSelector = new ExampleSelector(desc, exampleSimilarity);
    this.replayer = replayer;
    this.verbose = verbose;
    this.debug = debug;
    this.features = { corsEnabled: true };
    this.pageSize = pageSize;
  }

  /**
   * Get CORS headers for responses
   * Per design doc: proxies/mocks MUST support CORS for browser compatibility
   */
  private getCorsHeaders(additionalExposeHeaders: string[] = []): Record<string, string> {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Origin': '*'
    };

    // Build expose headers list
    const exposeHeaders = ['Content-Type', ...additionalExposeHeaders];

    headers['Access-Control-Expose-Headers'] = exposeHeaders.join(', ');

    return headers;
  }

  /**
   * Log message to stderr (preserves stdout for protocol)
   */
  private log(message: string, color: string = GREEN): void {
    if (this.verbose) {
      console.error(`${color}[MCPMOCK]${RESET} ${message}`);
    }
  }

  /**
   * Debug log message to stderr (more detailed than verbose)
   */
  private debugLog(message: string): void {
    if (this.debug) {
      const BLUE = '\x1b[34m';
      console.error(`${BLUE}[DEBUG]${RESET} ${message}`);
    }
  }

  /**
   * Handle initialize request
   */
  private handleInitialize(request: JSONRPCRequest): JSONRPCResponse {
    this.log(`← initialize`, CYAN);

    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: request.id!,
      result: {
        protocolVersion: this.desc.info.protocolVersion || '2025-06-18',
        capabilities: this.desc.capabilities || {},
        serverInfo: {
          name: this.desc.info.name,
          version: this.desc.info.version
        }
      }
    };

    this.log(`→ initialize (success)`, GREEN);
    return response;
  }

  /**
   * Handle ping request
   * 
   * Ping is an optional MCP utility for connection health monitoring.
   * Responds with empty object per MCP spec 2025-11-25.
   * 
   * If dump indicates pingSupported: false, still respond (mock is always available).
   * If replay mode and ping was recorded, return recorded response.
   */
  private handlePing(request: JSONRPCRequest): JSONRPCResponse {
    this.log(`← ping`, CYAN);

    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: request.id!,
      result: {}
    };

    this.log(`→ pong`, GREEN);
    return response;
  }

  /**
   * Apply pagination to a list of items (MCP spec compliant)
   * 
   * Implements cursor-based pagination per MCP 2024-11-05 spec:
   * - Cursor is base64-encoded JSON containing offset
   * - Returns items for current page + nextCursor if more exist
   * - Invalid cursors return error -32602
   * 
   * @param items - Full array of items to paginate
   * @param cursor - Optional cursor from client (base64-encoded)
   * @param pageSize - Items per page (undefined = no pagination)
   * @param listName - Name for error messages (e.g., 'tools', 'prompts')
   * @returns Paginated result or error object
   */
  private paginateList<T>(
    items: T[],
    cursor: string | undefined,
    pageSize: number | undefined,
    listName: string
  ): { items: T[]; nextCursor?: string } | JSONRPCError {
    
    // No pagination if pageSize not set (return all items)
    if (!pageSize) {
      return { items };
    }

    // Decode cursor to get offset
    let offset = 0;
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
        if (typeof decoded.offset !== 'number' || decoded.offset < 0) {
          return {
            code: -32602,
            message: `Invalid cursor for ${listName}: offset must be a non-negative number`
          };
        }
        offset = decoded.offset;
      } catch (error) {
        return {
          code: -32602,
          message: `Invalid cursor for ${listName}: unable to decode`
        };
      }
    }

    // Check if offset is out of bounds
    if (offset >= items.length && items.length > 0) {
      return {
        code: -32602,
        message: `Invalid cursor for ${listName}: offset ${offset} out of bounds (total: ${items.length})`
      };
    }

    // Slice items for current page
    const pageItems = items.slice(offset, offset + pageSize);

    // Generate nextCursor if more items exist
    const result: { items: T[]; nextCursor?: string } = { items: pageItems };
    if (offset + pageSize < items.length) {
      const nextOffset = offset + pageSize;
      result.nextCursor = Buffer.from(JSON.stringify({ offset: nextOffset })).toString('base64');
    }

    return result;
  }

  /**
   * Handle tools/list request
   */
  private handleToolsList(request: JSONRPCRequest): JSONRPCResponse {
    this.log(`← tools/list`, CYAN);

    const params = request.params as { cursor?: string } | undefined;
    const cursor = params?.cursor;

    // Apply pagination
    const paginationResult = this.paginateList(this.desc.tools || [], cursor, this.pageSize, 'tools');
    
    // Handle pagination error
    if ('code' in paginationResult) {
      this.log(`→ Error: ${paginationResult.message}`, YELLOW);
      return {
        jsonrpc: '2.0',
        id: request.id!,
        error: paginationResult
      };
    }

    // Build response
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: request.id!,
      result: {
        tools: paginationResult.items,
        ...(paginationResult.nextCursor && { nextCursor: paginationResult.nextCursor })
      }
    };

    const pageInfo = paginationResult.nextCursor 
      ? `page of ${paginationResult.items.length}, more available`
      : `${paginationResult.items.length} total`;
    this.log(`→ tools/list (${pageInfo})`, GREEN);
    
    return response;
  }

  /**
   * Handle prompts/list request
   */
  private handlePromptsList(request: JSONRPCRequest): JSONRPCResponse {
    this.log(`← prompts/list`, CYAN);

    const params = request.params as { cursor?: string } | undefined;
    const cursor = params?.cursor;

    // Apply pagination
    const paginationResult = this.paginateList(this.desc.prompts || [], cursor, this.pageSize, 'prompts');
    
    // Handle pagination error
    if ('code' in paginationResult) {
      this.log(`→ Error: ${paginationResult.message}`, YELLOW);
      return {
        jsonrpc: '2.0',
        id: request.id!,
        error: paginationResult
      };
    }

    // Build response
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: request.id!,
      result: {
        prompts: paginationResult.items,
        ...(paginationResult.nextCursor && { nextCursor: paginationResult.nextCursor })
      }
    };

    const pageInfo = paginationResult.nextCursor 
      ? `page of ${paginationResult.items.length}, more available`
      : `${paginationResult.items.length} total`;
    this.log(`→ prompts/list (${pageInfo})`, GREEN);
    
    return response;
  }

  /**
   * Handle prompts/get request
   */
  private handlePromptsGet(request: JSONRPCRequest): JSONRPCResponse {
    const params = request.params as { name: string; arguments?: Record<string, unknown> };
    const promptName = params.name;
    const args = params.arguments || {};

    this.log(`← prompts/get (${promptName})`, CYAN);

    // Find the prompt
    const prompts = this.desc.prompts || [];
    const prompt = prompts.find((p) => p.name === promptName);
    
    if (!prompt) {
      const availablePrompts = prompts.map((p) => p.name);
      const error: JSONRPCError = {
        code: -32602,
        message: `Prompt not found: ${promptName}`,
        data: { availablePrompts }
      };

      this.log(`→ Error: Prompt not found`, YELLOW);
      return {
        jsonrpc: '2.0',
        id: request.id!,
        error
      };
    }

    // Validate required arguments
    if (prompt.arguments) {
      const requiredArgs = prompt.arguments.filter(arg => arg.required === true);
      const missingArgs = requiredArgs
        .filter(arg => !(arg.name in args))
        .map(arg => arg.name);

      if (missingArgs.length > 0) {
        const error: JSONRPCError = {
          code: -32602,
          message: `Missing required arguments for prompt '${promptName}': ${missingArgs.join(', ')}`,
          data: {
            missingArguments: missingArgs,
            requiredArguments: requiredArgs.map(arg => ({
              name: arg.name,
              description: arg.description
            }))
          }
        };

        this.log(`→ Error: Missing required arguments`, YELLOW);
        return {
          jsonrpc: '2.0',
          id: request.id!,
          error
        };
      }
    }

    // Generate mock prompt messages
    // MCP spec expects prompts/get to return messages array
    const messages = [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Mock prompt: ${prompt.description || promptName}`
        }
      }
    ];

    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: request.id!,
      result: {
        description: prompt.description,
        messages
      }
    };

    this.log(`→ Mock prompt messages generated`, GREEN);
    return response;
  }

  /**
   * Handle resources/list request
   */
  private handleResourcesList(request: JSONRPCRequest): JSONRPCResponse {
    this.log(`← resources/list`, CYAN);

    const params = request.params as { cursor?: string } | undefined;
    const cursor = params?.cursor;

    // Apply pagination
    const paginationResult = this.paginateList(this.desc.resources || [], cursor, this.pageSize, 'resources');
    
    // Handle pagination error
    if ('code' in paginationResult) {
      this.log(`→ Error: ${paginationResult.message}`, YELLOW);
      return {
        jsonrpc: '2.0',
        id: request.id!,
        error: paginationResult
      };
    }

    // Build response
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: request.id!,
      result: {
        resources: paginationResult.items,
        ...(paginationResult.nextCursor && { nextCursor: paginationResult.nextCursor })
      }
    };

    const pageInfo = paginationResult.nextCursor 
      ? `page of ${paginationResult.items.length}, more available`
      : `${paginationResult.items.length} total`;
    this.log(`→ resources/list (${pageInfo})`, GREEN);
    
    return response;
  }

  /**
   * Handle resources/templates/list request
   */
  private handleResourceTemplatesList(request: JSONRPCRequest): JSONRPCResponse {
    this.log(`← resources/templates/list`, CYAN);

    const params = request.params as { cursor?: string } | undefined;
    const cursor = params?.cursor;

    // Apply pagination
    const paginationResult = this.paginateList(this.desc.resourceTemplates || [], cursor, this.pageSize, 'resourceTemplates');
    
    // Handle pagination error
    if ('code' in paginationResult) {
      this.log(`→ Error: ${paginationResult.message}`, YELLOW);
      return {
        jsonrpc: '2.0',
        id: request.id!,
        error: paginationResult
      };
    }

    // Build response
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: request.id!,
      result: {
        resourceTemplates: paginationResult.items,
        ...(paginationResult.nextCursor && { nextCursor: paginationResult.nextCursor })
      }
    };

    const pageInfo = paginationResult.nextCursor 
      ? `page of ${paginationResult.items.length}, more available`
      : `${paginationResult.items.length} total`;
    this.log(`→ resources/templates/list (${pageInfo})`, GREEN);
    
    return response;
  }

  /**
   * Handle resources/read request
   */
  private async handleResourcesRead(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const params = request.params as { uri: string };
    const resourceUri = params.uri;

    this.log(`← resources/read (${resourceUri})`, CYAN);

    // Try to find static resource first
    const resources = this.desc.resources || [];
    const staticResource = resources.find((r) => r.uri === resourceUri);
    
    if (staticResource) {
      // Generate mock content based on MIME type
      const content = await this.generateResourceContent(staticResource.uri, staticResource.mimeType);
      
      const response: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: request.id!,
        result: {
          contents: [
            {
              uri: staticResource.uri,
              mimeType: staticResource.mimeType || 'text/plain',
              text: content
            }
          ]
        }
      };

      this.log(`→ resources/read (static resource)`, GREEN);
      return response;
    }

    // Try resource templates
    const resourceTemplates = this.desc.resourceTemplates || [];
    for (const template of resourceTemplates) {
      const match = this.matchUriTemplate(template.uriTemplate, resourceUri);
      if (match) {
        // Generate mock content based on MIME type
        const content = await this.generateResourceContent(resourceUri, template.mimeType, match.variables);
        
        const response: JSONRPCResponse = {
          jsonrpc: '2.0',
          id: request.id!,
          result: {
            contents: [
              {
                uri: resourceUri,
                mimeType: template.mimeType || 'text/plain',
                text: content
              }
            ]
          }
        };

        this.log(`→ resources/read (from template: ${template.uriTemplate})`, GREEN);
        return response;
      }
    }

    // Resource not found
    const availableUris = resources.map((r) => r.uri);
    const availableTemplates = resourceTemplates.map((t) => t.uriTemplate);
    
    const error: JSONRPCError = {
      code: -32602,
      message: `Resource not found: ${resourceUri}`,
      data: { 
        availableResources: availableUris,
        availableTemplates: availableTemplates
      }
    };

    this.log(`→ Error: Resource not found`, YELLOW);
    return {
      jsonrpc: '2.0',
      id: request.id!,
      error
    };
  }

  /**
   * Match URI against template pattern (simple implementation)
   * Supports basic {variable} syntax from RFC 6570
   */
  private matchUriTemplate(template: string, uri: string): { matched: boolean; variables: Record<string, string> } | null {
    // Convert template to regex pattern
    // Example: "card:///{id}" → "^card:///([^/]+)$"
    // Example: "file:///{path}" → "^file:///(.+)$" (path can have slashes)
    const pattern = template.replace(/\{([^}]+)\}/g, '(.+)');
    const regex = new RegExp(`^${pattern}$`);
    
    const match = uri.match(regex);
    if (!match) {
      return null;
    }

    // Extract variable names from template
    const variableNames: string[] = [];
    const varRegex = /\{([^}]+)\}/g;
    let varMatch;
    while ((varMatch = varRegex.exec(template)) !== null) {
      variableNames.push(varMatch[1]);
    }

    // Build variables object
    const variables: Record<string, string> = {};
    for (let i = 0; i < variableNames.length; i++) {
      variables[variableNames[i]] = match[i + 1];
    }

    return { matched: true, variables };
  }

  /**
   * Generate mock resource content based on MIME type
   */
  private async generateResourceContent(
    uri: string, 
    mimeType: string | undefined, 
    variables?: Record<string, string>
  ): Promise<string> {
    const type = mimeType || 'text/plain';

    // Handle different MIME types
    if (type === 'application/json' || type.includes('+json')) {
      // Generate mock JSON data
      const nameData = await this.faker.generate({ name: 'mock-resource', inputSchema: { type: 'object', properties: { name: { type: 'string' } } } }, {}) as any;
      const mockData = {
        uri,
        ...(variables && { id: variables.id || variables.name }),
        name: nameData.name || 'Mock Resource',
        description: 'This is a mock resource generated by mcpmock',
        data: await this.faker.generate(
          { name: 'mock-data', inputSchema: { type: 'object', properties: {} } },
          {}
        )
      };
      return JSON.stringify(mockData, null, 2);
    } else if (type === 'text/plain' || type.startsWith('text/')) {
      // Generate mock text content
      return `This is mock text content for resource: ${uri}\n\nGenerated by mcpmock for testing purposes.`;
    } else {
      // Default fallback
      return `Mock content for ${uri} (${type})`;
    }
  }

  /**
   * Handle tools/call request
   */
  private async handleToolsCall(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const params = request.params as { name: string; arguments?: Record<string, unknown> };
    const toolName = params.name;
    const args = params.arguments || {};

    this.log(`← tools/call (${toolName})`, CYAN);

    // Find the tool
    const tools = this.desc.tools || [];
    const tool = tools.find((t: Tool) => t.name === toolName);
    
    if (!tool) {
      const availableTools = tools.map((t: Tool) => t.name);
      const error: JSONRPCError = {
        code: -32602,
        message: `Tool not found: ${toolName}`,
        data: { availableTools }
      };

      this.log(`→ Error: Tool not found`, YELLOW);
      return {
        jsonrpc: '2.0',
        id: request.id!,
        error
      };
    }

    // Validate required properties from inputSchema
    if (tool.inputSchema.required && Array.isArray(tool.inputSchema.required)) {
      const missingProps = tool.inputSchema.required.filter(prop => !(prop in args));

      if (missingProps.length > 0) {
        const requiredPropsInfo = missingProps.map(prop => {
          const propSchema = tool.inputSchema.properties?.[prop] as any;
          return {
            name: prop,
            description: propSchema?.description || 'No description available'
          };
        });

        const error: JSONRPCError = {
          code: -32602,
          message: `Missing required arguments for tool '${toolName}': ${missingProps.join(', ')}`,
          data: {
            missingArguments: missingProps,
            requiredArguments: requiredPropsInfo
          }
        };

        this.log(`→ Error: Missing required arguments`, YELLOW);
        return {
          jsonrpc: '2.0',
          id: request.id!,
          error
        };
      }
    }

    // Priority order for mock data:
    // 1. File-based overrides (--data directory)
    // 2. Response examples from dump (schema 0.3.4+)
    // 3. Faker generator (fallback)
    
    let mockData: unknown;

    // Check for override first
    if (this.overrides.has(toolName)) {
      mockData = this.overrides.get(toolName);
      this.log(`→ tools/call (mock from override)`, GREEN);
      this.debugLog(`Override file used for tool: ${toolName}`);
    } else {
      // Try to use example from dump
      const exampleData = this.exampleSelector.select(toolName, args);
      
      if (exampleData !== null) {
        mockData = exampleData;
        this.log(`→ tools/call (example from dump)`, GREEN);
        
        // Debug logging for example selection
        if (this.debug) {
          const debugInfo = this.exampleSelector.getDebugInfo(toolName, args);
          this.debugLog(`Example selected for tool: ${toolName}`);
          this.debugLog(`  Available examples: ${debugInfo.exampleCount}`);
          this.debugLog(`  Cached: ${debugInfo.cached}`);
          if (debugInfo.similarityScores && debugInfo.similarityScores.length > 0) {
            this.debugLog(`  Similarity scores:`);
            for (const score of debugInfo.similarityScores) {
              const percentage = (score.score * 100).toFixed(1);
              this.debugLog(`    - ${score.description}: ${percentage}%`);
            }
          }
        }
      } else {
        // Fall back to faker generation
        this.debugLog(`No examples available for tool: ${toolName}, using faker`);
        this.debugLog(`Tool schema: ${JSON.stringify(tool.inputSchema, null, 2)}`);
        this.debugLog(`Arguments received: ${JSON.stringify(args, null, 2)}`);
        mockData = await this.faker.generate(tool, args);
        this.log(`→ tools/call (faker generated)`, YELLOW);
        this.debugLog(`Generated data preview: ${JSON.stringify(mockData).substring(0, 300)}...`);
      }
    }

    // Build MCP tools/call response per spec 2025-06-18.
    // When the tool declares an outputSchema and the resolved payload is a
    // JSON object (or array), also populate structuredContent so that hosts
    // that consume the typed path receive data.  The content text block is
    // always included for backward compatibility.
    const resultPayload: Record<string, unknown> = {
      content: [
        {
          type: 'text',
          text: JSON.stringify(mockData, null, 2)
        }
      ]
    };

    if (tool.outputSchema && mockData !== null && typeof mockData === 'object') {
      resultPayload.structuredContent = mockData;

      // Debug: validate payload against outputSchema and warn on mismatch
      if (this.debug) {
        this.validateStructuredContent(tool.name, mockData, tool.outputSchema);
      }
    }

    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: request.id!,
      result: resultPayload
    };

    return response;
  }

  /**
   * Validate structuredContent against outputSchema using Ajv.
   * Logs a warning to stderr if the payload does not conform.
   * Only called in debug mode to avoid overhead in normal operation.
   */
  private validateStructuredContent(
    toolName: string,
    data: unknown,
    schema: Record<string, unknown>
  ): void {
    try {
      // Lazily import Ajv to avoid adding startup cost when validation is unused
      const Ajv = require('ajv');
      const ajv = new Ajv.default({ strict: false });
      const validate = ajv.compile(schema);
      const valid = validate(data);
      if (!valid) {
        const errors = validate.errors?.map((e: any) => `${e.instancePath} ${e.message}`).join('; ');
        console.error(`${YELLOW}[WARN]${RESET} structuredContent for tool '${toolName}' does not fully conform to outputSchema: ${errors}`);
      }
    } catch {
      // Ajv compile/validate failure — skip validation silently
    }
  }

  /**
   * Handle notifications/initialized notification
   */
  private handleNotificationInitialized(): void {
    this.log(`← notifications/initialized`, CYAN);
    // No response for notifications
  }

  /**
   * Handle incoming JSON-RPC request/notification
   */
  private async handleMessage(message: JSONRPCRequest | JSONRPCNotification): Promise<JSONRPCResponse | null> {
    try {
      // Handle notifications (no id field)
      if (!('id' in message) || message.id === undefined) {
        const notification = message as JSONRPCNotification;
        if (notification.method === 'notifications/initialized') {
          this.handleNotificationInitialized();
        }
        return null; // Notifications don't get responses
      }

      // Handle requests
      const request = message as JSONRPCRequest;

      // Check if we have a recorded response to replay
      if (this.replayer) {
        const recorded = this.replayer.getResponse(request);
        if (recorded) {
          // Format timestamp for logging
          const recordedDate = new Date(recorded.entry.timestamp);
          const dateStr = recordedDate.toISOString().split('T')[0]; // YYYY-MM-DD
          const timeStr = recordedDate.toTimeString().split(' ')[0]; // HH:MM:SS
          
          // Log with method-specific details
          if (request.method === 'initialize') {
            this.log(`← initialize`, CYAN);
            this.log(`✓ Replayed from recording (${dateStr} ${timeStr})`, GREEN);
          } else if (request.method === 'tools/call') {
            const params = request.params as { name?: string };
            const toolName = params?.name || 'unknown';
            this.log(`← tools/call (${toolName})`, CYAN);
            this.log(`✓ Replayed from recording (${dateStr} ${timeStr})`, GREEN);
          } else if (request.method === 'prompts/get') {
            const params = request.params as { name?: string };
            const promptName = params?.name || 'unknown';
            this.log(`← prompts/get (${promptName})`, CYAN);
            this.log(`✓ Replayed from recording (${dateStr} ${timeStr})`, GREEN);
          } else {
            this.log(`← ${request.method}`, CYAN);
            this.log(`✓ Replayed from recording (${dateStr} ${timeStr})`, GREEN);
          }
          
          return recorded.response;
        }
      }

      switch (request.method) {
        case 'initialize':
          return this.handleInitialize(request);

        case 'ping':
          return this.handlePing(request);

        case 'tools/list':
          return this.handleToolsList(request);

        case 'tools/call':
          return await this.handleToolsCall(request);

        case 'prompts/list':
          return this.handlePromptsList(request);

        case 'prompts/get':
          return this.handlePromptsGet(request);

        case 'resources/list':
          return this.handleResourcesList(request);

        case 'resources/templates/list':
          return this.handleResourceTemplatesList(request);

        case 'resources/read':
          return await this.handleResourcesRead(request);

        default:
          // Method not found error
          this.log(`← ${request.method} (not implemented)`, YELLOW);
          return {
            jsonrpc: '2.0',
            id: request.id!,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`
            }
          };
      }
    } catch (error) {
      // Internal error
      this.log(`Error handling message: ${error instanceof Error ? error.message : String(error)}`, YELLOW);
      
      if ('id' in message && message.id !== undefined) {
        return {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32603,
            message: 'Internal error',
            data: error instanceof Error ? error.message : String(error)
          }
        };
      }
      return null;
    }
  }

  /**
   * Start the mock server (stdio transport)
   */
  async start(): Promise<void> {
    this.log(`Starting MCP mock server`, GREEN);
    this.log(`Loaded: ${this.desc.info.name} v${this.desc.info.version}`, GREEN);
    this.log(`Protocol: ${this.desc.info.protocolVersion || '2025-06-18'}`, GREEN);
    this.log(`Transport: stdio`, GREEN);
    this.log(`Capabilities: ${(this.desc.tools || []).length} tools | ${(this.desc.resources || []).length} resources | ${(this.desc.prompts || []).length} prompts`, GREEN);
    
    if (this.overrides.getCount() > 0) {
      this.log(`Mock data: ${this.overrides.getCount()} overrides loaded`, GREEN);
    }

    this.log(`Ready. Waiting for client connection...`, GREEN);

    // Set up stdio readline interface
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    // Process incoming lines
    rl.on('line', async (line: string) => {
      try {
        // Parse JSON-RPC message
        const message = JSON.parse(line) as JSONRPCRequest | JSONRPCNotification;

        // Handle the message
        const response = await this.handleMessage(message);

        // Send response if not a notification
        if (response) {
          console.log(JSON.stringify(response));
        }
      } catch (error) {
        this.log(`Failed to parse message: ${error instanceof Error ? error.message : String(error)}`, YELLOW);
      }
    });

    // Handle stdin close
    rl.on('close', () => {
      this.log(`Client disconnected`, YELLOW);
      process.exit(0);
    });
  }

  /**
   * Start HTTP server (streamable-http transport)
   */
  async startHttp(port: number): Promise<void> {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // Handle OPTIONS preflight for CORS
      if (req.method === 'OPTIONS') {
        this.log(`← OPTIONS (CORS preflight)`, CYAN);
        
        const corsHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400' // 24 hours
        };

        res.writeHead(204, corsHeaders);
        res.end();
        
        this.log(`→ 204 No Content (CORS preflight successful)`, GREEN);
        return;
      }

      // Handle DELETE for explicit session termination (best practice)
      // Per MCP best practices: servers SHOULD support DELETE for cleanup
      if (req.method === 'DELETE') {
        this.log(`← DELETE (session termination)`, CYAN);
        
        const corsHeaders = this.getCorsHeaders();
        res.writeHead(204, {
          'Content-Type': 'text/plain',
          ...corsHeaders
        });
        res.end();
        
        this.log(`→ 204 No Content (session terminated)`, GREEN);
        return;
      }

      // Only accept POST requests for actual MCP calls
      if (req.method !== 'POST') {
        const corsHeaders = this.getCorsHeaders();
        res.writeHead(405, {
          'Content-Type': 'text/plain',
          ...corsHeaders
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

          // Handle the message (logging happens inside handleMessage)
          const response = await this.handleMessage(request);

          // Get CORS headers
          const corsHeaders = this.getCorsHeaders();

          // Send response
          if (response) {
            res.writeHead(200, {
              'Content-Type': 'application/json',
              ...corsHeaders
            });
            res.end(JSON.stringify(response));
          } else {
            // Notification - no response
            res.writeHead(204, corsHeaders);
            res.end();
          }
        } catch (error) {
          this.log(`Failed to parse request: ${error instanceof Error ? error.message : String(error)}`, YELLOW);

          // Send parse error response (JSON-RPC error in 200 OK response)
          const errorResponse: JSONRPCResponse = {
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: 'Parse error',
              data: error instanceof Error ? error.message : String(error)
            }
          };

          const corsHeaders = this.getCorsHeaders();
          res.writeHead(200, {
            'Content-Type': 'application/json',
            ...corsHeaders
          });
          res.end(JSON.stringify(errorResponse));
        }
      });

      // Handle request errors
      req.on('error', (error) => {
        this.log(`Request error: ${error.message}`, YELLOW);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      });
    });

    // Start listening
    server.listen(port, () => {
      this.log(`HTTP server listening on http://localhost:${port}`, GREEN);
      
      // Log detected features
      if (this.features.corsEnabled) {
        this.log(`CORS enabled (browser-ready)`, GREEN);
      }
      
      console.error(`${GREEN}[MCPMOCK]${RESET} Server ready (press Ctrl+C to stop)`);
    });

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`${YELLOW}[MCPMOCK]${RESET} Port ${port} is already in use`);
        process.exit(1);
      } else {
        console.error(`${YELLOW}[MCPMOCK]${RESET} Server error: ${error.message}`);
        process.exit(1);
      }
    });
  }
}
