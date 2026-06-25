// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Faker generator - Generate mock data from JSON schemas
 */

import type { Tool } from './types.js';

/**
 * Generate mock data from tool schemas with caching
 */
export class FakerGenerator {
  private cache: Map<string, unknown>;

  constructor() {
    this.cache = new Map();
  }

  /**
   * Generate cache key from tool name and arguments
   */
  private getCacheKey(toolName: string, args: Record<string, unknown>): string {
    // Sort keys for consistent cache keys regardless of argument order
    const sortedArgs = Object.keys(args)
      .sort()
      .reduce((acc, key) => {
        acc[key] = args[key];
        return acc;
      }, {} as Record<string, unknown>);
    
    return `${toolName}:${JSON.stringify(sortedArgs)}`;
  }

  /**
   * Generate mock response data for a tool call
   * 
   * @param tool - Tool definition from dump
   * @param args - Arguments passed to the tool
   * @returns Generated mock data (cached for consistency)
   */
  async generate(tool: Tool, args: Record<string, unknown> = {}): Promise<unknown> {
    const cacheKey = this.getCacheKey(tool.name, args);

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Generate mock data from schema
    try {
      // For tools without explicit response schema, generate a simple success object
      // In real MCP, tools return arbitrary JSON based on their function
      const mockData = {
        success: true,
        timestamp: new Date().toISOString(),
        data: {
          // Echo the request parameters
          ...args,
          // Add some random generated data
          id: Math.floor(Math.random() * 1000) + 1,
          status: 'completed'
        }
      };

      // Cache the result
      this.cache.set(cacheKey, mockData);
      return mockData;
    } catch (error) {
      const { MockDataGenerationError } = await import('./types.js');
      throw new MockDataGenerationError(
        `Failed to generate mock data for tool "${tool.name}": ${error instanceof Error ? error.message : String(error)}`,
        tool.name
      );
    }
  }

  /**
   * Clear the cache (useful for testing)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}
