// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Traffic replayer - Replay recorded JSON-RPC traffic from JSONL file
 * 
 * Implements 3-level smart matching:
 * 1. Exact argument match: method + tool/prompt name + arguments (best match)
 * 2. Tool/prompt name match: method + tool/prompt name, any arguments (good match)
 * 3. Method-only match: method only (fallback)
 * 4. Faker generation if no match found
 */

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { TrafficEntry, JSONRPCRequest, JSONRPCResponse } from './types.js';

// ANSI color codes for debug logging
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

/**
 * Stored response entry with metadata for smart matching
 */
interface StoredResponse {
  entry: TrafficEntry;
  requestParams?: Record<string, unknown>;
  argumentsHash: string;
}

/**
 * Replays recorded traffic responses with argument-aware smart matching
 */
export class TrafficReplayer {
  private entries: Map<string, StoredResponse[]> = new Map();
  private debug: boolean;
  private similarityThreshold: number;

  constructor(debug: boolean = false, similarityThreshold: number = 70) {
    this.debug = debug;
    this.similarityThreshold = similarityThreshold / 100; // Convert to 0-1 range
  }

  /**
   * Debug log helper
   */
  private debugLog(message: string, color: string = BLUE): void {
    if (this.debug) {
      console.error(`${color}[DEBUG]${RESET} ${message}`);
    }
  }

  /**
   * Generate a composite key for smart matching
   * Format: "method:name" for tools/call and prompts/get
   * Format: "method" for other methods
   */
  private getCompositeKey(method: string, params?: Record<string, unknown> | unknown[]): string {
    // For tools/call and prompts/get, include the tool/prompt name
    if ((method === 'tools/call' || method === 'prompts/get') && params && typeof params === 'object' && !Array.isArray(params)) {
      const name = (params as { name?: string }).name;
      if (name) {
        return `${method}:${name}`;
      }
    }
    return method;
  }

  /**
   * Extract clean arguments (remove _meta and other non-semantic fields)
   */
  private getCleanArguments(params?: Record<string, unknown>): Record<string, unknown> {
    if (!params) return {};
    
    const cleanArgs: Record<string, unknown> = {};
    
    // For tools/call and prompts/get, extract the arguments field
    if (params.arguments && typeof params.arguments === 'object') {
      const args = params.arguments as Record<string, unknown>;
      // Remove metadata fields
      for (const [key, value] of Object.entries(args)) {
        if (key !== '_meta' && !key.startsWith('_')) {
          cleanArgs[key] = value;
        }
      }
    }
    
    return cleanArgs;
  }

  /**
   * Generate hash for arguments to identify exact matches
   */
  private getArgumentsHash(args: Record<string, unknown>): string {
    if (Object.keys(args).length === 0) {
      return 'no-args';
    }
    
    // Sort keys for consistent hashing
    const sortedArgs = Object.keys(args).sort().reduce((acc, key) => {
      acc[key] = args[key];
      return acc;
    }, {} as Record<string, unknown>);
    
    const argsStr = JSON.stringify(sortedArgs);
    return createHash('md5').update(argsStr).digest('hex').substring(0, 8);
  }

  /**
   * Calculate argument similarity score (0-1, higher is better)
   */
  private calculateArgumentSimilarity(args1: Record<string, unknown>, args2: Record<string, unknown>): number {
    const keys1 = Object.keys(args1);
    const keys2 = Object.keys(args2);
    
    if (keys1.length === 0 && keys2.length === 0) return 1.0;
    if (keys1.length === 0 || keys2.length === 0) return 0.0;
    
    // Count matching keys and values
    let matches = 0;
    let total = Math.max(keys1.length, keys2.length);
    
    for (const key of keys1) {
      if (key in args2) {
        // Key exists in both
        if (JSON.stringify(args1[key]) === JSON.stringify(args2[key])) {
          matches += 1; // Perfect match
        } else {
          matches += 0.5; // Partial match (key exists but different value)
        }
      }
    }
    
    return matches / total;
  }

  /**
   * Load traffic from JSONL file with argument-aware indexing
   */
  async load(filePath: string): Promise<void> {
    this.debugLog(`Loading traffic from: ${filePath}`);
    const content = await readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    this.debugLog(`Total lines in file: ${lines.length}`);

    // First pass: separate requests and responses
    const requests = new Map<string | number, TrafficEntry>();
    const responses = new Map<string | number, TrafficEntry>();

    for (const line of lines) {
      if (!line.trim()) continue;

      const entry = JSON.parse(line) as TrafficEntry;
      
      if (entry.direction === 'request' && entry.id !== null) {
        requests.set(entry.id, entry);
        this.debugLog(`  Request ID ${entry.id}: ${entry.method}`);
      } else if (entry.direction === 'response' && entry.id !== null) {
        responses.set(entry.id, entry);
        this.debugLog(`  Response ID ${entry.id}`);
      }
    }

    this.debugLog(`Found ${requests.size} requests and ${responses.size} responses`);

    // Second pass: match responses to requests and store with argument metadata
    for (const [id, request] of requests.entries()) {
      const response = responses.get(id);
      
      if (response && request.method) {
        // Generate composite key (method + tool/prompt name)
        const compositeKey = this.getCompositeKey(request.method, request.params);
        
        // Extract clean arguments for similarity matching
        const cleanArgs = this.getCleanArguments(request.params as Record<string, unknown>);
        const argsHash = this.getArgumentsHash(cleanArgs);
        
        if (!this.entries.has(compositeKey)) {
          this.entries.set(compositeKey, []);
          this.debugLog(`  Created entry group for key: ${compositeKey}`, CYAN);
        }
        
        // Store the response with argument metadata
        const stored: StoredResponse = {
          entry: response,
          requestParams: request.params as Record<string, unknown>,
          argumentsHash: argsHash
        };
        
        this.entries.get(compositeKey)!.push(stored);
        
        if (Object.keys(cleanArgs).length > 0) {
          this.debugLog(`  Indexed: ${compositeKey} [args: ${JSON.stringify(cleanArgs)}, hash: ${argsHash}]`);
        } else {
          this.debugLog(`  Indexed: ${compositeKey} [no arguments]`);
        }
      }
    }

    // Log summary
    this.debugLog(`\nTraffic loading summary:`, CYAN);
    for (const [key, storedResponses] of this.entries.entries()) {
      const uniqueHashes = new Set(storedResponses.map(sr => sr.argumentsHash));
      this.debugLog(`  "${key}": ${storedResponses.length} response(s), ${uniqueHashes.size} unique argument pattern(s)`, CYAN);
    }
  }

  /**
   * Get recorded response for a request with argument-aware smart matching
   * Returns both the response and the entry metadata (for logging)
   */
  getResponse(request: JSONRPCRequest): { response: JSONRPCResponse; entry: TrafficEntry } | null {
    const method = request.method;
    const compositeKey = this.getCompositeKey(method, request.params);
    const requestArgs = this.getCleanArguments(request.params as Record<string, unknown>);
    const requestArgsHash = this.getArgumentsHash(requestArgs);
    
    this.debugLog(`\n${MAGENTA}=== Replay Matching Analysis ===${RESET}`, MAGENTA);
    this.debugLog(`Incoming request:`);
    this.debugLog(`  Method: ${method}`);
    this.debugLog(`  ID: ${request.id}`);
    this.debugLog(`  Params: ${JSON.stringify(request.params, null, 2)}`);
    this.debugLog(`  Composite key: "${compositeKey}"`, CYAN);
    this.debugLog(`  Arguments: ${JSON.stringify(requestArgs)}`, CYAN);
    this.debugLog(`  Arguments hash: ${requestArgsHash}`, CYAN);
    
    // Try to find entries for the composite key
    const storedResponses = this.entries.get(compositeKey);

    if (!storedResponses || storedResponses.length === 0) {
      this.debugLog(`${MAGENTA}Match result: NOT FOUND${RESET}`, MAGENTA);
      this.debugLog(`  Reason: No recorded responses for key "${compositeKey}" or method "${method}"`);
      this.debugLog(`  Available keys:`, CYAN);
      const sortedKeys = Array.from(this.entries.keys()).sort();
      for (const key of sortedKeys) {
        const count = this.entries.get(key)?.length || 0;
        this.debugLog(`    - "${key}" (${count} response(s))`, CYAN);
      }
      this.debugLog(`  Fallback: Will generate mock data with Faker`, YELLOW);
      this.debugLog(`${MAGENTA}===================================${RESET}\n`, MAGENTA);
      return null;
    }

    this.debugLog(`${GREEN}Candidate responses found: ${storedResponses.length}${RESET}`, GREEN);
    
    // Level 1: Try exact match (composite key + argument hash)
    this.debugLog(`  Looking for exact match...`, CYAN);
    for (let i = 0; i < storedResponses.length; i++) {
      const stored = storedResponses[i];
      if (stored.argumentsHash === requestArgsHash) {
        this.debugLog(`${GREEN}\u2713${RESET} Level 1: Exact match found (hash: ${requestArgsHash})`, GREEN);
        this.debugLog(`${MAGENTA}===================================${RESET}\n`, MAGENTA);
        
        // Build JSONRPCResponse from TrafficEntry
        const response: JSONRPCResponse = {
          jsonrpc: '2.0',
          id: request.id ?? null
        };
        if (stored.entry.error) {
          response.error = stored.entry.error;
        } else {
          response.result = stored.entry.result;
        }
        
        return { response, entry: stored.entry };
      }
    }
    
    // Level 2: Try similar match (composite key + similarity score above threshold)
    this.debugLog(`  No exact match found`, CYAN);
    this.debugLog(`  Calculating similarity scores (threshold: ${(this.similarityThreshold * 100).toFixed(0)}%)...`, CYAN);
    
    const candidates = storedResponses.map((stored) => {
      const storedArgs = this.getCleanArguments(stored.requestParams);
      const similarity = this.calculateArgumentSimilarity(requestArgs, storedArgs);
      return { stored, similarity };
    });
    
    // Sort by similarity (highest first)
    candidates.sort((a, b) => b.similarity - a.similarity);
    
    // Log all candidates
    for (let i = 0; i < candidates.length; i++) {
      const { stored, similarity } = candidates[i];
      const meetsThreshold = similarity >= this.similarityThreshold;
      const checkMark = meetsThreshold ? `${GREEN}\u2713${RESET}` : `${RED}\u2717${RESET}`;
      const thresholdNote = meetsThreshold ? '' : ` (below ${(this.similarityThreshold * 100).toFixed(0)}% threshold)`;
      this.debugLog(
        `    [${i + 1}] Hash: ${stored.argumentsHash} | Similarity: ${(similarity * 100).toFixed(2)}% ${checkMark}${thresholdNote}`
      );
    }
    
    // Check if best candidate meets threshold
    if (candidates.length > 0 && candidates[0].similarity >= this.similarityThreshold) {
      this.debugLog(
        `${GREEN}\u2713${RESET} Level 2: Best similar match (${(candidates[0].similarity * 100).toFixed(2)}% similarity)`,
        GREEN
      );
      this.debugLog(`${MAGENTA}===================================${RESET}\n`, MAGENTA);
      
      // Build JSONRPCResponse from TrafficEntry
      const response: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: request.id ?? null
      };
      if (candidates[0].stored.entry.error) {
        response.error = candidates[0].stored.entry.error;
      } else {
        response.result = candidates[0].stored.entry.result;
      }
      
      return { response, entry: candidates[0].stored.entry };
    }
    
    // Level 3: No acceptable match found, fall back to Faker
    this.debugLog(`${RED}\u2717${RESET} No match above ${(this.similarityThreshold * 100).toFixed(0)}% threshold`, RED);
    this.debugLog(`  Reason: ${candidates.length > 0 ? 'Similarity too low' : 'No candidates available'}`, YELLOW);
    this.debugLog(`  Fallback: Will generate mock data with Faker`, YELLOW);
    this.debugLog(`${MAGENTA}===================================${RESET}\n`, MAGENTA);
    return null;
  }

  /**
   * Check if replayer has responses for a method
   */
  hasMethod(method: string): boolean {
    const entries = this.entries.get(method);
    return entries !== undefined && entries.length > 0;
  }

  /**
   * Get statistics
   */
  getStats(): { methods: string[]; totalResponses: number } {
    const methods: string[] = [];
    let totalResponses = 0;

    for (const [key, entries] of this.entries.entries()) {
      if (!key.startsWith('request:') && !key.startsWith('response:')) {
        methods.push(key);
        totalResponses += entries.length;
      }
    }

    return { methods, totalResponses };
  }
}
