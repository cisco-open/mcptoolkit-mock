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
   * Generate a mock value from a JSON Schema node.
   *
   * Handles the common subset of JSON Schema types used in MCP outputSchema
   * declarations: object, array, string, number, integer, boolean, null, and
   * enum.  Complex keywords (allOf / anyOf / oneOf / $ref) are left for a
   * future iteration and fall back to `null`.
   *
   * @param schema - JSON Schema object node
   * @param hint   - Property name hint used to produce more realistic strings
   */
  generateFromSchema(schema: Record<string, unknown>, hint?: string): unknown {
    if (!schema || typeof schema !== 'object') {
      return null;
    }

    // enum — return the first enumerated value
    if (Array.isArray((schema as any).enum)) {
      return (schema as any).enum[0];
    }

    // const — return the constant value
    if ('const' in schema) {
      return (schema as any).const;
    }

    const type = (schema as any).type;
    const effectiveType = Array.isArray(type)
      ? (type.find((t: string) => t !== 'null') ?? 'null')
      : type;

    switch (effectiveType) {
      case 'object': {
        const properties = (schema as any).properties as Record<string, unknown> | undefined;
        if (!properties) return {};
        const result: Record<string, unknown> = {};
        for (const [key, propSchema] of Object.entries(properties)) {
          result[key] = this.generateFromSchema(propSchema as Record<string, unknown>, key);
        }
        return result;
      }

      case 'array': {
        const items = (schema as any).items as Record<string, unknown> | undefined;
        if (!items) return [];
        const minItems = (schema as any).minItems as number | undefined;
        const count = minItems && minItems > 0 ? minItems : 1;
        return Array.from({ length: count }, () => this.generateFromSchema(items));
      }

      case 'string': {
        const format = (schema as any).format as string | undefined;
        if (format === 'date-time') return new Date().toISOString();
        if (format === 'date') return new Date().toISOString().split('T')[0];
        if (format === 'time') return new Date().toISOString().split('T')[1].split('.')[0];
        if (format === 'uri' || format === 'url') return 'https://example.com/mock';
        if (format === 'email') return 'mock@example.com';
        if (format === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';
        if (format === 'hostname') return 'mock-host.example.com';
        const h = (hint || 'value').toLowerCase();
        if (h.endsWith('id') || h === 'id') return `mock-${hint}-001`;
        if (h.includes('name')) return `Mock ${hint}`;
        if (h.includes('status') || h.includes('state')) return 'active';
        if (h.includes('url') || h.includes('uri') || h.includes('href')) return 'https://example.com/mock';
        if (h.includes('email')) return 'mock@example.com';
        if (h.includes('description') || h.includes('message') || h.includes('text')) return `Mock ${hint} text`;
        return `mock-${hint ?? 'value'}`;
      }

      case 'integer':
      case 'number': {
        const minimum = (schema as any).minimum as number | undefined;
        const maximum = (schema as any).maximum as number | undefined;
        if (typeof minimum === 'number' && typeof maximum === 'number') {
          return effectiveType === 'integer'
            ? Math.floor((minimum + maximum) / 2)
            : (minimum + maximum) / 2;
        }
        if (typeof minimum === 'number') return minimum;
        return effectiveType === 'integer' ? 42 : 42.0;
      }

      case 'boolean':
        return true;

      case 'null':
        return null;

      default:
        // Unknown or missing type — fall back to null
        return null;
    }
  }

  /**
   * Generate mock response data for a tool call.
   *
   * Priority:
   * 1. When the tool declares an `outputSchema`, generate data that conforms
   *    to that schema so `structuredContent` can be populated correctly.
   * 2. Otherwise fall back to the legacy success-envelope object.
   *
   * @param tool - Tool definition from mcpdesc
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
      let mockData: unknown;

      if (tool.outputSchema) {
        // Generate data shaped by the declared outputSchema so that the mock
        // produces schema-valid structured output rather than a generic envelope.
        mockData = this.generateFromSchema(tool.outputSchema as Record<string, unknown>);
      } else {
        // Legacy fallback: generic success envelope (no outputSchema declared)
        mockData = {
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
      }

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
