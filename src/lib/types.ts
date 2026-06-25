// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Type definitions for mcpmock tool
 */

// ============================================================================
// MCP Protocol Types (aligned with 2025-06-18 specification)
// ============================================================================

export interface ServerCapabilities {
  experimental?: Record<string, unknown>;
  logging?: Record<string, unknown>;
  prompts?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  tools?: {
    listChanged?: boolean;
  };
  completions?: Record<string, unknown>;
}

export interface ClientCapabilities {
  experimental?: Record<string, unknown>;
  roots?: {
    listChanged?: boolean;
  };
  sampling?: Record<string, unknown>;
}

export interface ServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
  capabilities: ServerCapabilities;
  instructions?: string;
}

export interface Tool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
  outputSchema?: {
    type: string;
    properties?: Record<string, unknown>;
    [key: string]: unknown;
  };
  annotations?: Record<string, unknown>;
  tags?: string[];
  deprecated?: boolean;
}

export interface Resource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  annotations?: {
    audience?: string[];
    priority?: number;
    [key: string]: unknown;
  };
  tags?: string[];
  deprecated?: boolean;
}

export interface ResourceTemplate {
  uriTemplate: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  annotations?: {
    audience?: string[];
    priority?: number;
    [key: string]: unknown;
  };
  tags?: string[];
  deprecated?: boolean;
}

export interface PromptArgument {
  name: string;
  title?: string;
  description?: string;
  required?: boolean;
}

export interface Prompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: PromptArgument[];
  tags?: string[];
  deprecated?: boolean;
}

export interface Root {
  uri: string;
  name?: string;
}

// ============================================================================
// McpDesc Structure Types (from mcpdesc schema v0.7.0)
// ============================================================================

export interface McpDescContact {
  name?: string;
  url?: string;
  email?: string;
}

export interface McpDescLicense {
  name: string;
  url?: string;
}

export interface McpDescInfo {
  name: string;
  title?: string;
  description?: string;
  version: string;
  protocolVersion?: string;
  id?: string;
  websiteUrl?: string;
  contact?: McpDescContact;
  license?: McpDescLicense;
}

export interface McpDescTransport {
  type: 'streamable-http' | 'stdio' | 'sse';
  url?: string; // For HTTP/SSE transports
  command?: string; // For stdio transport
  args?: string[];
  env?: Record<string, string>;
}

export interface McpDescTag {
  name: string;
  description?: string;
}

export interface McpDescFile {
  mcpdesc: string; // Schema version (e.g., '0.7.0')
  info: McpDescInfo;
  transports: McpDescTransport[];
  capabilities?: ServerCapabilities;
  tools?: Tool[];
  resources?: Resource[];
  resourceTemplates?: ResourceTemplate[];
  prompts?: Prompt[];
  tags?: McpDescTag[];
}

// ============================================================================
// JSON-RPC Protocol Types (for mock server)
// ============================================================================

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown> | unknown[];
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JSONRPCError;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown> | unknown[];
}

// ============================================================================
// CLI Options Types
// ============================================================================

export type Transport = 'stdio' | 'streamable-http';

export interface RunOptions {
  data?: string; // Directory containing mock data overrides (optional)
  replay?: string; // Path to JSONL replay file (optional)
  similarityThreshold?: number; // Minimum similarity percentage for replay matches (1-100, default: 70)
  exampleSimilarity?: number; // Minimum similarity percentage for example matches (1-100, default: 70)
  pageSize?: number; // Page size for list operations (optional, enables pagination)
  verbose: boolean; // Enable detailed logging (default: false)
  debug: boolean; // Enable debug mode with extensive logging (default: false)
  transport: Transport; // Transport type (default: stdio)
  port: number; // Port for HTTP transport (default: 3000)
}

export interface RecordOptions {
  mcpdesc: string; // Path to mcpdesc file (for metadata)
  output: string; // Path to output JSONL file (required)
  upstream: string; // URL of real MCP server (required)
  port: number; // Port for proxy to listen on (default: 3000)
  path?: string; // Path for proxy endpoint (default: extracted from upstream URL)
  sessionHeader?: string; // Override session header name (default: auto-detect)
  verbose: boolean; // Enable detailed logging (default: false)
}

// ============================================================================
// Traffic Recording Types
// ============================================================================

export interface TrafficEntry {
  timestamp: string; // ISO 8601 timestamp
  direction: 'request' | 'response'; // Request to server or response from server
  id: number | string | null; // JSON-RPC request ID
  method?: string; // JSON-RPC method (for requests)
  params?: Record<string, unknown> | unknown[]; // Request parameters
  result?: unknown; // Response result
  error?: JSONRPCError; // Response error
}

// ============================================================================
// Custom Error Classes
// ============================================================================

/**
 * Error thrown when mcpdesc file cannot be loaded
 */
export class McpDescLoadError extends Error {
  constructor(message: string, public filePath?: string) {
    super(message);
    this.name = 'McpDescLoadError';
  }
}

/**
 * @deprecated Use McpDescLoadError instead
 */
export const DumpLoadError = McpDescLoadError;

/**
 * Error thrown when mcpdesc schema version is not supported
 */
export class UnsupportedSchemaVersionError extends Error {
  constructor(
    public receivedVersion: string,
    public supportedVersions: string[]
  ) {
    super(
      `Unsupported mcpdesc schema version: ${receivedVersion}. ` +
      `Supported versions: ${supportedVersions.join(', ')}`
    );
    this.name = 'UnsupportedSchemaVersionError';
  }
}

/**
 * Error thrown when mcpdesc file fails schema validation
 */
export class SchemaValidationError extends Error {
  constructor(message: string, public errors?: unknown[]) {
    super(message);
    this.name = 'SchemaValidationError';
  }
}

/**
 * Error thrown when configuration is invalid
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Error thrown when a tool is not found
 */
export class ToolNotFoundError extends Error {
  constructor(public toolName: string, public availableTools: string[]) {
    super(
      `Tool not found: ${toolName}. ` +
      `Available tools: ${availableTools.join(', ')}`
    );
    this.name = 'ToolNotFoundError';
  }
}

/**
 * Error thrown when mock data generation fails
 */
export class MockDataGenerationError extends Error {
  constructor(message: string, public toolName?: string) {
    super(message);
    this.name = 'MockDataGenerationError';
  }
}

// ============================================================================
// CLI Options Types
// ============================================================================

export interface BuildOptions {
  mcpdesc: string;
  output: string;
  ai?: boolean;  // Note: Commander.js converts --no-ai to ai: false
  verbose: boolean;
}
